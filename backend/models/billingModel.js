const crypto = require('crypto');
const db = require('./db');

const cents = (n) => Math.round(Number(n) * 100);
const money = (c) => c / 100;

module.exports = {
  // Everything done for a patient that has not been invoiced yet. Amounts come from the database,
  // never from the browser.
  unbilled: async (patientId) => {
    const consult = await db.query(
      `SELECT 'consultation' AS type, a.id AS reference_id, d.consultation_fee AS amount,
              CONCAT('Consultation - ', d.full_name, ' (', a.appointment_date, ')') AS description
         FROM appointments a JOIN doctors d ON d.id = a.doctor_id
        WHERE a.patient_id = ? AND a.status = 'completed'
          AND NOT EXISTS (SELECT 1 FROM invoice_items i WHERE i.item_type = 'consultation' AND i.reference_id = a.id)`, [patientId]);
    const lab = await db.query(
      `SELECT 'lab' AS type, l.id AS reference_id, t.price AS amount, CONCAT('Lab - ', t.name, ' (LAB-', l.id, ')') AS description
         FROM lab_requests l JOIN lab_tests t ON t.id = l.test_id
        WHERE l.patient_id = ? AND l.status <> 'cancelled'
          AND NOT EXISTS (SELECT 1 FROM invoice_items i WHERE i.item_type = 'lab' AND i.reference_id = l.id)`, [patientId]);
    const rx = await db.query(
      `SELECT 'pharmacy' AS type, rx.id AS reference_id, ROUND(SUM(i.quantity * m.unit_price), 2) AS amount,
              CONCAT('Pharmacy - ', GROUP_CONCAT(CONCAT(m.name, ' x', i.quantity) SEPARATOR ', ')) AS description
         FROM prescriptions rx JOIN prescription_items i ON i.prescription_id = rx.id JOIN medicines m ON m.id = i.medicine_id
        WHERE rx.patient_id = ? AND rx.status = 'dispensed'
          AND NOT EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.item_type = 'pharmacy' AND ii.reference_id = rx.id)
        GROUP BY rx.id`, [patientId]);
    return [...consult, ...lab, ...rx].map((r) => ({ ...r, description: r.description.slice(0, 255), amount: Number(r.amount) }));
  },

  createInvoice: ({ patientId, items, discount, userId }) => db.withTransaction(async (q) => {
    const subtotalC = items.reduce((s, i) => s + cents(i.amount), 0);
    const discountC = cents(discount);
    const totalC = subtotalC - discountC;
    const inv = await q(
      `INSERT INTO invoices (invoice_no, patient_id, subtotal, discount, total, status, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [`TMP-${crypto.randomBytes(8).toString('hex')}`, patientId, money(subtotalC), money(discountC), money(totalC), totalC === 0 ? 'paid' : 'unpaid', userId]);
    await q("UPDATE invoices SET invoice_no = CONCAT('INV-', LPAD(id, 6, '0')) WHERE id = ?", [inv.insertId]);
    for (const i of items) {
      await q('INSERT INTO invoice_items (invoice_id, item_type, reference_id, description, amount) VALUES (?,?,?,?,?)',
        [inv.insertId, i.type, i.reference_id || null, i.description, money(cents(i.amount))]);
    }
    return inv.insertId;
  }),

  list: ({ status, patientId, from, to }) => {
    const where = []; const p = [];
    if (status) { where.push('v.status = ?'); p.push(status); }
    if (patientId) { where.push('v.patient_id = ?'); p.push(patientId); }
    if (from) { where.push('DATE(v.created_at) >= ?'); p.push(from); }
    if (to) { where.push('DATE(v.created_at) <= ?'); p.push(to); }
    return db.query(
      `SELECT v.*, v.total - v.amount_paid AS balance, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient_name
         FROM invoices v JOIN patients p ON p.id = v.patient_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY v.id DESC LIMIT 300`, p);
  },

  get: async (id) => {
    const inv = await db.one(
      `SELECT v.*, v.total - v.amount_paid AS balance, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.phone,
              u.full_name AS created_by_name
         FROM invoices v JOIN patients p ON p.id = v.patient_id LEFT JOIN users u ON u.id = v.created_by WHERE v.id = ?`, [id]);
    if (!inv) return null;
    inv.items = await db.query('SELECT id, item_type, reference_id, description, amount FROM invoice_items WHERE invoice_id = ? ORDER BY id', [id]);
    inv.payments = await db.query(
      `SELECT y.id, y.receipt_no, y.amount, y.method, y.reference, y.paid_at, u.full_name AS received_by_name
         FROM payments y LEFT JOIN users u ON u.id = y.received_by WHERE y.invoice_id = ? ORDER BY y.id`, [id]);
    return inv;
  },

  // Locks the invoice row so two payments cannot both pass the balance check.
  pay: (invoiceId, p, userId) => db.withTransaction(async (q) => {
    const [inv] = await q('SELECT id, total, amount_paid, status FROM invoices WHERE id = ? FOR UPDATE', [invoiceId]);
    if (!inv) return { error: 'Invoice not found.', status: 404 };
    if (inv.status === 'void') return { error: 'This invoice is void.', status: 409 };
    const balanceC = cents(inv.total) - cents(inv.amount_paid);
    const amountC = cents(p.amount);
    if (balanceC <= 0) return { error: 'This invoice is already paid in full.', status: 409 };
    if (amountC > balanceC) return { error: `The amount is more than the balance due (Rs. ${money(balanceC).toFixed(2)}).`, status: 400 };
    const r = await q(
      'INSERT INTO payments (receipt_no, invoice_id, amount, method, reference, received_by) VALUES (?,?,?,?,?,?)',
      [`TMP-${crypto.randomBytes(8).toString('hex')}`, invoiceId, money(amountC), p.method, p.reference || null, userId]);
    await q("UPDATE payments SET receipt_no = CONCAT('RCP-', LPAD(id, 6, '0')) WHERE id = ?", [r.insertId]);
    const paidC = cents(inv.amount_paid) + amountC;
    await q('UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?',
      [money(paidC), paidC >= cents(inv.total) ? 'paid' : 'partially_paid', invoiceId]);
    return { paymentId: r.insertId };
  }),

  payment: (id) => db.one(
    `SELECT y.*, v.invoice_no, v.total, v.amount_paid, v.total - v.amount_paid AS balance, p.mrn,
            CONCAT(p.first_name,' ',p.last_name) AS patient_name, u.full_name AS received_by_name
       FROM payments y JOIN invoices v ON v.id = y.invoice_id JOIN patients p ON p.id = v.patient_id
  LEFT JOIN users u ON u.id = y.received_by WHERE y.id = ?`, [id]),

  payments: ({ from, to }) => {
    const where = []; const p = [];
    if (from) { where.push('DATE(y.paid_at) >= ?'); p.push(from); }
    if (to) { where.push('DATE(y.paid_at) <= ?'); p.push(to); }
    return db.query(
      `SELECT y.id, y.receipt_no, y.amount, y.method, y.paid_at, v.invoice_no, CONCAT(p.first_name,' ',p.last_name) AS patient_name
         FROM payments y JOIN invoices v ON v.id = y.invoice_id JOIN patients p ON p.id = v.patient_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY y.id DESC LIMIT 300`, p);
  },
};

module.exports.cents = cents;
