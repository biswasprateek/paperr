const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../auth/middleware');
const backupService = require('../services/backupService');

router.use(requireAuth, requireAdmin);

router.get('/settings', (req, res) => {
  res.json(backupService.getSettings());
});

router.put('/settings', (req, res) => {
  const { auto_enabled, frequency, retention_days } = req.body;
  if (frequency !== undefined && !['daily', 'weekly', 'monthly'].includes(frequency)) {
    return res.status(400).json({ error: 'frequency must be daily, weekly, or monthly' });
  }
  if (retention_days !== undefined && (!Number.isInteger(retention_days) || retention_days < 0)) {
    return res.status(400).json({ error: 'retention_days must be a non-negative integer' });
  }
  res.json(backupService.updateSettings({ auto_enabled, frequency, retention_days }));
});

router.get('/', (req, res) => {
  res.json(backupService.listBackups());
});

router.post('/', (req, res) => {
  try {
    const backup = backupService.createBackup({ type: 'manual', userId: req.user.id, userName: req.user.display_name });
    res.status(201).json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restore', (req, res) => {
  try {
    backupService.restoreBackup(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const deleted = backupService.deleteBackup(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Backup not found' });
  res.json({ success: true });
});

module.exports = router;
