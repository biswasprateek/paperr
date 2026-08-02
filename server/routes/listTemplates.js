const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');

// Normalise an incoming items array into clean { title, notes, sort_order } rows.
function normaliseItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it, idx) => ({
      title: (it?.title ?? '').toString().trim(),
      notes: it?.notes != null && it.notes !== '' ? it.notes.toString() : null,
      sort_order: it?.sort_order != null ? it.sort_order : idx,
    }))
    .filter(it => it.title.length > 0);
}

function replaceTemplateItems(db, templateId, items) {
  db.prepare('DELETE FROM list_template_items WHERE template_id = ?').run(templateId);
  const insert = db.prepare(
    'INSERT INTO list_template_items (template_id, title, notes, sort_order) VALUES (?, ?, ?, ?)'
  );
  items.forEach((it, idx) => insert.run(templateId, it.title, it.notes, it.sort_order ?? idx));
}

function getTemplateWithItems(db, id) {
  const template = db.prepare('SELECT * FROM list_templates WHERE id = ?').get(id);
  if (!template) return null;
  template.items = db.prepare(
    'SELECT id, title, notes, sort_order FROM list_template_items WHERE template_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(id);
  return template;
}

// GET /api/list-templates — all templates for the space, with item counts.
router.get('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const templates = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM list_template_items i WHERE i.template_id = t.id) AS item_count
    FROM list_templates t
    WHERE t.space_id = ?
    ORDER BY t.created_at ASC
  `).all(req.spaceId);
  return res.json(templates);
});

// GET /api/list-templates/:id — single template with its items.
router.get('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const template = getTemplateWithItems(db, parseInt(req.params.id));
  if (!template || template.space_id !== req.spaceId) return res.status(404).json({ error: 'Template not found' });
  return res.json(template);
});

// POST /api/list-templates — create a template (with optional items).
router.post('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const { name, icon, colour, items } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  const result = db.prepare(
    'INSERT INTO list_templates (name, icon, colour, created_by, space_id) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), icon || '📋', colour || '#F97316', req.user.id, req.spaceId);

  const id = result.lastInsertRowid;
  replaceTemplateItems(db, id, normaliseItems(items));
  return res.status(201).json(getTemplateWithItems(db, id));
});

// PUT /api/list-templates/:id — update a template; items (if provided) replace existing ones.
router.put('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const template = db.prepare('SELECT * FROM list_templates WHERE id = ? AND space_id = ?').get(id, req.spaceId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const { name, icon, colour, items } = req.body;
  db.prepare('UPDATE list_templates SET name = ?, icon = ?, colour = ? WHERE id = ?')
    .run(name?.trim() || template.name, icon ?? template.icon, colour ?? template.colour, id);

  if (items !== undefined) replaceTemplateItems(db, id, normaliseItems(items));
  return res.json(getTemplateWithItems(db, id));
});

// DELETE /api/list-templates/:id
router.delete('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const template = db.prepare('SELECT id FROM list_templates WHERE id = ? AND space_id = ?').get(id, req.spaceId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  db.prepare('DELETE FROM list_templates WHERE id = ?').run(id); // items cascade
  return res.json({ success: true });
});

// POST /api/list-templates/:id/create-list — spawn a new list from the template.
router.post('/:id/create-list', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const template = getTemplateWithItems(db, id);
  if (!template || template.space_id !== req.spaceId) return res.status(404).json({ error: 'Template not found' });

  const name = (req.body?.name && req.body.name.trim()) || template.name;
  const result = db.prepare(
    'INSERT INTO lists (name, icon, colour, created_by, space_id) VALUES (?, ?, ?, ?, ?)'
  ).run(name, template.icon, template.colour, req.user.id, req.spaceId);

  const listId = result.lastInsertRowid;
  const insertItem = db.prepare(
    'INSERT INTO list_items (list_id, title, notes, sort_order, created_by) VALUES (?, ?, ?, ?, ?)'
  );
  template.items.forEach((it, idx) => insertItem.run(listId, it.title, it.notes ?? null, it.sort_order ?? idx, req.user.id));

  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId);
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('list:created', { list });
  return res.status(201).json(list);
});

module.exports = router;
