// Medical records and prescriptions.
const db = require('./db');

const RECORD_SELECT = `SELECT r.id, r.patient_id, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient_name,
  r.doctor_id, d.full_name AS doctor_name, r.appointment_id, r.visit_date, r.complaint, r.diagnosis, r.icd10_code,
  r.clinical_notes, r.treatment_plan, r.created_at, rx.id AS prescription_id, rx.status AS prescription_status
  FROM medical_records r JOIN patients p ON p.id = r.patient_id JOIN doctors d ON d.id = r.doctor_id
  LEFT JOIN prescriptions rx ON rx.record_id = r.id`;

const RX_SELECT = `SELECT rx.id, rx.record_id, rx.patient_id, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient_name,
  p.allergies, rx.doctor_id, d.full_name AS doctor_name, r.diagnosis, rx.status, rx.created_at, rx.dispensed_at,
  u.full_name AS dispensed_by_name
  FROM prescriptions rx JOIN patients p ON p.id = rx.patient_id JOIN doctors d ON d.id = rx.doctor_id
  JOIN medical_records r ON r.id = rx.record_id LEFT JOIN users u ON u.id = rx.dispensed_by`;

async function attachItems(rxs) {
  if (!rxs.length) return rxs;
  const items = await db.query(
    `SELECT i.id, i.prescription_id, i.medicine_id, m.name, m.strength, m.form, m.unit_price, m.stock_quantity,
            m.expiry_date, m.expiry_date < CURDATE() AS expired, i.dosage, i.frequency, i.duration_days, i.quantity, i.instructions
       FROM prescription_items i JOIN medicines m ON m.id = i.medicine_id WHERE i.prescription_id IN (?)`,
    [rxs.map((r) => r.id)]);
  for (const rx of rxs) {
    rx.items = items.filter((i) => i.prescription_id === rx.id);
    rx.total = Math.round(rx.items.reduce((s, i) => s + i.quantity * i.unit_price * 100, 0)) / 100;
    rx.can_dispense = rx.status === 'pending' && rx.items.every((i) => !i.expired && i.stock_quantity >= i.quantity);
  }
  return rxs;
}

module.exports = {
  listRecords: ({ patientId, doctorId }) => {
    const where = []; const p = [];
    if (patientId) { where.push('r.patient_id = ?'); p.push(patientId); }
    if (doctorId) { where.push('r.doctor_id = ?'); p.push(doctorId); }
    return db.query(`${RECORD_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.visit_date DESC, r.id DESC LIMIT 200`, p);
  },

  getRecord: async (id) => {
    const r = await db.one(`${RECORD_SELECT} WHERE r.id = ?`, [id]);
    if (r && r.prescription_id) r.prescription = (await attachItems(await db.query(`${RX_SELECT} WHERE rx.id = ?`, [r.prescription_id])))[0];
    return r;
  },

  medicinesByIds: (ids) => (ids.length ? db.query('SELECT id, name, generic_name, form, strength, is_active FROM medicines WHERE id IN (?)', [ids]) : []),
  testsByIds: (ids) => (ids.length ? db.query('SELECT id, name FROM lab_tests WHERE is_active = 1 AND id IN (?)', [ids]) : []),

  // Saves the consultation, its prescription and any lab requests together, and completes the appointment.
  createRecord: (r) => db.withTransaction(async (q) => {
    const rec = await q(
      `INSERT INTO medical_records (patient_id, doctor_id, appointment_id, visit_date, complaint, diagnosis, icd10_code, clinical_notes, treatment_plan)
       VALUES (?,?,?,CURDATE(),?,?,?,?,?)`,
      [r.patientId, r.doctorId, r.appointmentId || null, r.complaint || null, r.diagnosis, r.icd10Code || null,
        r.clinicalNotes || null, r.treatmentPlan || null]);
    let prescriptionId = null;
    if (r.items.length) {
      const rx = await q('INSERT INTO prescriptions (record_id, patient_id, doctor_id) VALUES (?,?,?)', [rec.insertId, r.patientId, r.doctorId]);
      prescriptionId = rx.insertId;
      for (const i of r.items) {
        await q(`INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration_days, quantity, instructions)
                 VALUES (?,?,?,?,?,?,?)`, [prescriptionId, i.medicineId, i.dosage, i.frequency, i.durationDays, i.quantity, i.instructions || null]);
      }
    }
    for (const testId of r.labTests) {
      await q('INSERT INTO lab_requests (patient_id, doctor_id, test_id, priority, requested_by) VALUES (?,?,?,?,?)',
        [r.patientId, r.doctorId, testId, r.labPriority, r.userId]);
    }
    if (r.appointmentId) await q("UPDATE appointments SET status = 'completed' WHERE id = ?", [r.appointmentId]);
    return { recordId: rec.insertId, prescriptionId };
  }),

  listPrescriptions: async ({ status, doctorId, patientId }) => {
    const where = []; const p = [];
    if (status) { where.push('rx.status = ?'); p.push(status); }
    if (doctorId) { where.push('rx.doctor_id = ?'); p.push(doctorId); }
    if (patientId) { where.push('rx.patient_id = ?'); p.push(patientId); }
    return attachItems(await db.query(`${RX_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY rx.status = 'pending' DESC, rx.created_at DESC LIMIT 200`, p));
  },

  getPrescription: async (id) => (await attachItems(await db.query(`${RX_SELECT} WHERE rx.id = ?`, [id])))[0] || null,

  // Dispensing locks the prescription and each medicine row, re-checks stock and expiry,
  // then decrements stock and writes a stock movement - all or nothing.
  dispense: (id, userId) => db.withTransaction(async (q) => {
    const [rx] = await q('SELECT id, status FROM prescriptions WHERE id = ? FOR UPDATE', [id]);
    if (!rx) return { error: 'Prescription not found.', status: 404 };
    if (rx.status !== 'pending') return { error: `This prescription is already ${rx.status}.`, status: 409 };
    const items = await q('SELECT medicine_id, quantity FROM prescription_items WHERE prescription_id = ?', [id]);
    const problems = [];
    for (const it of items) {
      const [m] = await q('SELECT id, name, strength, stock_quantity, expiry_date, expiry_date < CURDATE() AS expired, is_active FROM medicines WHERE id = ? FOR UPDATE', [it.medicine_id]);
      const label = `${m.name}${m.strength ? ` ${m.strength}` : ''}`;
      if (!m.is_active) problems.push(`${label} is no longer stocked`);
      else if (m.expired) problems.push(`${label}: current batch expired on ${m.expiry_date}`);
      else if (m.stock_quantity < it.quantity) problems.push(`${label}: need ${it.quantity}, only ${m.stock_quantity} in stock`);
    }
    if (problems.length) return { error: `Cannot dispense: ${problems.join('; ')}.`, status: 409 };
    for (const it of items) {
      await q('UPDATE medicines SET stock_quantity = stock_quantity - ? WHERE id = ?', [it.quantity, it.medicine_id]);
      await q("INSERT INTO stock_movements (medicine_id, change_qty, reason, reference, user_id) VALUES (?,?,'dispense',?,?)",
        [it.medicine_id, -it.quantity, `RX-${id}`, userId]);
    }
    await q("UPDATE prescriptions SET status = 'dispensed', dispensed_by = ?, dispensed_at = NOW() WHERE id = ?", [userId, id]);
    return { ok: true };
  }),

  cancelPrescription: (id) => db.query("UPDATE prescriptions SET status = 'cancelled' WHERE id = ? AND status = 'pending'", [id]),
};
