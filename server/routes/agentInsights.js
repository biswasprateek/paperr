const express = require('express');
const { requireAuth, requireSpace } = require('../auth/middleware');
const { getDb } = require('../db/db');
const { handleToolCall } = require('../ai/toolHandler');
const { morningBrief } = require('../ai/agents/morningBrief');
const { rescheduleAdvisor } = require('../ai/agents/rescheduleAdvisor');
const { workloadSpread } = require('../ai/agents/workloadSpread');
const { bulletinBoard } = require('../ai/agents/bulletinBoard');
const { priorityFocus } = require('../ai/agents/priorityFocus');
const { todayLocal } = require('../ai/agents/utils');
const logger = require('../utils/logger');

// Ad-hoc "run now" for the hardcoded pre-built agents (not custom_agents
// rows, so there's no id to look up — just call the matching function).
const PREBUILT_RUNNERS = {
  morning_brief: (db, io, req) => morningBrief(db, io, req.user, req.spaceId, { force: true }),
  reschedule: (db, io, req) => rescheduleAdvisor(db, io, req.user, req.spaceId, { force: true }),
  priority: (db, io, req) => priorityFocus(db, io, req.user, req.spaceId, todayLocal(), { force: true }),
  workload: (db, io, req) => workloadSpread(db, io, req.user, req.spaceId, { force: true }),
  bulletin_board: (db, io, req) => {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.spaceId);
    return bulletinBoard(db, io, space, { window: 'day', force: true });
  },
};

// Insights the current user may act on in the current space: their own
// per-user cards plus space-scoped cards (user_id null). Space-scoped
// dismiss/snooze lives in agent_insight_dismissals so it is per member.
function loadInsight(db, id, req) {
  const insight = db.prepare('SELECT * FROM agent_insights WHERE id = ?').get(id);
  if (!insight || insight.space_id !== req.spaceId) return null;
  if (insight.user_id !== null && insight.user_id !== req.user.id) return null;
  return insight;
}

module.exports = function (io) {
  const router = express.Router();

  router.get('/', requireAuth, requireSpace, (req, res) => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT ai.*, ca.name AS custom_agent_name, ca.icon AS custom_agent_icon
      FROM agent_insights ai
      LEFT JOIN custom_agents ca ON ca.id = ai.custom_agent_id
      WHERE ai.space_id = ?
        AND (ai.user_id = ? OR ai.user_id IS NULL)
        AND (ai.expires_at IS NULL OR ai.expires_at > datetime('now'))
        AND (
          (ai.user_id IS NOT NULL AND (
            ai.status = 'active'
            OR (ai.status = 'snoozed' AND ai.snoozed_until <= datetime('now'))
          ))
          OR
          (ai.user_id IS NULL AND ai.status = 'active' AND NOT EXISTS (
            SELECT 1 FROM agent_insight_dismissals d
            WHERE d.insight_id = ai.id AND d.user_id = ?
              AND (d.status = 'dismissed' OR (d.status = 'snoozed' AND d.snoozed_until > datetime('now')))
          ))
        )
      ORDER BY ai.created_at DESC
    `).all(req.spaceId, req.user.id, req.user.id);
    res.json(rows);
  });

  // Bypasses the schedule but keeps each agent's own alreadyFiredToday guard
  // (mirrors POST /custom-agents/:id/run for the hardcoded pre-built agents).
  router.post('/prebuilt/:agentType/run', requireAuth, requireSpace, async (req, res) => {
    const runner = PREBUILT_RUNNERS[req.params.agentType];
    if (!runner) return res.status(404).json({ error: 'Unknown agent' });

    try {
      const db = getDb();
      const result = await runner(db, io, req);
      if (!result) {
        return res.status(409).json({ error: 'No report produced — the LLM is unavailable.' });
      }
      res.json(result);
    } catch (err) {
      logger.info('prebuilt agent run-now failed', { agentType: req.params.agentType, error: err.message });
      res.status(500).json({ error: 'Run failed', detail: err.message });
    }
  });

  router.post('/:id/approve', requireAuth, requireSpace, async (req, res) => {
    const db = getDb();
    const insight = loadInsight(db, req.params.id, req);
    if (!insight) return res.status(404).json({ error: 'Insight not found' });
    if (!insight.action_payload_json) return res.status(400).json({ error: 'Insight has no action' });
    if (!['active', 'snoozed'].includes(insight.status)) return res.status(409).json({ error: 'Insight already actioned' });

    let payload;
    try { payload = JSON.parse(insight.action_payload_json); } catch { return res.status(500).json({ error: 'Corrupt action payload' }); }
    const calls = Array.isArray(payload) ? payload : [payload];

    try {
      const results = [];
      for (const call of calls) {
        const result = await handleToolCall(call.name, call.args, req.user, io, req.spaceId);
        results.push(result);
        if (result.ok === false) {
          return res.status(422).json({ error: 'Action failed', detail: result.result, results });
        }
      }
      db.prepare("UPDATE agent_insights SET status = 'approved' WHERE id = ?").run(insight.id);
      io?.to(`space:${req.spaceId}`).emit('agent:insight:updated', { insightId: insight.id, status: 'approved' });
      return res.json({ ok: true, results: results.map(r => r.result) });
    } catch (err) {
      logger.info('insight approve failed', { insightId: insight.id, error: err.message });
      return res.status(500).json({ error: 'Action failed', detail: err.message });
    }
  });

  router.post('/:id/dismiss', requireAuth, requireSpace, (req, res) => {
    const db = getDb();
    const insight = loadInsight(db, req.params.id, req);
    if (!insight) return res.status(404).json({ error: 'Insight not found' });

    if (insight.user_id === null) {
      db.prepare(`
        INSERT INTO agent_insight_dismissals (insight_id, user_id, status, snoozed_until)
        VALUES (?, ?, 'dismissed', NULL)
        ON CONFLICT(insight_id, user_id) DO UPDATE SET status = 'dismissed', snoozed_until = NULL
      `).run(insight.id, req.user.id);
    } else {
      db.prepare("UPDATE agent_insights SET status = 'dismissed' WHERE id = ?").run(insight.id);
    }
    res.json({ ok: true });
  });

  router.post('/:id/snooze', requireAuth, requireSpace, (req, res) => {
    const db = getDb();
    const insight = loadInsight(db, req.params.id, req);
    if (!insight) return res.status(404).json({ error: 'Insight not found' });

    if (insight.user_id === null) {
      db.prepare(`
        INSERT INTO agent_insight_dismissals (insight_id, user_id, status, snoozed_until)
        VALUES (?, ?, 'snoozed', datetime('now', '+4 hours'))
        ON CONFLICT(insight_id, user_id) DO UPDATE SET status = 'snoozed', snoozed_until = datetime('now', '+4 hours')
      `).run(insight.id, req.user.id);
    } else {
      db.prepare("UPDATE agent_insights SET status = 'snoozed', snoozed_until = datetime('now', '+4 hours') WHERE id = ?").run(insight.id);
    }
    res.json({ ok: true });
  });

  return router;
};
