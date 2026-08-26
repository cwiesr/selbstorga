// Serverless-Sync-Endpunkt für Selbstorga (Ende-zu-Ende-verschlüsselt).
// Speichert pro Datensatz-ID einen verschlüsselten Blob. Der Server sieht
// niemals die Passphrase oder Klartext-Daten.
//
// Benötigt die Umgebungsvariable DATABASE_URL (Postgres, z.B. Neon/Supabase/Vercel).
import pg from 'pg';
const { Pool } = pg;

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return pool;
}

let tableReady;
function ensureTable(p) {
  if (!tableReady) {
    tableReady = (async () => {
      await p.query(
        `CREATE TABLE IF NOT EXISTS sync_store (
           id TEXT PRIMARY KEY,
           data TEXT NOT NULL,
           updated_at BIGINT NOT NULL
         )`
      );
      await p.query(
        `CREATE TABLE IF NOT EXISTS sync_history (
           id TEXT NOT NULL,
           data TEXT NOT NULL,
           updated_at BIGINT NOT NULL,
           created_at BIGINT NOT NULL
         )`
      );
      await p.query(
        `CREATE INDEX IF NOT EXISTS sync_history_id_created
           ON sync_history (id, created_at DESC)`
      );
    })();
  }
  return tableReady;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: 'DATABASE_URL ist nicht gesetzt' });
    return;
  }

  const p = getPool();
  try {
    await ensureTable(p);

    if (req.method === 'GET') {
      const id = (req.query.id || '').toString();
      if (!id) { res.status(400).json({ error: 'id fehlt' }); return; }
      if (req.query.history) {
        const h = await p.query(
          'SELECT data, updated_at, created_at FROM sync_history WHERE id = $1 ORDER BY created_at DESC LIMIT 30',
          [id]
        );
        res.status(200).json({
          history: h.rows.map(r => ({ data: r.data, updated_at: Number(r.updated_at), created_at: Number(r.created_at) })),
        });
        return;
      }
      const r = await p.query('SELECT data, updated_at FROM sync_store WHERE id = $1', [id]);
      if (!r.rows.length) { res.status(200).json({ data: null }); return; }
      res.status(200).json({ data: r.rows[0].data, updated_at: Number(r.rows[0].updated_at) });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const { id, data, updated_at } = body || {};
      if (!id || typeof data !== 'string') { res.status(400).json({ error: 'id/data fehlt' }); return; }
      const ts = Number(updated_at) || Date.now();
      await p.query(
        `INSERT INTO sync_store (id, data, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [id, data, ts]
      );
      // append-only Historie + auf die letzten 50 Versionen je id begrenzen
      const now = Date.now();
      await p.query(
        'INSERT INTO sync_history (id, data, updated_at, created_at) VALUES ($1, $2, $3, $4)',
        [id, data, ts, now]
      );
      await p.query(
        `DELETE FROM sync_history WHERE id = $1 AND created_at NOT IN (
           SELECT created_at FROM sync_history WHERE id = $1 ORDER BY created_at DESC LIMIT 50
         )`,
        [id]
      );
      res.status(200).json({ ok: true, updated_at: ts });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
