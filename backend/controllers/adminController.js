// Dashboard summaries (per role), reports, audit log and backups.
const { z } = require('zod');
const db = require('../models/db');
const reports = require('../services/reportService');
const backups = require('../services/backupService');
const { audit } = require('../services/auditService');
const { today, isoDate } = require('../services/timeService');
const { can } = require('../middleware/rbac');
const { HttpError } = require('../middleware/errorHandler');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const schemas = {
  report: z.object({ from: date.optional(), to: date.optional() }),
  audit: z.object({
    q: z.string().trim().max(60).optional(),
    action: z.string().trim().max(60).optional(),
    username: z.string().trim().max(50).optional(),
    from: date.optional(), to: date.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  }),
};

async function dashboard(req, res) {
  const u = req.user;
  const t = today();
  const out = { role: u.role, today: t, cards: {} };
  const c = out.cards;

  if (['admin', 'receptionist'].includes(u.role)) {
    const [r] = await db.query(
      `SELECT (SELECT COUNT(*) FROM patients) AS patients,
              (SELECT COUNT(*) FROM patients WHERE DATE(created_at) = CURDATE()) AS new_today,
              (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURDATE() AND status <> 'cancelled') AS appts_today,
              (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURDATE() AND status = 'checked_in') AS waiting`);
    Object.assign(c, r);
  }
  if (u.role === 'doctor') {
    const [r] = await db.query(
      `SELECT (SELECT COUNT(*) FROM appointments WHERE doctor_id = ? AND appointment_date = CURDATE() AND status <> 'cancelled') AS my_appts_today,
              (SELECT COUNT(*) FROM appointments WHERE doctor_id = ? AND appointment_date = CURDATE() AND status = 'checked_in') AS waiting,
              (SELECT COUNT(*) FROM prescriptions WHERE doctor_id = ? AND status = 'pending') AS rx_pending,
              (SELECT COUNT(*) FROM lab_requests WHERE doctor_id = ? AND status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)) AS lab_results_new`,
      [u.doctorId, u.doctorId, u.doctorId, u.doctorId]);
    Object.assign(c, r);
  }
  if (u.role === 'nurse') {
    const [r] = await db.query(
      `SELECT (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURDATE() AND status <> 'cancelled') AS appts_today,
              (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURDATE() AND status = 'checked_in') AS waiting,
              (SELECT COUNT(*) FROM appointments a WHERE a.appointment_date = CURDATE() AND a.status IN ('scheduled','checked_in')
                  AND NOT EXISTS (SELECT 1 FROM vitals v WHERE v.appointment_id = a.id)) AS vitals_due,
              (SELECT COUNT(*) FROM vitals WHERE DATE(recorded_at) = CURDATE()) AS vitals_today`);
    Object.assign(c, r);
  }
  if (['admin', 'lab_staff'].includes(u.role)) {
    const [r] = await db.query(
      `SELECT SUM(status = 'requested') AS lab_requested, SUM(status = 'sample_collected') AS lab_awaiting_result,
              SUM(status IN ('requested','sample_collected') AND priority = 'urgent') AS lab_urgent
         FROM lab_requests`);
    Object.assign(c, r);
  }
  if (['admin', 'pharmacist'].includes(u.role)) {
    const [r] = await db.query(
      `SELECT (SELECT COUNT(*) FROM prescriptions WHERE status = 'pending') AS rx_to_dispense,
              (SELECT COUNT(*) FROM medicines WHERE is_active = 1 AND stock_quantity <= reorder_level) AS low_stock,
              (SELECT COUNT(*) FROM medicines WHERE is_active = 1 AND expiry_date < CURDATE()) AS expired,
              (SELECT COUNT(*) FROM medicines WHERE is_active = 1 AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)) AS expiring`);
    Object.assign(c, r);
  }
  if (['admin', 'accountant'].includes(u.role)) {
    const [r] = await db.query(
      `SELECT (SELECT COUNT(*) FROM invoices WHERE status IN ('unpaid','partially_paid')) AS unpaid_invoices,
              (SELECT COALESCE(SUM(total - amount_paid),0) FROM invoices WHERE status IN ('unpaid','partially_paid')) AS outstanding,
              (SELECT COALESCE(SUM(amount),0) FROM payments WHERE DATE(paid_at) = CURDATE()) AS collected_today,
              (SELECT COALESCE(SUM(amount),0) FROM payments WHERE paid_at >= DATE_FORMAT(CURDATE(),'%Y-%m-01')) AS collected_month`);
    Object.assign(c, r);
    const days = [];
    for (let i = 6; i >= 0; i -= 1) { const d = new Date(); d.setDate(d.getDate() - i); days.push(isoDate(d)); }
    const rows = await db.query(
      'SELECT DATE(paid_at) AS d, SUM(amount) AS total FROM payments WHERE DATE(paid_at) >= ? GROUP BY DATE(paid_at)', [days[0]]);
    out.payments7d = days.map((d) => ({ date: d, total: Number((rows.find((r) => r.d === d) || {}).total || 0) }));
  }
  if (u.role === 'admin') {
    const [r] = await db.query(
      `SELECT (SELECT COUNT(*) FROM users WHERE status = 'pending') AS pending_users,
              (SELECT COUNT(*) FROM audit_logs WHERE action IN ('LOGIN_FAILED','ACCOUNT_LOCKED') AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS failed_logins_24h`);
    Object.assign(c, r);
    out.lastBackup = backups.listBackups()[0] || null;
  }
  for (const k of Object.keys(c)) c[k] = Number(c[k] || 0);
  res.json(out);
}

