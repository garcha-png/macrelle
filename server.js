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
  const prompt = `The user logged this food: "${text}"

Rules — follow exactly:
1. QUANTITIES: If a number is stated (e.g. "9 garlic breads", "3 eggs"), multiply all macros by that number and return ONE item with the TOTAL. Never return per-serving values when a quantity is given.
2. INGREDIENT BREAKDOWN: If the user describes a drink or dish by listing ingredients with amounts (e.g. "tea with 100ml milk and 1 tsp sugar"), return EACH ingredient as its own separate item. Never collapse into a single generic entry.
3. EXACT AMOUNTS: When specific measurements are given (100ml, 200g, 1 tbsp), calculate macros for that exact amount. Never substitute a generic serving size.
4. NO ZEROS: Never return 0 for a macro unless the food genuinely has none. Always estimate rather than return 0.
5. NOT FOOD: If the input is not a food or drink, return an empty array [].

Return ONLY a raw JSON array — no markdown, no explanation.
Schema: [{"name": string, "cals": integer, "protein_g": integer, "carbs_g": integer, "fat_g": integer}]

Examples:
"9 garlic breads" → [{"name":"Garlic bread ×9","cals":1170,"protein_g":27,"carbs_g":162,"fat_g":45}]
"tea with 100ml milk and 1 tsp sugar" → [{"name":"Milk (100ml)","cals":61,"protein_g":3,"carbs_g":5,"fat_g":3},{"name":"Sugar (1 tsp)","cals":16,"protein_g":0,"carbs_g":4,"fat_g":0}]
"200g chicken breast" → [{"name":"Chicken breast (200g)","cals":220,"protein_g":46,"carbs_g":0,"fat_g":5}]
"2 scrambled eggs" → [{"name":"Scrambled eggs ×2","cals":200,"protein_g":14,"carbs_g":2,"fat_g":14}]`;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'You are a precise nutrition database. Follow all quantity and ingredient instructions exactly. Return only valid JSON arrays.' }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        }) }
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
