// The signed-in user's own notifications (bell icon).
const db = require('../models/db');
const { parseId } = require('../middleware/validate');

async function list(req, res) {
  const rows = await db.query(
    'SELECT id, type, title, body, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30', [req.user.id]);
  const [{ unread }] = await db.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ unread: Number(unread), items: rows });
}

async function markRead(req, res) {
  await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [parseId(req.params.id), req.user.id]);
  res.json({ ok: true });
}

async function markAllRead(req, res) {
  await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ ok: true });
}

module.exports = { list, markRead, markAllRead };
