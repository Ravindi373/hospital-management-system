// Patient SMS.
// Messages are written to the sms_messages table first (status "queued") and a background worker
// sends them, so a slow or failed SMS gateway never slows down or breaks the reception desk.
// Failed messages are retried up to 3 times and can be re-sent from the SMS page.
//
// Providers (SMS_PROVIDER in .env):
//   log      - nothing is sent; messages are marked "sent (log)" and written to logs/sms-outbox.log. Default.
//   notifylk - Notify.lk (Sri Lanka). Needs NOTIFYLK_USER_ID, NOTIFYLK_API_KEY, NOTIFYLK_SENDER_ID.
//   twilio   - Twilio. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.
//
// Privacy: messages never contain diagnoses, results or amounts - only dates, times, the doctor's
// name and the hospital's phone number. Patients who said "no" to SMS (sms_consent = 0) get nothing.
const fs = require('fs');
const path = require('path');
const db = require('../models/db');
const t = require('./timeService');

const MAX_ATTEMPTS = 3;
const provider = () => (process.env.SMS_PROVIDER || 'log').toLowerCase();
const enabled = () => process.env.SMS_ENABLED !== 'false';
const hospital = () => process.env.HOSPITAL_NAME || 'City General Hospital';
const phoneLine = () => (process.env.HOSPITAL_PHONE ? ` Call ${process.env.HOSPITAL_PHONE} for changes.` : '');

// 0771234567 / +94771234567 / 94771234567  ->  94771234567
function normalise(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(d)) return `94${d.slice(1)}`;
  if (/^94\d{9}$/.test(d)) return d;
  return null;
}

const shortDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

// ---- message templates (kept under 160 characters where possible = 1 SMS) ----
const TEMPLATES = {
  APPT_BOOKED: (a) => `${hospital()}: Appointment confirmed with ${a.doctor_name} on ${shortDate(a.appointment_date)} at ${a.appointment_time}. Ref AP-${a.id}.${phoneLine()}`,
  APPT_RESCHEDULED: (a) => `${hospital()}: Your appointment with ${a.doctor_name} is moved to ${shortDate(a.appointment_date)} at ${a.appointment_time}. Ref AP-${a.id}.${phoneLine()}`,
  APPT_CANCELLED: (a) => `${hospital()}: Your appointment with ${a.doctor_name} on ${shortDate(a.appointment_date)} at ${a.appointment_time} is cancelled.${phoneLine()}`,
  APPT_REMINDER: (a) => `${hospital()} reminder: appointment with ${a.doctor_name} tomorrow (${shortDate(a.appointment_date)}) at ${a.appointment_time}. Please arrive 15 min early. Ref AP-${a.id}.`,
  LAB_READY: () => `${hospital()}: Your lab report is ready. Collect it from the laboratory counter or view it in the patient portal.`,
};

// Queues a message. Returns the row id, or null if the patient has no valid number / said no to SMS.
async function queue({ type, patientId, appointmentId = null, data = {}, text = null, phone = null, userId = null, dedupeKey = null }) {
  let to = phone;
  let consent = 1;
  if (patientId) {
    const p = await db.one('SELECT phone, sms_consent FROM patients WHERE id = ?', [patientId]);
    if (!p) return null;
    to = to || p.phone;
    consent = p.sms_consent;
  }
  const message = (text || TEMPLATES[type](data)).slice(0, 480);
  const number = normalise(to);
  let status = 'queued'; let error = null;
  if (!enabled()) { status = 'skipped'; error = 'SMS is switched off (SMS_ENABLED=false)'; }
  else if (!consent) { status = 'skipped'; error = 'Patient has opted out of SMS'; }
  else if (!number) { status = 'skipped'; error = `Not a valid Sri Lankan mobile number: ${to || '(none)'}`; }
  try {
    const r = await db.query(
      `INSERT INTO sms_messages (patient_id, appointment_id, phone, message, type, status, error, created_by, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [patientId, appointmentId, number || String(to || '').slice(0, 20), message, type, status, error, userId, dedupeKey]);
    if (status === 'queued') setImmediate(() => processQueue().catch(() => {}));
    return r.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return null;      // reminder already queued
    console.error('SMS QUEUE FAILED', err.message);
    return null;
  }
}

// Convenience for appointment messages.
async function forAppointment(type, appointmentId, userId) {
  const a = await db.one(
    `SELECT a.id, a.patient_id, a.appointment_date, TIME_FORMAT(a.appointment_time,'%H:%i') AS appointment_time, d.full_name AS doctor_name
       FROM appointments a JOIN doctors d ON d.id = a.doctor_id WHERE a.id = ?`, [appointmentId]);
  if (!a) return null;
  return queue({ type, patientId: a.patient_id, appointmentId: a.id, data: a, userId,
    dedupeKey: type === 'APPT_REMINDER' ? `reminder:${a.id}:${a.appointment_date}` : null });
}

// ---- providers ----
async function sendNotifyLk(to, message) {
  const params = new URLSearchParams({
    user_id: process.env.NOTIFYLK_USER_ID || '', api_key: process.env.NOTIFYLK_API_KEY || '',
    sender_id: process.env.NOTIFYLK_SENDER_ID || 'NotifyDEMO', to, message,
  });
  const res = await fetch('https://app.notify.lk/api/v1/send', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status !== 'success') throw new Error(`Notify.lk: ${body.message || body.data || res.status}`);
  return 'notify.lk';
}

async function sendTwilio(to, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: `+${to}`, From: process.env.TWILIO_FROM || '', Body: message }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio: ${body.message || res.status}`);
  return body.sid || 'twilio';
}

function sendLog(to, message) {
  const dir = path.resolve(__dirname, '../../logs');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'sms-outbox.log'), `${new Date().toISOString()}  to ${to}\n${message}\n\n`);
  return 'log';
}

