const db = require('./db');

async function attachSchedules(doctors) {
  if (!doctors.length) return doctors;
  const rows = await db.query(
    `SELECT doctor_id, day_of_week, TIME_FORMAT(start_time,'%H:%i') AS start_time, TIME_FORMAT(end_time,'%H:%i') AS end_time
       FROM doctor_schedules WHERE doctor_id IN (?) ORDER BY day_of_week`, [doctors.map((d) => d.id)]);
  for (const d of doctors) d.schedule = rows.filter((r) => r.doctor_id === d.id).map(({ doctor_id, ...r }) => r);
  return doctors;
}

const SELECT = `SELECT d.id, d.user_id, d.full_name, d.specialization, d.department_id, dep.name AS department,
  d.license_no, d.phone, d.email, d.consultation_fee, d.is_active, u.username
  FROM doctors d LEFT JOIN departments dep ON dep.id = d.department_id LEFT JOIN users u ON u.id = d.user_id`;

module.exports = {
  list: async ({ activeOnly = false } = {}) =>
    attachSchedules(await db.query(`${SELECT} ${activeOnly ? 'WHERE d.is_active = 1' : ''} ORDER BY d.full_name`)),

  get: async (id) => {
    const d = await db.one(`${SELECT} WHERE d.id = ?`, [id]);
    return d ? (await attachSchedules([d]))[0] : null;
  },

  scheduleFor: (doctorId, dayOfWeek) => db.one(
    `SELECT TIME_FORMAT(start_time,'%H:%i') AS start_time, TIME_FORMAT(end_time,'%H:%i') AS end_time
       FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?`, [doctorId, dayOfWeek]),

  create: (d) => db.query(
    `INSERT INTO doctors (full_name, specialization, department_id, license_no, phone, email, consultation_fee)
     VALUES (?,?,?,?,?,?,?)`,
    [d.fullName, d.specialization, d.departmentId || null, d.licenseNo || null, d.phone || null, d.email || null, d.consultationFee]),

  update: (id, d) => {
    const map = { fullName: 'full_name', specialization: 'specialization', departmentId: 'department_id', licenseNo: 'license_no',
      phone: 'phone', email: 'email', consultationFee: 'consultation_fee', isActive: 'is_active' };
    const sets = []; const p = [];
    for (const [k, col] of Object.entries(map)) if (d[k] !== undefined) { sets.push(`${col} = ?`); p.push(d[k]); }
    if (!sets.length) return Promise.resolve();
    return db.query(`UPDATE doctors SET ${sets.join(', ')} WHERE id = ?`, [...p, id]);
  },

  setSchedule: (doctorId, sessions) => db.withTransaction(async (q) => {
    await q('DELETE FROM doctor_schedules WHERE doctor_id = ?', [doctorId]);
    for (const s of sessions) {
      await q('INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time) VALUES (?,?,?,?)',
        [doctorId, s.dayOfWeek, s.startTime, s.endTime]);
    }
  }),
};
