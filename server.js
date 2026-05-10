import express from 'express';
import { createClient } from '@libsql/client';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// DB — Turso in production, local SQLite file in dev
const db = createClient({
  url: process.env.TURSO_URL || 'file:macrelle.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await db.execute(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));

// Auth middleware — only active when AUTH_TOKEN env var is set
const AUTH_TOKEN = process.env.AUTH_TOKEN;
app.use('/api', (req, res, next) => {
  if (!AUTH_TOKEN) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// Gemini proxy — key never reaches the browser
app.post('/api/food', async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const prompt = `You are a nutrition database. The user logged: "${text}"

Rules:
1. QUANTITIES — If a number is stated (e.g. "9 garlic breads", "3 eggs"), multiply all macros by that number. Return the TOTAL for the amount logged, not per-serving.
2. CUSTOM RECIPES — If the item is described with its ingredients (e.g. "tea made with 100ml milk and 1 tsp sugar"), return each ingredient as a separate item with macros for the exact amount stated. Do not return a generic "tea" entry.
3. MEASUREMENTS — Honour units (100ml, 200g, 1 cup, 1 tbsp). Calculate macros for the exact quantity stated.

Return ONLY a JSON array. Each item: name (string), cals (integer), protein_g (integer), carbs_g (integer), fat_g (integer).
No markdown, no explanation — raw JSON array only.
Example: [{"name":"Garlic bread x9","cals":1170,"protein_g":27,"carbs_g":162,"fat_g":45}]`;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }) }
    );
    if (!r.ok) {
      const errBody = await r.text();
      console.error('Gemini bad response:', r.status, errBody);
      return res.status(502).json({ error: 'Gemini error' });
    }
    const data = await r.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const items = JSON.parse(raw);
    res.json(Array.isArray(items) ? items : []);
  } catch (e) {
    console.error('Gemini error:', e.message);
    res.status(502).json({ error: 'Gemini failed' });
  }
});

// GET /api/data/:key
app.get('/api/data/:key', async (req, res) => {
  const { rows } = await db.execute({ sql: 'SELECT value FROM kv WHERE key=?', args: [req.params.key] });
  if (!rows.length) return res.json(null);
  try { res.json(JSON.parse(rows[0].value)); } catch { res.json(rows[0].value); }
});

// PUT /api/data/:key
app.put('/api/data/:key', async (req, res) => {
  await db.execute({ sql: 'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', args: [req.params.key, JSON.stringify(req.body)] });
  res.json({ ok: true });
});

// DELETE /api/data/:key
app.delete('/api/data/:key', async (req, res) => {
  await db.execute({ sql: 'DELETE FROM kv WHERE key=?', args: [req.params.key] });
  res.json({ ok: true });
});

// GET /api/data?prefix=log_
app.get('/api/data', async (req, res) => {
  const prefix = (req.query.prefix || '') + '%';
  const { rows } = await db.execute({ sql: 'SELECT key, value FROM kv WHERE key LIKE ?', args: [prefix] });
  const result = {};
  rows.forEach(r => { try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; } });
  res.json(result);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Macrelle backend → http://localhost:${PORT}`);
  console.log(`GEMINI_KEY set: ${!!process.env.GEMINI_KEY}`);
  console.log(`AUTH_TOKEN set: ${!!process.env.AUTH_TOKEN}`);
  console.log(`TURSO_URL set: ${!!process.env.TURSO_URL}`);
});
