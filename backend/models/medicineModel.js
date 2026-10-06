const db = require('./db');

const EXPIRY_WARNING_DAYS = 90;
const SELECT = `SELECT m.*, m.stock_quantity <= m.reorder_level AS low_stock, m.stock_quantity = 0 AS out_of_stock,
  m.expiry_date < CURDATE() AS expired, DATEDIFF(m.expiry_date, CURDATE()) AS days_to_expiry,
  (m.expiry_date >= CURDATE() AND m.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ${EXPIRY_WARNING_DAYS} DAY)) AS expiring_soon
  FROM medicines m`;

module.exports = {
  list: ({ q, alertsOnly } = {}) => {
    const where = ['m.is_active = 1']; const p = [];
    if (q) { where.push('(m.name LIKE ? OR m.generic_name LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
    if (alertsOnly) where.push(`(m.stock_quantity <= m.reorder_level OR m.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ${EXPIRY_WARNING_DAYS} DAY))`);
    return db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY m.name, m.strength`, p);
  },

  get: (id) => db.one(`${SELECT} WHERE m.id = ?`, [id]),

  create: (m, userId) => db.withTransaction(async (q) => {
    const r = await q(
      `INSERT INTO medicines (name, generic_name, form, strength, unit_price, stock_quantity, reorder_level, batch_no, expiry_date, supplier)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [m.name, m.genericName || null, m.form, m.strength || null, m.unitPrice, m.stockQuantity, m.reorderLevel,
        m.batchNo || null, m.expiryDate || null, m.supplier || null]);
    if (m.stockQuantity > 0) {
      await q("INSERT INTO stock_movements (medicine_id, change_qty, reason, reference, user_id) VALUES (?,?,'opening',?,?)",
        [r.insertId, m.stockQuantity, m.batchNo || null, userId]);
    }
    return r.insertId;
  }),

  update: (id, m) => {
    const map = { name: 'name', genericName: 'generic_name', form: 'form', strength: 'strength', unitPrice: 'unit_price',
      reorderLevel: 'reorder_level', supplier: 'supplier', isActive: 'is_active' };
    const sets = []; const p = [];
    for (const [k, col] of Object.entries(map)) if (m[k] !== undefined) { sets.push(`${col} = ?`); p.push(m[k]); }
    if (!sets.length) return Promise.resolve();
    return db.query(`UPDATE medicines SET ${sets.join(', ')} WHERE id = ?`, [...p, id]);
  },

  restock: (id, r, userId) => db.withTransaction(async (q) => {
    const [m] = await q('SELECT stock_quantity FROM medicines WHERE id = ? FOR UPDATE', [id]);
    if (r.discardExisting && m.stock_quantity > 0) {
      await q("INSERT INTO stock_movements (medicine_id, change_qty, reason, reference, user_id) VALUES (?,?,'expired',?,?)",
        [id, -m.stock_quantity, 'Discarded old batch', userId]);
    }
    const newQty = (r.discardExisting ? 0 : m.stock_quantity) + r.quantity;
    await q('UPDATE medicines SET stock_quantity = ?, batch_no = ?, expiry_date = ? WHERE id = ?', [newQty, r.batchNo, r.expiryDate, id]);
    await q("INSERT INTO stock_movements (medicine_id, change_qty, reason, reference, user_id) VALUES (?,?,'restock',?,?)",
      [id, r.quantity, r.batchNo, userId]);
    return { before: m.stock_quantity, after: newQty };
  }),

  adjust: (id, a, userId) => db.withTransaction(async (q) => {
    const [m] = await q('SELECT stock_quantity FROM medicines WHERE id = ? FOR UPDATE', [id]);
    const newQty = m.stock_quantity + a.change;
    if (newQty < 0) return { error: `Stock cannot go below zero (currently ${m.stock_quantity}).` };
    await q('UPDATE medicines SET stock_quantity = ? WHERE id = ?', [newQty, id]);
    await q('INSERT INTO stock_movements (medicine_id, change_qty, reason, reference, user_id) VALUES (?,?,?,?,?)',
      [id, a.change, a.reason, a.note || null, userId]);
    return { before: m.stock_quantity, after: newQty };
  }),

  movements: (id) => db.query(
    `SELECT s.id, s.change_qty, s.reason, s.reference, s.created_at, u.full_name AS user_name
       FROM stock_movements s LEFT JOIN users u ON u.id = s.user_id WHERE s.medicine_id = ? ORDER BY s.id DESC LIMIT 100`, [id]),
};
