const crypto = require('crypto');
const db = require('./db');

const COLS = `p.id, p.mrn, p.first_name, p.last_name, CONCAT(p.first_name,' ',p.last_name) AS full_name, p.gender,
  p.date_of_birth, TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) AS age, p.nic, p.blood_group, p.phone, p.email,
  p.address, p.allergies, p.emergency_contact_name, p.emergency_contact_phone, p.sms_consent, p.created_at`;

const FIELD_MAP = { firstName: 'first_name', lastName: 'last_name', gender: 'gender', dateOfBirth: 'date_of_birth', nic: 'nic',
  bloodGroup: 'blood_group', phone: 'phone', email: 'email', address: 'address', allergies: 'allergies',
  emergencyContactName: 'emergency_contact_name', emergencyContactPhone: 'emergency_contact_phone', smsConsent: 'sms_consent' };
// sms_consent is 0/1 and must not be turned into NULL like empty text fields.
const val = (k, v) => (k === 'smsConsent' ? (v ? 1 : 0) : v || null);

module.exports = {
  search: (q, limit = 50) => {
    if (!q) return db.query(`SELECT ${COLS} FROM patients p ORDER BY p.id DESC LIMIT ?`, [limit]);
    const like = `%${q}%`;
    return db.query(
      `SELECT ${COLS} FROM patients p
        WHERE p.mrn LIKE ? OR p.phone LIKE ? OR p.nic LIKE ? OR CONCAT(p.first_name,' ',p.last_name) LIKE ?
        ORDER BY p.last_name, p.first_name LIMIT ?`, [like, like, like, like, limit]);
  },

  get: (id) => db.one(`SELECT ${COLS} FROM patients p WHERE p.id = ?`, [id]),

  findDuplicate: (firstName, lastName, dob, excludeId = 0) => db.one(
    'SELECT id, mrn FROM patients WHERE first_name = ? AND last_name = ? AND date_of_birth = ? AND id <> ?',
    [firstName, lastName, dob, excludeId]),

  // Inserts with a temporary MRN, then sets MRN-000123 from the new id, all in one transaction.
  create: (p, userId) => db.withTransaction(async (q) => {
    const cols = Object.keys(FIELD_MAP).filter((k) => p[k] !== undefined);
    const r = await q(
      `INSERT INTO patients (mrn, ${cols.map((k) => FIELD_MAP[k]).join(', ')}, created_by)
       VALUES (?, ${cols.map(() => '?').join(', ')}, ?)`,
      [`TMP-${crypto.randomBytes(8).toString('hex')}`, ...cols.map((k) => val(k, p[k])), userId]);
    await q("UPDATE patients SET mrn = CONCAT('MRN-', LPAD(id, 6, '0')) WHERE id = ?", [r.insertId]);
    return r.insertId;
  }),

  update: (id, p) => {
    const sets = []; const params = [];
    for (const [k, col] of Object.entries(FIELD_MAP)) if (p[k] !== undefined) { sets.push(`${col} = ?`); params.push(val(k, p[k])); }
    if (!sets.length) return Promise.resolve();
    return db.query(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  },

  // Full clinical history for doctors.
  history: async (id) => {
    const records = await db.query(
      `SELECT r.id, r.visit_date, r.complaint, r.diagnosis, r.icd10_code, r.clinical_notes, r.treatment_plan,
              d.full_name AS doctor_name, rx.id AS prescription_id, rx.status AS prescription_status
         FROM medical_records r JOIN doctors d ON d.id = r.doctor_id
    LEFT JOIN prescriptions rx ON rx.record_id = r.id
        WHERE r.patient_id = ? ORDER BY r.visit_date DESC, r.id DESC`, [id]);
    const rxIds = records.filter((r) => r.prescription_id).map((r) => r.prescription_id);
    const items = rxIds.length ? await db.query(
      `SELECT i.prescription_id, m.name, m.strength, i.dosage, i.frequency, i.duration_days, i.quantity
         FROM prescription_items i JOIN medicines m ON m.id = i.medicine_id WHERE i.prescription_id IN (?)`, [rxIds]) : [];
    for (const r of records) r.items = items.filter((i) => i.prescription_id === r.prescription_id);
    const labs = await db.query(
      `SELECT l.id, l.requested_at, l.status, l.priority, l.result_value, l.result_flag, l.remarks, l.completed_at,
              t.name AS test_name, t.reference_range, t.unit
         FROM lab_requests l JOIN lab_tests t ON t.id = l.test_id WHERE l.patient_id = ? ORDER BY l.requested_at DESC`, [id]);
    const appointments = await db.query(
      `SELECT a.id, a.appointment_date, TIME_FORMAT(a.appointment_time,'%H:%i') AS appointment_time, a.reason, a.status,
              d.full_name AS doctor_name
         FROM appointments a JOIN doctors d ON d.id = a.doctor_id WHERE a.patient_id = ?
        ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 50`, [id]);
    const vitals = await db.query(
      `SELECT v.*, u.full_name AS recorded_by_name FROM vitals v LEFT JOIN users u ON u.id = v.recorded_by
        WHERE v.patient_id = ? ORDER BY v.recorded_at DESC LIMIT 30`, [id]);
    return { records, labs, appointments, vitals };
  },
};