const REPORTS = {
  patients: { fn: reports.patients, perm: 'reports:read' },
  appointments: { fn: reports.appointments, perm: 'reports:read' },
  revenue: { fn: reports.revenue, perm: 'reports:revenue' },
  pharmacy: { fn: reports.pharmacy, perm: 'reports:read' },
  laboratory: { fn: reports.laboratory, perm: 'reports:read' },
  staff: { fn: reports.staff, perm: 'reports:read' },
};

async function report(req, res) {
  const r = REPORTS[req.params.type];
  if (!r) throw new HttpError(404, 'Unknown report.');
  if (!can(req.user.role, r.perm)) throw new HttpError(403, 'Your role cannot open this report.');
  const to = req.validQuery.to || today();
  const d = new Date(`${to}T00:00:00`); d.setDate(d.getDate() - 29);
  const from = req.validQuery.from || isoDate(d);
  if (from > to) throw new HttpError(400, '"From" must be on or before "To".');
  const data = await r.fn(from, to);
  await audit(req, 'REPORT_VIEW', { entity: 'report', entityId: req.params.type, details: { from, to } });
  res.json({ ...data, from, to });
}

async function auditLog(req, res) {
  const f = req.validQuery;
  const where = []; const p = [];
  if (f.q) { where.push('(action LIKE ? OR details LIKE ? OR username LIKE ? OR entity_id = ?)'); p.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`, f.q); }
  if (f.action) { where.push('action = ?'); p.push(f.action); }
  if (f.username) { where.push('username = ?'); p.push(f.username); }
  if (f.from) { where.push('created_at >= ?'); p.push(`${f.from} 00:00:00`); }
  if (f.to) { where.push('created_at <= ?'); p.push(`${f.to} 23:59:59`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const size = 50;
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs ${w}`, p);
  const rows = await db.query(`SELECT * FROM audit_logs ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [...p, size, (f.page - 1) * size]);
  const actions = await db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
  res.json({ rows, total: Number(total), page: f.page, pageSize: size, actions: actions.map((a) => a.action) });
}

async function listBackups(req, res) {
  res.json({ backups: backups.listBackups(), schedule: process.env.BACKUP_CRON || '0 2 * * *',
    retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 30) });
}

async function createBackup(req, res) {
  try {
    const b = await backups.runBackup('manual');
    await audit(req, 'BACKUP_CREATED', { entity: 'backup', entityId: b.file, details: { size: b.size } });
    res.status(201).json(b);
  } catch (err) {
    await audit(req, 'BACKUP_FAILED', { details: { error: err.message } });
    throw new HttpError(500, `Backup failed: ${err.message}`);
  }
}

module.exports = { schemas, dashboard, report, auditLog, listBackups, createBackup };
