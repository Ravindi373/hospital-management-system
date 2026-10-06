const db = require('./db');

const SELECT = `SELECT l.id, l.patient_id, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient_name,
  l.doctor_id, d.full_name AS doctor_name, l.test_id, t.name AS test_name, t.reference_range, t.unit, t.price,
  l.priority, l.status, l.sample_id, l.result_value, l.result_flag, l.remarks, l.requested_at, l.collected_at, l.completed_at,
  ru.full_name AS result_entered_by_name
  FROM lab_requests l JOIN patients p ON p.id = l.patient_id JOIN lab_tests t ON t.id = l.test_id
  LEFT JOIN doctors d ON d.id = l.doctor_id LEFT JOIN users ru ON ru.id = l.result_entered_by`;

module.exports = {
  tests: (all = false) => db.query(`SELECT * FROM lab_tests ${all ? '' : 'WHERE is_active = 1'} ORDER BY name`),
  getTest: (id) => db.one('SELECT * FROM lab_tests WHERE id = ?', [id]),
  createTest: (t) => db.query('INSERT INTO lab_tests (name, reference_range, unit, price) VALUES (?,?,?,?)',
    [t.name, t.referenceRange, t.unit || null, t.price]),
  updateTest: (id, t) => {
    const map = { name: 'name', referenceRange: 'reference_range', unit: 'unit', price: 'price', isActive: 'is_active' };
    const sets = []; const p = [];
    for (const [k, col] of Object.entries(map)) if (t[k] !== undefined) { sets.push(`${col} = ?`); p.push(t[k]); }
    if (!sets.length) return Promise.resolve();
    return db.query(`UPDATE lab_tests SET ${sets.join(', ')} WHERE id = ?`, [...p, id]);
  },

  list: ({ status, patientId, doctorId, open }) => {
    const where = []; const p = [];
    if (status) { where.push('l.status = ?'); p.push(status); }
    if (open) where.push("l.status IN ('requested','sample_collected')");
    if (patientId) { where.push('l.patient_id = ?'); p.push(patientId); }
    if (doctorId) { where.push('l.doctor_id = ?'); p.push(doctorId); }
    return db.query(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.status = 'completed', l.priority = 'urgent' DESC, l.requested_at DESC LIMIT 300`, p);
  },

  get: (id) => db.one(`${SELECT} WHERE l.id = ?`, [id]),

  create: (r) => db.withTransaction(async (q) => {
    const ids = [];
    for (const testId of r.testIds) {
      const x = await q('INSERT INTO lab_requests (patient_id, doctor_id, test_id, priority, requested_by) VALUES (?,?,?,?,?)',
        [r.patientId, r.doctorId || null, testId, r.priority, r.userId]);
      ids.push(x.insertId);
    }
    return ids;
  }),

  collect: (id) => db.query(
    `UPDATE lab_requests SET status = 'sample_collected', collected_at = NOW(),
            sample_id = CONCAT('S', DATE_FORMAT(NOW(),'%y%m%d'), '-', LPAD(id, 5, '0'))
      WHERE id = ? AND status = 'requested'`, [id]),

  saveResult: (id, r) => db.query(
    `UPDATE lab_requests SET result_value = ?, result_flag = ?, remarks = ?, result_entered_by = ?,
            status = 'completed', completed_at = NOW()
      WHERE id = ? AND status = 'sample_collected'`, [r.value, r.flag, r.remarks || null, r.userId, id]),

  cancel: (id) => db.query("UPDATE lab_requests SET status = 'cancelled' WHERE id = ? AND status = 'requested'", [id]),
};
