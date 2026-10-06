// Admin: patient SMS log, send a private message, re-send failed messages, send a test SMS, run reminders now.
const { z } = require('zod');
const db = require('../models/db');
const sms = require('../services/smsService');
const { audit } = require('../services/auditService');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const schemas = {
  list: z.object({
    status: z.enum(['queued', 'sent', 'failed', 'skipped']).optional(),
    q: z.string().trim().max(40).optional(),
  }),
  test: z.object({ phone: z.string().trim().regex(/^(0|\+?94)\d{9}$/, 'use a Sri Lankan mobile number such as 0771234567') }),
  // Private message: to one patient (their saved number) or to a typed mobile number.
  send: z.object({
    patientId: z.number().int().positive().optional(),
    phone: z.string().trim().regex(/^(0|\+?94)\d{9}$/, 'use a Sri Lankan mobile number such as 0771234567').optional(),
    message: z.string().trim().min(2, 'type a message').max(300, 'keep the message under 300 characters'),
  }).refine((b) => !!b.patientId !== !!b.phone, { message: 'Choose a patient or type a mobile number' }),
};

async function list(req, res) {
  const where = []; const p = [];
  if (req.validQuery.status) { where.push('s.status = ?'); p.push(req.validQuery.status); }
  if (req.validQuery.q) { where.push('(s.phone LIKE ? OR pt.mrn = ? OR CONCAT(pt.first_name, " ", pt.last_name) LIKE ?)'); p.push(`%${req.validQuery.q.replace(/\D/g, '')}%`, req.validQuery.q, `%${req.validQuery.q}%`); }
  const rows = await db.query(
    `SELECT s.id, s.type, s.phone, s.message, s.status, s.provider, s.error, s.attempts, s.created_at, s.sent_at,
            pt.mrn, CONCAT(pt.first_name,' ',pt.last_name) AS patient_name, u.full_name AS sent_by
       FROM sms_messages s LEFT JOIN patients pt ON pt.id = s.patient_id LEFT JOIN users u ON u.id = s.created_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.id DESC LIMIT 200`, p);
  const counts = await db.query(
    'SELECT status, COUNT(*) AS n FROM sms_messages WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY status');
  res.json({ rows, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])), settings: sms.status() });
}

async function retry(req, res) {
  const id = parseId(req.params.id);
  const r = await db.query("UPDATE sms_messages SET status = 'queued', attempts = 0, error = NULL WHERE id = ? AND status = 'failed'", [id]);
  if (!r.affectedRows) throw new HttpError(409, 'Only a failed message can be re-sent.');
  await audit(req, 'SMS_RETRY', { entity: 'sms', entityId: id });
  await sms.processQueue();
  res.json(await db.one('SELECT id, status, error, provider FROM sms_messages WHERE id = ?', [id]));
}

async function test(req, res) {
  const id = await sms.queue({
    type: 'TEST', phone: req.body.phone, userId: req.user.id,
    text: `${process.env.HOSPITAL_NAME || 'City General Hospital'}: test message from the Hospital Management System.`,
  });
  if (!id) throw new HttpError(400, 'The message could not be queued.');
  await sms.processQueue();
  const row = await db.one('SELECT id, status, error, provider FROM sms_messages WHERE id = ?', [id]);
  await audit(req, 'SMS_TEST', { entity: 'sms', entityId: id, details: { status: row.status } });
  res.json(row);
}

async function send(req, res) {
  const { patientId, phone, message } = req.body;
  if (patientId && !(await db.one('SELECT id FROM patients WHERE id = ?', [patientId]))) throw new HttpError(404, 'Patient not found.');
  const name = process.env.HOSPITAL_NAME || 'City General Hospital';
  // Every message starts with the hospital name so the patient knows who it is from.
  const text = message.toLowerCase().startsWith(name.toLowerCase()) ? message : `${name}: ${message}`;
  const id = await sms.queue({ type: 'PRIVATE', patientId: patientId || null, phone: phone || null, text, userId: req.user.id });
  if (!id) throw new HttpError(400, 'The message could not be queued.');
  await sms.processQueue();
  const row = await db.one('SELECT id, status, error, provider, phone FROM sms_messages WHERE id = ?', [id]);
  // The audit log records who sent what to whom - but not the text itself, which may be private.
  await audit(req, 'SMS_PRIVATE', { entity: 'sms', entityId: id, details: { patientId: patientId || null, status: row.status, length: text.length } });
  res.json(row);
}

async function runReminders(req, res) {
  const n = await sms.queueReminders();
  await sms.processQueue();
  await audit(req, 'SMS_REMINDERS_RUN', { details: { queued: n } });
  res.json({ queued: n });
}

module.exports = { schemas, list, retry, test, send, runReminders };
