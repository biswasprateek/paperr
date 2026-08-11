const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireAdmin } = require('../auth/middleware');
const { pingLLM, fetchModels, LLMUnavailableError } = require('../ai/llmClient');
const updateService = require('../services/updateService');

router.get('/audit-log', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { userId, action, from, to, limit } = req.query;
  let query = `
    SELECT al.*, u.display_name, u.username
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (userId) { query += ' AND al.user_id = ?'; params.push(userId); }
  if (action) { query += ' AND al.action LIKE ?'; params.push(`%${action}%`); }
  if (from) { query += ' AND al.timestamp >= ?'; params.push(from); }
  if (to) { query += ' AND al.timestamp <= ?'; params.push(to); }
  query += ' ORDER BY al.timestamp DESC LIMIT ?';
  params.push(parseInt(limit) || 200);
  return res.json(db.prepare(query).all(...params));
});

router.get('/settings', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return res.json(settings);
});

router.put('/settings', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      upsert.run(key, String(value));
    }
  });
  tx();
  return res.json({ success: true });
});

// ── LLM Configurations ────────────────────────────────────────────────────────

function ensureActiveConfig(db) {
  const active = db.prepare('SELECT id FROM llm_configurations WHERE is_active = 1').get();
  if (!active) {
    const first = db.prepare('SELECT id FROM llm_configurations ORDER BY id LIMIT 1').get();
    if (first) db.prepare('UPDATE llm_configurations SET is_active = 1 WHERE id = ?').run(first.id);
  }
}

router.get('/llm-configurations', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  ensureActiveConfig(db);
  const rows = db.prepare('SELECT * FROM llm_configurations ORDER BY id ASC').all();
  return res.json(rows);
});

router.post('/llm-configurations', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const {
    name, provider = 'Custom',
    base_url = 'http://localhost:11434', api_key = '', model = 'llama3',
    temperature = 0.7, max_tokens = 2048, context_window = 4096,
    top_p = 1.0, frequency_penalty = 0.0, presence_penalty = 0.0,
    set_active = false,
  } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const result = db.prepare(`
    INSERT INTO llm_configurations
      (name, is_active, provider, base_url, api_key, model, temperature, max_tokens, context_window, top_p, frequency_penalty, presence_penalty)
    VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name.trim(), provider, base_url, api_key, model, temperature, max_tokens, context_window, top_p, frequency_penalty, presence_penalty);

  const newId = result.lastInsertRowid;

  if (set_active) {
    db.prepare('UPDATE llm_configurations SET is_active = 0').run();
    db.prepare('UPDATE llm_configurations SET is_active = 1 WHERE id = ?').run(newId);
  } else {
    ensureActiveConfig(db);
  }

  return res.status(201).json(db.prepare('SELECT * FROM llm_configurations WHERE id = ?').get(newId));
});

router.put('/llm-configurations/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM llm_configurations WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Configuration not found' });

  const {
    name, provider,
    base_url, api_key, model,
    temperature, max_tokens, context_window,
    top_p, frequency_penalty, presence_penalty,
  } = req.body;

  db.prepare(`
    UPDATE llm_configurations SET
      name              = COALESCE(?, name),
      provider          = COALESCE(?, provider),
      base_url          = COALESCE(?, base_url),
      api_key           = COALESCE(?, api_key),
      model             = COALESCE(?, model),
      temperature       = COALESCE(?, temperature),
      max_tokens        = COALESCE(?, max_tokens),
      context_window    = COALESCE(?, context_window),
      top_p             = COALESCE(?, top_p),
      frequency_penalty = COALESCE(?, frequency_penalty),
      presence_penalty  = COALESCE(?, presence_penalty),
      updated_at        = datetime('now')
    WHERE id = ?
  `).run(
    name?.trim() ?? null, provider ?? null,
    base_url ?? null, api_key ?? null, model ?? null,
    temperature ?? null, max_tokens ?? null, context_window ?? null,
    top_p ?? null, frequency_penalty ?? null, presence_penalty ?? null,
    id,
  );

  return res.json(db.prepare('SELECT * FROM llm_configurations WHERE id = ?').get(id));
});

router.delete('/llm-configurations/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const count = db.prepare('SELECT COUNT(*) AS n FROM llm_configurations').get().n;
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last configuration' });

  const cfg = db.prepare('SELECT * FROM llm_configurations WHERE id = ?').get(id);
  if (!cfg) return res.status(404).json({ error: 'Configuration not found' });

  db.prepare('DELETE FROM llm_configurations WHERE id = ?').run(id);

  if (cfg.is_active) ensureActiveConfig(db);

  return res.json({ success: true });
});

router.post('/llm-configurations/:id/activate', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const cfg = db.prepare('SELECT id FROM llm_configurations WHERE id = ?').get(id);
  if (!cfg) return res.status(404).json({ error: 'Configuration not found' });

  db.prepare('UPDATE llm_configurations SET is_active = 0').run();
  db.prepare('UPDATE llm_configurations SET is_active = 1 WHERE id = ?').run(id);

  return res.json({ success: true });
});

router.get('/llm-models', requireAuth, requireAdmin, async (req, res) => {
  const { base_url, api_key } = req.query;
  const db = getDb();
  const active = db.prepare('SELECT base_url, api_key FROM llm_configurations WHERE is_active = 1 LIMIT 1').get();
  const baseUrl = (base_url || active?.base_url || 'http://localhost:11434').trim();
  const apiKey  = (api_key  || active?.api_key  || '').trim();

  try {
    const models = await fetchModels(baseUrl, apiKey);
    return res.json({ models });
  } catch (err) {
    const status = err.code === 'ECONNREFUSED' || err.code === 'LLM_UNAVAILABLE' ? 503 : 500;
    return res.status(status).json({ error: err.message });
  }
});

router.get('/llm-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pingLLM();
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message });
  }
});

router.post('/export', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const tables = ['users', 'spaces', 'space_members', 'lists', 'tasks', 'task_tags',
    'task_comments', 'areas', 'projects', 'project_members',
    'phases', 'activity'];
  const data = {};
  for (const table of tables) {
    try { data[table] = db.prepare(`SELECT * FROM ${table}`).all(); } catch { data[table] = []; }
  }
  res.setHeader('Content-Disposition', 'attachment; filename=paperr-export.json');
  return res.json(data);
});

// ── Updates ───────────────────────────────────────────────────────────────────

// git errors carry the useful part on stderr.
const updateError = (err) => (err.stderr || err.message || '').trim();

router.get('/update', requireAuth, requireAdmin, async (req, res) => {
  try {
    return res.json(await updateService.check());
  } catch (err) {
    return res.status(500).json({ error: updateError(err) });
  }
});

let updating = false;

router.post('/update', requireAuth, requireAdmin, async (req, res) => {
  if (updating) return res.status(409).json({ error: 'An update is already running.' });
  updating = true;
  try {
    return res.json(await updateService.apply({ force: req.body?.force }));
  } catch (err) {
    return res.status(err.status || 500).json({ error: updateError(err) });
  } finally {
    updating = false;
  }
});

module.exports = router;
