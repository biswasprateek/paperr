const { callLLM } = require('../llmClient');

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysLocal(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function friendlyDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

// True if this agent already produced an insight today (local server day).
// Per-user agents are keyed (agent_type, user_id, space_id); space-scoped
// agents (user_id null) on (agent_type, space_id); custom agents per definition.
function alreadyFiredToday(db, agentType, { userId = null, spaceId = null, customAgentId = null } = {}) {
  let sql = "SELECT 1 FROM agent_insights WHERE agent_type = ? AND date(created_at, 'localtime') = date('now', 'localtime')";
  const params = [agentType];
  if (customAgentId != null) {
    sql += ' AND custom_agent_id = ?';
    params.push(customAgentId);
  } else if (userId != null) {
    sql += ' AND user_id = ? AND space_id = ?';
    params.push(userId, spaceId);
  } else {
    sql += ' AND user_id IS NULL AND space_id = ?';
    params.push(spaceId);
  }
  return !!db.prepare(sql + ' LIMIT 1').get(...params);
}

function createInsight(db, io, {
  userId = null, spaceId, agentType, customAgentId = null,
  title, content, actionPayload = null, actionLabel = null, expiresHours = null,
}) {
  const result = db.prepare(`
    INSERT INTO agent_insights (user_id, space_id, agent_type, custom_agent_id, title, content, action_payload_json, action_label, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', '+' || ? || ' hours') END)
  `).run(
    userId, spaceId, agentType, customAgentId, title, content,
    actionPayload ? JSON.stringify(actionPayload) : null,
    actionLabel, expiresHours, expiresHours
  );
  const insight = db.prepare('SELECT * FROM agent_insights WHERE id = ?').get(result.lastInsertRowid);
  io?.to(`space:${spaceId}`).emit('agent:insight', { insight });
  return insight;
}

// Single-turn LLM text completion. Throws LLMUnavailableError when the local
// LLM is down — callers decide whether to fall back or skip the run.
async function llmText(system, user) {
  const choice = await callLLM({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return choice?.message?.content?.trim() || '';
}

module.exports = { todayLocal, addDaysLocal, friendlyDate, alreadyFiredToday, createInsight, llmText };
