// /api/push – Web-Push-Erinnerungen für den Bereich Leben (ESM, Postgres über DATABASE_URL wie api/sync.js)
//
// GET  ?pubkey=1               -> { publicKey }   VAPID-Public-Key für das Abo im Browser
// POST { sub, tz, device }     -> Abo speichern
// DELETE { endpoint }          -> Abo löschen
// POST ?test=1 { endpoint }    -> Testnachricht an genau dieses Gerät
// GET  ?cron=1                 -> fällige Erinnerungen nach Berliner Zeit senden (idempotent, max. 1x pro Tag und Erinnerung)
//
// Keine zusätzlichen Umgebungsvariablen nötig: Die VAPID-Schlüssel werden beim ersten Aufruf erzeugt und in der
// Tabelle push_config abgelegt. Optional: CRON_SECRET (dann muss der Auslöser ihn als Header x-cron-secret,
// Query ?secret= oder Bearer-Token mitschicken) und VAPID_SUBJECT (mailto:…).
import pg from 'pg';
import webpush from 'web-push';
const { Pool } = pg;

let pool;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  return pool;
}
let tableReady;
function ensureTables(p) {
  if (!tableReady) tableReady = (async () => {
    await p.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY, sub TEXT NOT NULL, tz TEXT, device TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);
    await p.query(`CREATE TABLE IF NOT EXISTS push_log (key TEXT PRIMARY KEY, sent_at BIGINT NOT NULL)`);
    await p.query(`CREATE TABLE IF NOT EXISTS push_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  })();
  return tableReady;
}

/* Erinnerungen – Berliner Zeit. Das Fenster ist 30 Minuten breit, damit auch ein verspäteter Auslöser trifft;
   push_log sorgt dafür, dass jede Erinnerung trotzdem nur einmal pro Tag rausgeht. */
// window = Nachhol-Fenster in Minuten ab der Zielzeit. Bewusst breit, weil der Auslöser
// (GitHub-Actions-Zeitplan) oft nur alle paar Stunden läuft; so wird die Erinnerung auch bei
// einem verspäteten Lauf noch zugestellt. push_log sorgt für max. 1x pro Tag. Nacht-Grenze
// (abends bis 23:30) verhindert Zustellung mitten in der Nacht.
const REMINDERS = [
  { id: 'abend',  hour: 21, minute: 0,  window: 150, when: () => true,
    title: 'Was war heute schön?', body: '2 Minuten. Eine Antwort reicht.', url: '/?open=abend' },
  { id: 'woche',  hour: 18, minute: 0,  window: 240, when: (b) => b.weekday === 'Sun',
    title: '10 Minuten für dein Leben', body: 'Was hat diese Woche gutgetan?', url: '/?open=woche' },
  { id: 'monat',  hour: 18, minute: 15, window: 225, when: (b) => b.weekday === 'Sun' && b.day <= 7,
    title: 'Was möchtest du diesen Monat erleben?', body: '20 Minuten Gestaltung – dann steht es im Kalender.', url: '/?open=monat' },
  { id: 'things', hour: 18, minute: 0,  window: 240, when: (b) => b.day === 15,
    title: '10 Minuten Inspiration', body: 'Was fehlt auf deiner 100 Things? Was reizt dich gerade?', url: '/?open=things' },
];
const WINDOW_MIN = 30;

export function berlinNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour12: false,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(d).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return { weekday: p.weekday, day: +p.day, hour: +p.hour % 24, minute: +p.minute, date: `${p.year}-${p.month}-${p.day}` };
}
export function dueReminders(b) {
  const now = b.hour * 60 + b.minute;
  return REMINDERS.filter(r => { const start = r.hour * 60 + r.minute; return r.when(b) && now >= start && now < start + (r.window || WINDOW_MIN); });
}

async function vapidKeys(p) {
  const r = await p.query('SELECT key, value FROM push_config WHERE key IN ($1,$2)', ['vapid_public', 'vapid_private']);
  let pub = r.rows.find(x => x.key === 'vapid_public')?.value, priv = r.rows.find(x => x.key === 'vapid_private')?.value;
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await p.query('INSERT INTO push_config (key, value) VALUES ($1,$2), ($3,$4) ON CONFLICT (key) DO NOTHING', ['vapid_public', k.publicKey, 'vapid_private', k.privateKey]);
    const again = await p.query('SELECT key, value FROM push_config WHERE key IN ($1,$2)', ['vapid_public', 'vapid_private']);
    pub = again.rows.find(x => x.key === 'vapid_public').value; priv = again.rows.find(x => x.key === 'vapid_private').value;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:selbstorga@example.com', pub, priv);
  return pub;
}
async function sendTo(p, row, payload) {
  try { await webpush.sendNotification(JSON.parse(row.sub), JSON.stringify(payload), { TTL: 3600 }); return 'ok'; }
  catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { await p.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]).catch(() => {}); return 'gone'; }
    return 'err:' + (e.statusCode || e.message);
  }
}
function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-cron-secret,authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!process.env.DATABASE_URL) { res.status(500).json({ error: 'DATABASE_URL ist nicht gesetzt' }); return; }
  const q = req.query || {};
  const p = getPool();
  try {
    await ensureTables(p);

    if (req.method === 'GET' && q.pubkey) { res.status(200).json({ publicKey: await vapidKeys(p) }); return; }

    if (req.method === 'GET' && q.cron) {
      if (process.env.CRON_SECRET) {
        const secret = req.headers['x-cron-secret'] || q.secret || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (secret !== process.env.CRON_SECRET) { res.status(401).json({ error: 'unauthorized' }); return; }
      }
      const b = berlinNow();
      const due = dueReminders(b);
      const report = { berlin: b, due: due.map(r => r.id), sent: {} };
      if (due.length) {
        await vapidKeys(p);
        const subs = (await p.query('SELECT endpoint, sub FROM push_subscriptions')).rows;
        report.subscriptions = subs.length;
        for (const r of due) {
          const claim = await p.query('INSERT INTO push_log (key, sent_at) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING RETURNING key', [r.id + ':' + b.date, Date.now()]);
          if (!claim.rows.length) { report.sent[r.id] = 'already'; continue; }
          report.sent[r.id] = await Promise.all(subs.map(s => sendTo(p, s, { title: r.title, body: r.body, url: r.url, tag: r.id })));
        }
        await p.query('DELETE FROM push_log WHERE sent_at < $1', [Date.now() - 40 * 86400000]).catch(() => {});
      }
      res.status(200).json(report); return;
    }

    if (req.method === 'POST' && q.test) {
      const { endpoint } = body(req);
      const r = await p.query('SELECT endpoint, sub FROM push_subscriptions WHERE endpoint = $1', [endpoint || '']);
      if (!r.rows.length) { res.status(404).json({ error: 'kein Abo für dieses Gerät' }); return; }
      await vapidKeys(p);
      res.status(200).json({ result: await sendTo(p, r.rows[0], { title: 'Erinnerungen aktiv 🔔', body: 'So sieht ein Anstoß aus. Abends um 21 Uhr geht es los.', url: '/', tag: 'test' }) }); return;
    }

    if (req.method === 'POST') {
      const { sub, tz, device } = body(req);
      if (!sub || !sub.endpoint) { res.status(400).json({ error: 'sub fehlt' }); return; }
      const now = Date.now();
      await p.query(`INSERT INTO push_subscriptions (endpoint, sub, tz, device, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)
        ON CONFLICT (endpoint) DO UPDATE SET sub = EXCLUDED.sub, tz = EXCLUDED.tz, device = EXCLUDED.device, updated_at = EXCLUDED.updated_at`,
        [sub.endpoint, JSON.stringify(sub), tz || 'Europe/Berlin', String(device || '').slice(0, 160), now]);
      res.status(200).json({ ok: true }); return;
    }

    if (req.method === 'DELETE') {
      const { endpoint } = body(req);
      if (endpoint) await p.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
      res.status(200).json({ ok: true }); return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
