// The six management reports. Each returns the same shape so the frontend can render any of them:
// { title, kpis: [{label, value}], breakdowns: [{title, rows: [{label, value}]}], columns, rows }
const db = require('../models/db');

const n = (v) => Number(v || 0);
const rs = (v) => `Rs. ${n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function patients(from, to) {
  const [k] = await db.query(
    `SELECT (SELECT COUNT(*) FROM patients) AS total,
            (SELECT COUNT(*) FROM patients WHERE DATE(created_at) BETWEEN ? AND ?) AS new_patients,
            (SELECT COUNT(*) FROM appointments WHERE status = 'completed' AND appointment_date BETWEEN ? AND ?) AS visits,
            (SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE status = 'completed' AND appointment_date BETWEEN ? AND ?) AS unique_seen`,
    [from, to, from, to, from, to]);
  const byGender = await db.query('SELECT gender AS label, COUNT(*) AS value FROM patients GROUP BY gender ORDER BY value DESC');
  const byAge = await db.query(
    `SELECT CASE WHEN a < 13 THEN '0-12' WHEN a < 18 THEN '13-17' WHEN a < 40 THEN '18-39' WHEN a < 60 THEN '40-59' ELSE '60+' END AS label,
            COUNT(*) AS value
       FROM (SELECT TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS a FROM patients) x GROUP BY label ORDER BY label`);
  const rows = await db.query(
    `SELECT mrn, CONCAT(first_name,' ',last_name) AS name, gender, TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age,
            phone, DATE(created_at) AS registered
       FROM patients WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC`, [from, to]);
  return {
    title: 'Patient report',
    kpis: [{ label: 'New registrations', value: n(k.new_patients) }, { label: 'Total patients', value: n(k.total) },
      { label: 'Patient visits', value: n(k.visits) }, { label: 'Unique patients seen', value: n(k.unique_seen) }],
    breakdowns: [{ title: 'All patients by sex', rows: byGender }, { title: 'All patients by age group', rows: byAge }],
    columns: [['mrn', 'MRN'], ['name', 'Name'], ['gender', 'Sex'], ['age', 'Age'], ['phone', 'Phone'], ['registered', 'Registered']],
    rows,
  };
}

async function appointments(from, to) {
  const byStatus = await db.query(
    'SELECT status AS label, COUNT(*) AS value FROM appointments WHERE appointment_date BETWEEN ? AND ? GROUP BY status ORDER BY value DESC', [from, to]);
  const byDoctor = await db.query(
    `SELECT d.full_name AS label, COUNT(*) AS value FROM appointments a JOIN doctors d ON d.id = a.doctor_id
      WHERE a.appointment_date BETWEEN ? AND ? GROUP BY d.id ORDER BY value DESC`, [from, to]);
  const total = byStatus.reduce((s, r) => s + n(r.value), 0);
  const get = (s) => n((byStatus.find((r) => r.label === s) || {}).value);
  const rows = await db.query(
    `SELECT a.id, a.appointment_date AS date, TIME_FORMAT(a.appointment_time,'%H:%i') AS time, p.mrn,
            CONCAT(p.first_name,' ',p.last_name) AS patient, d.full_name AS doctor, a.status
       FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id
      WHERE a.appointment_date BETWEEN ? AND ? ORDER BY a.appointment_date, a.appointment_time`, [from, to]);
  return {
    title: 'Appointment report',
    kpis: [{ label: 'Appointments', value: total }, { label: 'Completed', value: get('completed') },
      { label: 'No-show rate', value: total ? `${Math.round((get('no_show') / total) * 100)}%` : '0%' }, { label: 'Cancelled', value: get('cancelled') }],
    breakdowns: [{ title: 'By status', rows: byStatus }, { title: 'By doctor', rows: byDoctor }],
    columns: [['date', 'Date'], ['time', 'Time'], ['mrn', 'MRN'], ['patient', 'Patient'], ['doctor', 'Doctor'], ['status', 'Status']],
    rows,
  };
}

async function revenue(from, to) {
  const [k] = await db.query(
    `SELECT (SELECT COALESCE(SUM(total),0) FROM invoices WHERE status <> 'void' AND DATE(created_at) BETWEEN ? AND ?) AS billed,
            (SELECT COALESCE(SUM(discount),0) FROM invoices WHERE status <> 'void' AND DATE(created_at) BETWEEN ? AND ?) AS discounts,
            (SELECT COALESCE(SUM(amount),0) FROM payments WHERE DATE(paid_at) BETWEEN ? AND ?) AS collected,
            (SELECT COALESCE(SUM(total - amount_paid),0) FROM invoices WHERE status IN ('unpaid','partially_paid')) AS outstanding`,
    [from, to, from, to, from, to]);
  const byType = await db.query(
    `SELECT i.item_type AS label, SUM(i.amount) AS value FROM invoice_items i JOIN invoices v ON v.id = i.invoice_id
      WHERE v.status <> 'void' AND DATE(v.created_at) BETWEEN ? AND ? GROUP BY i.item_type ORDER BY value DESC`, [from, to]);
  const byMethod = await db.query(
    'SELECT method AS label, SUM(amount) AS value FROM payments WHERE DATE(paid_at) BETWEEN ? AND ? GROUP BY method ORDER BY value DESC', [from, to]);
  const rows = await db.query(
    `SELECT v.invoice_no, DATE(v.created_at) AS date, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient,
            v.total, v.amount_paid, v.status
       FROM invoices v JOIN patients p ON p.id = v.patient_id WHERE DATE(v.created_at) BETWEEN ? AND ? ORDER BY v.id`, [from, to]);
  return {
    title: 'Revenue report',
    kpis: [{ label: 'Billed', value: rs(k.billed) }, { label: 'Collected', value: rs(k.collected) },
      { label: 'Discounts', value: rs(k.discounts) }, { label: 'Outstanding (all time)', value: rs(k.outstanding) }],
    breakdowns: [{ title: 'Billed by charge type', rows: byType.map((r) => ({ ...r, value: n(r.value), display: rs(r.value) })) },
      { title: 'Collected by method', rows: byMethod.map((r) => ({ ...r, value: n(r.value), display: rs(r.value) })) }],
    columns: [['invoice_no', 'Invoice'], ['date', 'Date'], ['mrn', 'MRN'], ['patient', 'Patient'], ['total', 'Total'], ['amount_paid', 'Paid'], ['status', 'Status']],
    rows,
  };
}

async function pharmacy(from, to) {
  const [k] = await db.query(
    `SELECT (SELECT COUNT(*) FROM prescriptions WHERE status = 'dispensed' AND DATE(dispensed_at) BETWEEN ? AND ?) AS dispensed,
            (SELECT COUNT(*) FROM prescriptions WHERE status = 'pending') AS pending,
            (SELECT COALESCE(SUM(stock_quantity * unit_price),0) FROM medicines WHERE is_active = 1) AS stock_value,
            (SELECT COUNT(*) FROM medicines WHERE is_active = 1 AND (stock_quantity <= reorder_level OR expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY))) AS alerts`,
    [from, to]);
  const units = await db.query(
    `SELECT CONCAT(m.name, COALESCE(CONCAT(' ', m.strength), '')) AS label, -SUM(s.change_qty) AS value
       FROM stock_movements s JOIN medicines m ON m.id = s.medicine_id
      WHERE s.reason = 'dispense' AND DATE(s.created_at) BETWEEN ? AND ? GROUP BY m.id ORDER BY value DESC LIMIT 15`, [from, to]);
  const movements = await db.query(
    'SELECT reason AS label, SUM(ABS(change_qty)) AS value FROM stock_movements WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY reason', [from, to]);
  const rows = await db.query(
    `SELECT CONCAT(name, COALESCE(CONCAT(' ', strength), '')) AS medicine, form, stock_quantity, reorder_level, unit_price, batch_no, expiry_date,
            CASE WHEN expiry_date < CURDATE() THEN 'expired' WHEN stock_quantity = 0 THEN 'out of stock'
                 WHEN stock_quantity <= reorder_level THEN 'low stock'
                 WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY) THEN 'expiring soon' ELSE 'ok' END AS status
       FROM medicines WHERE is_active = 1 ORDER BY name`);
  return {
    title: 'Pharmacy report',
    kpis: [{ label: 'Prescriptions dispensed', value: n(k.dispensed) }, { label: 'Waiting to dispense', value: n(k.pending) },
      { label: 'Stock value', value: rs(k.stock_value) }, { label: 'Stock alerts', value: n(k.alerts) }],
    breakdowns: [{ title: 'Units dispensed by medicine', rows: units }, { title: 'Stock movements by reason', rows: movements }],
    columns: [['medicine', 'Medicine'], ['form', 'Form'], ['stock_quantity', 'In stock'], ['reorder_level', 'Reorder at'],
      ['unit_price', 'Unit price'], ['batch_no', 'Batch'], ['expiry_date', 'Expiry'], ['status', 'Status']],
    rows,
  };
}

async function laboratory(from, to) {
  const [k] = await db.query(
    `SELECT COUNT(*) AS total, SUM(status = 'completed') AS completed, SUM(result_flag IN ('L','H','A')) AS abnormal,
            AVG(CASE WHEN status = 'completed' THEN TIMESTAMPDIFF(MINUTE, collected_at, completed_at) END) AS tat
       FROM lab_requests WHERE DATE(requested_at) BETWEEN ? AND ?`, [from, to]);
  const byTest = await db.query(
    `SELECT t.name AS label, COUNT(*) AS value FROM lab_requests l JOIN lab_tests t ON t.id = l.test_id
      WHERE DATE(l.requested_at) BETWEEN ? AND ? GROUP BY t.id ORDER BY value DESC`, [from, to]);
  const byStatus = await db.query(
    'SELECT status AS label, COUNT(*) AS value FROM lab_requests WHERE DATE(requested_at) BETWEEN ? AND ? GROUP BY status', [from, to]);
  const rows = await db.query(
    `SELECT l.id, DATE(l.requested_at) AS date, p.mrn, CONCAT(p.first_name,' ',p.last_name) AS patient, t.name AS test,
            l.priority, l.status, l.result_value, l.result_flag
       FROM lab_requests l JOIN patients p ON p.id = l.patient_id JOIN lab_tests t ON t.id = l.test_id
      WHERE DATE(l.requested_at) BETWEEN ? AND ? ORDER BY l.id`, [from, to]);
  return {
    title: 'Laboratory report',
    kpis: [{ label: 'Tests requested', value: n(k.total) }, { label: 'Completed', value: n(k.completed) },
      { label: 'Abnormal results', value: n(k.abnormal) },
      { label: 'Average turnaround', value: k.tat == null ? '-' : `${(n(k.tat) / 60).toFixed(1)} h` }],
    breakdowns: [{ title: 'Requests by test', rows: byTest }, { title: 'Requests by status', rows: byStatus }],
    columns: [['id', 'Request'], ['date', 'Date'], ['mrn', 'MRN'], ['patient', 'Patient'], ['test', 'Test'],
      ['priority', 'Priority'], ['status', 'Status'], ['result_value', 'Result'], ['result_flag', 'Flag']],
    rows,
  };
}

async function staff(from, to) {
  const byDept = await db.query(
    `SELECT COALESCE(dep.name,'Unassigned') AS label, COUNT(*) AS value FROM
       (SELECT department_id FROM staff WHERE status = 'active' UNION ALL SELECT department_id FROM doctors WHERE is_active = 1) x
       LEFT JOIN departments dep ON dep.id = x.department_id GROUP BY label ORDER BY value DESC`);
  const byRole = await db.query("SELECT role AS label, COUNT(*) AS value FROM users WHERE status = 'active' GROUP BY role ORDER BY value DESC");
  const [k] = await db.query(
    `SELECT (SELECT COUNT(*) FROM staff WHERE status = 'active') AS staff_count,
            (SELECT COUNT(*) FROM doctors WHERE is_active = 1) AS doctors,
            (SELECT COUNT(*) FROM users WHERE status = 'pending') AS pending,
            (SELECT COUNT(*) FROM audit_logs WHERE action IN ('LOGIN_FAILED','ACCOUNT_LOCKED') AND DATE(created_at) BETWEEN ? AND ?) AS failed`, [from, to]);
  const rows = await db.query(
    `SELECT u.username, u.full_name, u.role, u.status, u.last_login_at,
            (SELECT COUNT(*) FROM audit_logs a WHERE a.user_id = u.id AND a.action = 'LOGIN_SUCCESS' AND DATE(a.created_at) BETWEEN ? AND ?) AS logins,
            (SELECT COUNT(*) FROM audit_logs a WHERE a.user_id = u.id AND DATE(a.created_at) BETWEEN ? AND ?) AS actions
       FROM users u ORDER BY u.full_name`, [from, to, from, to]);
  return {
    title: 'Staff report',
    kpis: [{ label: 'Active staff', value: n(k.staff_count) }, { label: 'Active doctors', value: n(k.doctors) },
      { label: 'Accounts awaiting approval', value: n(k.pending) }, { label: 'Failed sign-ins', value: n(k.failed) }],
    breakdowns: [{ title: 'Headcount by department', rows: byDept }, { title: 'Active accounts by role', rows: byRole }],
    columns: [['username', 'Username'], ['full_name', 'Name'], ['role', 'Role'], ['status', 'Status'],
      ['last_login_at', 'Last sign-in'], ['logins', 'Sign-ins'], ['actions', 'Actions logged']],
    rows,
  };
}

module.exports = { patients, appointments, revenue, pharmacy, laboratory, staff };
