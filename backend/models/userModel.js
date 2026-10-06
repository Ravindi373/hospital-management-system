const db = require('./db');

const PUBLIC_COLS = `u.id, u.username, u.full_name, u.email, u.phone, u.role, u.status, u.patient_id, p.mrn AS patient_mrn,
  u.rejection_reason, u.reviewed_at,
  u.must_change_password, u.failed_attempts, u.locked_until, u.last_login_at, u.created_at,
  d.id AS doctor_id, d.full_name AS doctor_name`;

module.exports = {
  findForLogin: (username) => db.one(
    `SELECT id, username, password_hash, full_name, role, status, must_change_password, failed_attempts, rejection_reason,
            (rejection_reason IS NOT NULL) AS never_approved,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
            GREATEST(1, CEIL(TIMESTAMPDIFF(SECOND, NOW(), locked_until) / 60)) AS lock_minutes_left
       FROM users WHERE username = ?`, [username]),

  findAuthById: (id) => db.one('SELECT id, username, password_hash FROM users WHERE id = ?', [id]),

  findById: (id) => db.one(`SELECT ${PUBLIC_COLS} FROM users u LEFT JOIN doctors d ON d.user_id = u.id LEFT JOIN patients p ON p.id = u.patient_id WHERE u.id = ?`, [id]),

  list: ({ status, role }) => {
    const where = []; const p = [];
    if (status) { where.push('u.status = ?'); p.push(status); }
    if (role) { where.push('u.role = ?'); p.push(role); }
    return db.query(
      `SELECT ${PUBLIC_COLS} FROM users u LEFT JOIN doctors d ON d.user_id = u.id LEFT JOIN patients p ON p.id = u.patient_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY FIELD(u.status,'pending','active','disabled'), u.full_name`, p);
  },

  create: (u, q = db.query) => q(
    `INSERT INTO users (username, password_hash, full_name, email, phone, role, status, must_change_password, patient_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [u.username, u.passwordHash, u.fullName, u.email || null, u.phone || null, u.role, u.status, u.mustChange ? 1 : 0, u.patientId || null]),

  setFailedAttempts: (id, count) => db.query('UPDATE users SET failed_attempts = ? WHERE id = ?', [count, id]),

  lock: (id, minutes) => db.query(
    'UPDATE users SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?', [minutes, id]),

  recordSuccess: (id) => db.query(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [id]),

  setPassword: (id, passwordHash, mustChange) => db.query(
    `UPDATE users SET password_hash = ?, must_change_password = ?, password_changed_at = NOW(),
            failed_attempts = 0, locked_until = NULL WHERE id = ?`, [passwordHash, mustChange ? 1 : 0, id]),

  update: (id, fields) => {
    const map = { fullName: 'full_name', email: 'email', phone: 'phone', role: 'role', status: 'status' };
    const sets = []; const p = [];
    for (const [k, col] of Object.entries(map)) if (fields[k] !== undefined) { sets.push(`${col} = ?`); p.push(fields[k]); }
    if (!sets.length) return Promise.resolve();
    return db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...p, id]);
  },

  // Approve (status 'active', reason NULL) or decline (status 'disabled', reason text or '').
  review: (id, status, reason = null) => db.query(
    'UPDATE users SET status = ?, rejection_reason = ?, reviewed_at = NOW() WHERE id = ?', [status, reason, id]),

  unlock: (id) => db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [id]),
};
