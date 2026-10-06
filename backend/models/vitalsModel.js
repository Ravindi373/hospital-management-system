const db = require('./db');

const SELECT = `SELECT v.id, v.patient_id, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient_name, v.appointment_id,
  v.bp_systolic, v.bp_diastolic, v.pulse, v.temperature, v.spo2, v.weight_kg, v.height_cm, v.notes, v.recorded_at,
  u.full_name AS recorded_by_name
  FROM vitals v JOIN patients p ON p.id = v.patient_id LEFT JOIN users u ON u.id = v.recorded_by`;

module.exports = {
  forPatient: (patientId, limit = 50) => db.query(`${SELECT} WHERE v.patient_id = ? ORDER BY v.recorded_at DESC, v.id DESC LIMIT ?`, [patientId, limit]),

  latest: (patientId) => db.one(`${SELECT} WHERE v.patient_id = ? ORDER BY v.recorded_at DESC, v.id DESC LIMIT 1`, [patientId]),

  get: (id) => db.one(`${SELECT} WHERE v.id = ?`, [id]),

  create: (v, userId) => db.query(
    `INSERT INTO vitals (patient_id, appointment_id, bp_systolic, bp_diastolic, pulse, temperature, spo2, weight_kg, height_cm, notes, recorded_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [v.patientId, v.appointmentId || null, v.bpSystolic ?? null, v.bpDiastolic ?? null, v.pulse ?? null, v.temperature ?? null,
      v.spo2 ?? null, v.weightKg ?? null, v.heightCm ?? null, v.notes || null, userId]),

  // Today's clinic for the nurse station: who is here, and whether their vitals are done.
  queue: () => db.query(
    `SELECT a.id, a.patient_id, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.allergies,
            TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) AS age, p.gender,
            TIME_FORMAT(a.appointment_time,'%H:%i') AS appointment_time, a.status, a.reason, d.full_name AS doctor_name,
            (SELECT v.id FROM vitals v WHERE v.appointment_id = a.id ORDER BY v.id DESC LIMIT 1) AS vitals_id
       FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id
      WHERE a.appointment_date = CURDATE() AND a.status IN ('scheduled','checked_in','completed')
      ORDER BY a.status = 'completed', a.appointment_time`),

  recordedToday: () => db.one('SELECT COUNT(*) AS n FROM vitals WHERE DATE(recorded_at) = CURDATE()'),
};
