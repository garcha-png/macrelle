import express from 'express';
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new Database(join(__dirname, 'macrelle.db'));

app.use(express.json());

// Serve built frontend in production
app.use(express.static(join(__dirname, 'dist')));

// Single KV table — mirrors the localStorage key structure exactly
db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

const get = db.prepare('SELECT value FROM kv WHERE key=?');
const upsert = db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)');
const del = db.prepare('DELETE FROM kv WHERE key=?');
const list = db.prepare("SELECT key, value FROM kv WHERE key LIKE ?");

// GET /api/data/:key
app.get('/api/data/:key', (req, res) => {
  const row = get.get(req.params.key);
  if (!row) return res.json(null);
  try { res.json(JSON.parse(row.value)); } catch { res.json(row.value); }
});

// PUT /api/data/:key  — body is the value (any JSON)
app.put('/api/data/:key', (req, res) => {
  upsert.run(req.params.key, JSON.stringify(req.body));
  res.json({ ok: true });
});

// DELETE /api/data/:key
app.delete('/api/data/:key', (req, res) => {
  del.run(req.params.key);
  res.json({ ok: true });
});

// GET /api/data?prefix=log_ — list all keys matching a prefix
app.get('/api/data', (req, res) => {
  const prefix = (req.query.prefix || '') + '%';
  const rows = list.all(prefix);
  const result = {};
  rows.forEach(r => {
    try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; }
  });
  res.json(result);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Macrelle backend → http://localhost:${PORT}`));
