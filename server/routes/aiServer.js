const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireAdmin } = require('../auth/middleware');
const supervisor = require('../ai/litertSupervisor');

function getLiteRTConfig(db) {
  return db.prepare("SELECT * FROM llm_configurations WHERE provider = 'LiteRT' LIMIT 1").get();
}

router.get('/status', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const config = getLiteRTConfig(db);
  return res.json({ ...supervisor.getStatus(), config });
});

router.post('/start', requireAuth, requireAdmin, (req, res) => {
  return res.json(supervisor.start());
});

router.post('/stop', requireAuth, requireAdmin, async (req, res) => {
  return res.json(await supervisor.stop());
});

router.get('/models', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { dir, models } = await supervisor.listModels();
    return res.json({ dir, models });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/models/open-folder', requireAuth, requireAdmin, async (req, res) => {
  try {
    return res.json(await supervisor.openModelsFolder());
  } catch (err) {
    return res.status(err.code === 'NOT_FOUND' ? 404 : 500).json({ error: err.message });
  }
});

router.post('/models/import', requireAuth, requireAdmin, (req, res) => {
  const { repo, file, name } = req.body;
  try {
    return res.json(supervisor.importModel({ repo, file, name }));
  } catch (err) {
    const status = err.code === 'INVALID_INPUT' ? 400 : err.code === 'IMPORT_BUSY' ? 409 : 500;
    return res.status(status).json({ error: err.message });
  }
});

router.delete('/models/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await supervisor.deleteModel(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(err.code === 'INVALID_INPUT' ? 400 : 500).json({ error: err.message });
  }
});

// Sets which imported model the bundled LiteRT provider uses — same field
// every other provider config already has, just scoped to the LiteRT row.
router.put('/active-model', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { model } = req.body;
  if (!model?.trim()) return res.status(400).json({ error: 'model is required' });

  const config = getLiteRTConfig(db);
  if (!config) return res.status(404).json({ error: 'LiteRT configuration not found' });

  db.prepare("UPDATE llm_configurations SET model = ?, updated_at = datetime('now') WHERE id = ?")
    .run(model.trim(), config.id);

  return res.json(db.prepare('SELECT * FROM llm_configurations WHERE id = ?').get(config.id));
});

module.exports = router;
