const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace, requireSpaceAdmin } = require('../auth/middleware');

function newId() {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Default Hub board seeded per space type, first read only. Every widget
// here is collaborative (shows all members at once) or already space-wide —
// nothing viewer-relative, since every member sees this same board. Widget
// `type` strings match the registry in client/src/widgets/index.js.
// Shared-group widgets lead the board — they're the whole point of the Hub
// (everyone at once), so they get top billing before task/general widgets.
const DEFAULT_HUB_WIDGETS = {
  // Mirrors the "Test Home" reference space's Hub board.
  family: [
    { type: 'shared-calendar', w: 2, h: 3, props: { range: '3day' } },
    { type: 'sticky-pads',     w: 2, h: 2, props: {} },
    { type: 'ai-agent',        w: 1, h: 2, props: { agent: 'bulletin_board', agentName: 'Bulletin Board', agentIcon: null } },
    { type: 'frame',           w: 1, h: 2, props: {} },
    { type: 'events',          w: 1, h: 2, props: {} },
    { type: 'shared-list',     w: 1, h: 2, props: {} },   // listId filled in at seed time, if a list exists
    { type: 'space-pulse',     w: 2, h: 1, props: {} },
    { type: 'activity',        w: 1, h: 2, props: {} },
    { type: 'space-routines',  w: 2, h: 2, props: {} },
  ],
  team: [
    { type: 'shared-calendar', w: 1, h: 2, props: {} },
    { type: 'sticky-pads',     w: 2, h: 2, props: {} },
    { type: 'stats',           w: 2, h: 1, props: { perspective: 'space' } },
    { type: 'projects',        w: 1, h: 2, props: {} },
    { type: 'activity',        w: 1, h: 2, props: {} },
  ],
};

function defaultBoard(db, spaceId, spaceType) {
  const firstList = db.prepare('SELECT id FROM lists WHERE space_id = ? ORDER BY created_at ASC LIMIT 1').get(spaceId);
  const widgets = (DEFAULT_HUB_WIDGETS[spaceType] || DEFAULT_HUB_WIDGETS.family)
    .map((w) => ({
      id: newId(),
      ...w,
      props: w.type === 'shared-list' && firstList ? { ...w.props, listId: firstList.id } : w.props,
    }));
  return { pages: [{ id: newId(), name: 'Hub', widgets }] };
}

// GET /api/hub — board + settings for the current space. Seeds a default
// board on first read so a fresh space never opens to a blank Hub.
router.get('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  let row = db.prepare('SELECT * FROM hub_boards WHERE space_id = ?').get(req.spaceId);

  if (!row) {
    const space = db.prepare('SELECT type FROM spaces WHERE id = ?').get(req.spaceId);
    const board = defaultBoard(db, req.spaceId, space?.type);
    db.prepare('INSERT INTO hub_boards (space_id, board_json, settings_json) VALUES (?, ?, ?)')
      .run(req.spaceId, JSON.stringify(board), JSON.stringify({}));
    row = db.prepare('SELECT * FROM hub_boards WHERE space_id = ?').get(req.spaceId);
  }

  return res.json({
    board: JSON.parse(row.board_json),
    settings: JSON.parse(row.settings_json || '{}'),
  });
});

// Structural validation only — widget types are a client-registry concern,
// but shape errors here would break every member's Hub, so reject early.
function validateBoard(board) {
  if (!board || !Array.isArray(board.pages) || board.pages.length === 0) return 'board.pages must be a non-empty array';
  for (const page of board.pages) {
    if (!page || typeof page.id !== 'string' || !Array.isArray(page.widgets)) return 'each page needs an id and a widgets array';
    for (const w of page.widgets) {
      if (!w || typeof w.id !== 'string' || typeof w.type !== 'string') return 'each widget needs an id and a type';
      if (!Number.isInteger(w.w) || !Number.isInteger(w.h) || w.w < 1 || w.w > 3 || w.h < 1 || w.h > 3) {
        return 'widget w/h must be integers between 1 and 3';
      }
    }
  }
  return null;
}

// PUT /api/hub/board — replace the shared board. Space-admin only: members
// are viewers of the layout (widget-level data interactions go through each
// feature's own API and are open to everyone).
router.put('/board', requireAuth, requireSpace, requireSpaceAdmin, (req, res) => {
  const { board } = req.body;
  const invalid = validateBoard(board);
  if (invalid) return res.status(400).json({ error: invalid });

  const db = getDb();
  db.prepare(`
    INSERT INTO hub_boards (space_id, board_json, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(space_id) DO UPDATE SET
      board_json = excluded.board_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(req.spaceId, JSON.stringify(board), req.user.id);

  req.app.get('io')?.to(`space:${req.spaceId}`).emit('hub:updated', { spaceId: req.spaceId });
  return res.json({ board });
});

module.exports = router;