async function deliver(to, message) {
  switch (provider()) {
    case 'notifylk': return { provider: 'notifylk', ref: await sendNotifyLk(to, message) };
    case 'twilio': return { provider: 'twilio', ref: await sendTwilio(to, message) };
    default: return { provider: 'log', ref: sendLog(to, message) };
  }
}

// ---- worker ----
let running = false;
async function processQueue() {
  if (running) return;
  running = true;
  try {
    const rows = await db.query(
      `SELECT id, phone, message, attempts FROM sms_messages
        WHERE status = 'queued' AND attempts < ? ORDER BY id LIMIT 20`, [MAX_ATTEMPTS]);
    for (const m of rows) {
      try {
        const r = await deliver(m.phone, m.message);
        await db.query("UPDATE sms_messages SET status = 'sent', provider = ?, provider_ref = ?, attempts = attempts + 1, sent_at = NOW(), error = NULL WHERE id = ?",
          [r.provider, String(r.ref).slice(0, 120), m.id]);
      } catch (err) {
        const last = m.attempts + 1 >= MAX_ATTEMPTS;
        await db.query('UPDATE sms_messages SET attempts = attempts + 1, status = ?, provider = ?, error = ? WHERE id = ?',
          [last ? 'failed' : 'queued', provider(), String(err.message).slice(0, 255), m.id]);
        if (last) {
          // Tell admins once a message has given up.
          const { notifyRole } = require('./notificationService');
          await notifyRole('admin', { type: 'SMS_FAILED', title: 'An SMS could not be sent', body: `${m.phone}: ${String(err.message).slice(0, 120)}`, link: '/sms' });
        }
      }
    }
  } finally { running = false; }
}

// Reminders for tomorrow's appointments (run once a day by the scheduler).
async function queueReminders() {
  const tomorrow = t.isoDate(new Date(Date.now() + 864e5));
  const rows = await db.query("SELECT id FROM appointments WHERE appointment_date = ? AND status = 'scheduled'", [tomorrow]);
  let n = 0;
  for (const r of rows) if (await forAppointment('APPT_REMINDER', r.id, null)) n += 1;
  return n;
}

function start() {
  const cron = require('node-cron');
  setInterval(() => processQueue().catch((e) => console.error('SMS worker', e.message)), 30000).unref();
  const expr = process.env.SMS_REMINDER_CRON || '0 18 * * *';
  if (cron.validate(expr)) {
    cron.schedule(expr, () => queueReminders().then((n) => n && console.log(`Queued ${n} appointment reminder SMS`)).catch((e) => console.error('SMS reminders', e.message)));
  }
  console.log(`Patient SMS: ${enabled() ? `on, provider "${provider()}"` : 'off'}; reminders at "${expr}"`);
}

const status = () => ({
  enabled: enabled(), provider: provider(),
  configured: provider() === 'notifylk' ? !!(process.env.NOTIFYLK_USER_ID && process.env.NOTIFYLK_API_KEY)
    : provider() === 'twilio' ? !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) : true,
  senderId: provider() === 'notifylk' ? (process.env.NOTIFYLK_SENDER_ID || 'NotifyDEMO') : provider() === 'twilio' ? process.env.TWILIO_FROM || '' : null,
  reminderSchedule: process.env.SMS_REMINDER_CRON || '0 18 * * *',
});

module.exports = { queue, forAppointment, processQueue, queueReminders, start, status, normalise, TEMPLATES };
