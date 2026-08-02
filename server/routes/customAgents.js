const express = require('express');
const { requireAuth, requireSpace } = require('../auth/middleware');
const { getDb } = require('../db/db');
const { customAgent, runAgentInstructions } = require('../ai/agents/customAgent');
const { LLMUnavailableError } = require('../ai/llmClient');
const logger = require('../utils/logger');

module.exports = function (io, scheduler) {
  const router = express.Router();

  router.get('/', requireAuth, requireSpace, (req, res) => {
    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM custom_agents WHERE space_id = ? AND (user_id = ? OR visibility = 'shared') ORDER BY created_at DESC"
    ).all(req.spaceId, req.user.id);
    res.json(rows);
  });

  router.post('/', requireAuth, requireSpace, (req, res) => {
    const { name, instructions, schedule_cron, enabled = 1, icon, visibility } = req.body;
    if (!name?.trim() || !instructions?.trim()) return res.status(400).json({ error: 'name and instructions are required' });
    if (!scheduler.isValidCron(schedule_cron)) return res.status(400).json({ error: 'schedule_cron must be a valid 5-field cron expression' });

    const db = getDb();
    const result = db.prepare(
      'INSERT INTO custom_agents (user_id, space_id, name, icon, instructions, schedule_cron, enabled, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, req.spaceId, name.trim(), icon || '🤖', instructions.trim(), schedule_cron.trim(), enabled ? 1 : 0, visibility === 'shared' ? 'shared' : 'personal');

    const row = db.prepare('SELECT * FROM custom_agents WHERE id = ?').get(result.lastInsertRowid);
    scheduler.registerCustomAgent(row);
    res.status(201).json(row);
  });

  router.patch('/:id', requireAuth, requireSpace, (req, res) => {
    const db = getDb();
    const existing = db.prepare(`
      SELECT * FROM custom_agents WHERE id = ? AND space_id = ? AND (user_id = ? OR visibility = 'shared')
    `).get(req.params.id, req.spaceId, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Agent not found' });

    const { name, instructions, schedule_cron, enabled, icon, visibility } = req.body;
    if (schedule_cron !== undefined && !scheduler.isValidCron(schedule_cron)) {
      return res.status(400).json({ error: 'schedule_cron must be a valid 5-field cron expression' });
    }

    db.prepare(`
      UPDATE custom_agents SET
        name          = COALESCE(?, name),
        icon          = COALESCE(?, icon),
        instructions  = COALESCE(?, instructions),
        schedule_cron = COALESCE(?, schedule_cron),
        enabled       = COALESCE(?, enabled),
        visibility    = COALESCE(?, visibility)
      WHERE id = ?
    `).run(
      name?.trim() ?? null,
      icon ?? null,
      instructions?.trim() ?? null,
      schedule_cron?.trim() ?? null,
      enabled === undefined ? null : (enabled ? 1 : 0),
      visibility === undefined ? null : (visibility === 'shared' ? 'shared' : 'personal'),
      existing.id
    );

    const row = db.prepare('SELECT * FROM custom_agents WHERE id = ?').get(existing.id);
    scheduler.registerCustomAgent(row); // re-registers; unregisters when disabled
    res.json(row);
  });

  router.delete('/:id', requireAuth, requireSpace, (req, res) => {
    const db = getDb();
    const existing = db.prepare(`
      SELECT id FROM custom_agents WHERE id = ? AND space_id = ? AND (user_id = ? OR visibility = 'shared')
    `).get(req.params.id, req.spaceId, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Agent not found' });
    scheduler.unregisterCustomAgent(existing.id);
    db.prepare('DELETE FROM custom_agents WHERE id = ?').run(existing.id);
    res.json({ ok: true });
  });

  // Dry-run: tries the instructions typed into the create/edit form directly
  // against the LLM, with no custom_agents row required and no DB writes —
  // lets the user iterate on wording before saving. Errors are surfaced
  // (unlike the scheduled runner, which fails silently) since the whole
  // point is telling the user why a draft isn't working.
  router.post('/test', requireAuth, requireSpace, async (req, res) => {
    const { name, instructions } = req.body;
    if (!instructions?.trim()) return res.status(400).json({ error: 'instructions are required' });

    try {
      const { report, proposal } = await runAgentInstructions({
        user: req.user,
        name: name?.trim() || 'Test agent',
        instructions: instructions.trim(),
        spaceId: req.spaceId,
      });
      if (!report) return res.status(422).json({ error: 'The model returned no report for these instructions.' });
      res.json({ report, proposal });
    } catch (err) {
      if (err instanceof LLMUnavailableError) {
        return res.status(503).json({ error: 'LLM unavailable', detail: err.message });
      }
      logger.info('custom agent test failed', { error: err.message });
      res.status(500).json({ error: 'Test run failed', detail: err.message });
    }
  });

  // Run once now (testing the instruction) — bypasses the schedule but keeps
  // the duplicate-report guard inside customAgent.
  router.post('/:id/run', requireAuth, requireSpace, async (req, res) => {
    const db = getDb();
    const existing = db.prepare(`
      SELECT * FROM custom_agents WHERE id = ? AND space_id = ? AND (user_id = ? OR visibility = 'shared')
    `).get(req.params.id, req.spaceId, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Agent not found' });
    if (!existing.enabled) return res.status(400).json({ error: 'Agent is disabled' });

    try {
      const insight = await customAgent(db, io, existing.id);
      if (!insight) {
        return res.status(409).json({ error: 'No report produced — the agent may already have an active report, or the LLM is unavailable.' });
      }
      res.json(insight);
    } catch (err) {
      logger.info('custom agent run-now failed', { customAgentId: existing.id, error: err.message });
      res.status(500).json({ error: 'Run failed', detail: err.message });
    }
  });

  return router;
};
