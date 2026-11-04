// /api/sort – ordnet eine Freitext-Eingabe aus dem Eingang einer Liste zu (Claude API)
// POST { text, today, examples:[{text,target}] } -> { target, title, date|null, why }
// Umgebungsvariablen: ANTHROPIC_API_KEY (gesetzt), optional ANTHROPIC_MODEL (Standard: claude-haiku-5-5)
// Es wird nichts gespeichert; der Text geht nur für diese eine Anfrage an die KI.

const TARGETS = {
  things:    '100 Things – etwas, das Chris irgendwann erleben, lernen, können oder ausprobieren will (ohne Datum)',
  misogi:    'Misogi-Idee – eine große Jahresherausforderung, bei der unsicher ist, ob er sie schafft (Alpenüberquerung, 200 km Rad, Triathlon, mehrtägig solo)',
  reise:     'Reise-Idee – ein Ort oder eine Reise ohne konkretes Datum (Lissabon im Herbst, Nachtzug nach Wien, ein Monat in einer Stadt)',
  abenteuer: 'Erlebnis mit Datum – Ausflug, Wochenende, Festival, Treffen, Reise mit erkennbarem Zeitpunkt (Pfingsten, im Mai, nächsten Samstag)',
  build:     'Build-Idee – etwas mit den Händen bauen oder basteln (Regal, Lampe, Minibar, Paletten-Lounge, Holz, DIY)',
  alive:     "Lebendig – ein Moment, der bereits passiert ist und gutgetan hat (Vergangenheitsform, 'war schön', 'davon mehr')",
  notiz:     'Notiz – ein Gedanke, Zitat, eine Frage oder Überlegung ohne Handlungsbezug',
  todo:      'Erledigung – eine Pflichtaufgabe mit Handlungsbezug (anrufen, bezahlen, Termin, Rechnung, Antrag), gehört in den Arbeitsbereich',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(503).json({ error: 'ANTHROPIC_API_KEY fehlt' }); return; }
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
  const text = String(b.text || '').slice(0, 1000).trim();
  if (!text) { res.status(400).json({ error: 'text fehlt' }); return; }
  const today = /^\d{4}-\d{2}-\d{2}$/.test(b.today || '') ? b.today : new Date().toISOString().slice(0, 10);
  const examples = Array.isArray(b.examples) ? b.examples.filter(e => e && TARGETS[e.target] && e.text).slice(0, 30) : [];

  const system = `Du sortierst kurze Freitext-Eingaben eines Nutzers (Chris, Bayern) in genau eine Liste seiner Lebens-App ein. Antworte ausschließlich mit einem JSON-Objekt, ohne Erklärtext:
{"target": <einer der Schlüssel>, "title": <kurzer, sauberer Titel in Chris' Worten, max. 80 Zeichen, ohne Datumsangabe>, "date": <"YYYY-MM-DD" wenn ein Zeitpunkt erkennbar ist, sonst null>, "why": <höchstens 8 Wörter Begründung auf Deutsch>}

Listen:
${Object.entries(TARGETS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Regeln: Heutiges Datum ist ${today}. Ungefähre Zeitangaben werden zu einem plausiblen Datum ("im Mai" -> 15. Mai des nächsten passenden Jahres, "Pfingsten" -> Pfingstsonntag des nächsten Jahres, "Anfang" -> 5., "Ende" -> 25.). Vergangenes mit positivem Gefühl ist "alive". Pflichtaufgaben sind "todo". Im Zweifel zwischen things und notiz: things, wenn es etwas zu erleben oder zu lernen gibt.`;
  const shots = examples.map(e => `Eingabe: ${e.text}\n-> ${e.target}`).join('\n');
  const user = (shots ? `So hat Chris frühere Eingaben selbst einsortiert (Vorrang vor allgemeinen Regeln):\n${shots}\n\n` : '') + `Eingabe: ${text}\n-> JSON:`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 200, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) { res.status(502).json({ error: 'anthropic ' + r.status, detail: (await r.text()).slice(0, 300) }); return; }
    const j = await r.json();
    const out = (j.content || []).map(c => c.text || '').join('');
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) { res.status(502).json({ error: 'kein JSON', raw: out.slice(0, 200) }); return; }
    const p = JSON.parse(m[0]);
    if (!TARGETS[p.target]) p.target = 'notiz';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) p.date = null;
    res.status(200).json({ target: p.target, title: String(p.title || text).slice(0, 120), date: p.date, why: String(p.why || '').slice(0, 80) });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
