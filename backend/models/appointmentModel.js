const db = require('./db');

const SELECT = `SELECT a.id, a.patient_id, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.allergies,
  a.doctor_id, d.full_name AS doctor_name, a.appointment_date, TIME_FORMAT(a.appointment_time,'%H:%i') AS appointment_time,
  a.reason, a.status, a.created_at,
  (SELECT r.id FROM medical_records r WHERE r.appointment_id = a.id) AS record_id
  FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id`;

const ACTIVE = "('scheduled','checked_in','completed')";

module.exports = {
  list: ({ date, from, to, doctorId, patientId, status }) => {
    const where = []; const p = [];
    if (date) { where.push('a.appointment_date = ?'); p.push(date); }
    if (from) { where.push('a.appointment_date >= ?'); p.push(from); }
    if (to) { where.push('a.appointment_date <= ?'); p.push(to); }
    if (doctorId) { where.push('a.doctor_id = ?'); p.push(doctorId); }
    if (patientId) { where.push('a.patient_id = ?'); p.push(patientId); }
    if (status) { where.push('a.status = ?'); p.push(status); }
    return db.query(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.appointment_date, a.appointment_time LIMIT 500`, p);
  },

  get: (id) => db.one(`${SELECT} WHERE a.id = ?`, [id]),

  bookedTimes: (doctorId, date) => db.query(
    `SELECT TIME_FORMAT(appointment_time,'%H:%i') AS t FROM appointments
      WHERE doctor_id = ? AND appointment_date = ? AND status IN ${ACTIVE}`, [doctorId, date]),

  // Books inside a transaction that locks the doctor row, so two receptionists cannot
  // book the same slot at the same moment.
  book: (a, userId) => db.withTransaction(async (q) => {
    await q('SELECT id FROM doctors WHERE id = ? FOR UPDATE', [a.doctorId]);
    const clash = await q(
      `SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
          AND status IN ${ACTIVE} AND id <> ?`, [a.doctorId, a.date, a.time, a.excludeId || 0]);
    if (clash.length) return { clash: 'doctor' };
    const pClash = await q(
      `SELECT id FROM appointments WHERE patient_id = ? AND appointment_date = ? AND appointment_time = ?
          AND status IN ${ACTIVE} AND id <> ?`, [a.patientId, a.date, a.time, a.excludeId || 0]);
    if (pClash.length) return { clash: 'patient' };
    if (a.excludeId) {
      await q("UPDATE appointments SET appointment_date = ?, appointment_time = ?, status = 'scheduled' WHERE id = ?",
        [a.date, a.time, a.excludeId]);
      return { id: a.excludeId };
    }
    const r = await q(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, reason, created_by)
       VALUES (?,?,?,?,?,?)`, [a.patientId, a.doctorId, a.date, a.time, a.reason || null, userId]);
    return { id: r.insertId };
  }),

  setStatus: (id, status) => db.query('UPDATE appointments SET status = ? WHERE id = ?', [status, id]),
};
