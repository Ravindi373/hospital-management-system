const db = require('./db');

module.exports = {
  list: ({ departmentId, status } = {}) => {
    const where = []; const p = [];
    if (departmentId) { where.push('s.department_id = ?'); p.push(departmentId); }
    if (status) { where.push('s.status = ?'); p.push(status); }
    return db.query(
      `SELECT s.id, s.user_id, u.username, u.role, s.full_name, s.designation, s.department_id, dep.name AS department,
              s.phone, s.email, s.hire_date, s.status
         FROM staff s LEFT JOIN departments dep ON dep.id = s.department_id LEFT JOIN users u ON u.id = s.user_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.full_name`, p);
  },

  get: (id) => db.one('SELECT * FROM staff WHERE id = ?', [id]),

  create: (s) => db.query(
    `INSERT INTO staff (user_id, full_name, designation, department_id, phone, email, hire_date, status)
     VALUES (?,?,?,?,?,?,?,?)`,
    [s.userId || null, s.fullName, s.designation, s.departmentId || null, s.phone || null, s.email || null, s.hireDate || null, s.status || 'active']),

  update: (id, s) => {
    const map = { userId: 'user_id', fullName: 'full_name', designation: 'designation', departmentId: 'department_id',
      phone: 'phone', email: 'email', hireDate: 'hire_date', status: 'status' };
    const sets = []; const p = [];
    for (const [k, col] of Object.entries(map)) if (s[k] !== undefined) { sets.push(`${col} = ?`); p.push(s[k]); }
    if (!sets.length) return Promise.resolve();
    return db.query(`UPDATE staff SET ${sets.join(', ')} WHERE id = ?`, [...p, id]);
  },

  departments: () => db.query('SELECT id, name FROM departments ORDER BY name'),
  createDepartment: (name) => db.query('INSERT INTO departments (name) VALUES (?)', [name]),
};
