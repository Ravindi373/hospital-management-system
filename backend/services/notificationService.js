// Notifications: in-app (the bell in the top bar) and email.
// Email uses SMTP when SMTP_HOST is set in .env (for example Gmail with an app password).
// Without SMTP, each email is written to logs/mail-outbox.log so you can see what would have been sent.
const fs = require('fs');
const path = require('path');
const db = require('../models/db');
const logDir = require('./logDir');

let transporter = null;
function mailer() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const hospital = () => process.env.HOSPITAL_NAME || 'City General Hospital';

async function sendEmail(to, subject, text) {
  if (!to) return;
  const body = `${text}\n\n-- \n${hospital()} - Hospital Management System\n${appUrl()}\nThis is an automatic message. Please do not reply.`;
  const t = mailer();
  try {
    if (t) {
      await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text: body });
    } else {
      const dir = logDir();
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'mail-outbox.log'),
        `==== ${new Date().toISOString()}\nTo: ${to}\nSubject: ${subject}\n\n${body}\n\n`);
    }
  } catch (err) {
    // A mail problem must never break sign-up or approval; it is logged for the admin to fix.
    console.error('EMAIL FAILED', to, subject, err.message);
  }
}

async function notify(userId, { type, title, body = null, link = null }) {
  await db.query('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)', [userId, type, title, body, link]);
}

async function notifyAdmins(n, emailSubject, emailText) {
  const admins = await db.query("SELECT id, email FROM users WHERE role = 'admin' AND status = 'active'");
  for (const a of admins) {
    await notify(a.id, n);
    if (emailSubject) await sendEmail(a.email, emailSubject, emailText);
  }
}

// ---- Account request events ----
const ROLE = { admin: 'Administrator', receptionist: 'Receptionist', doctor: 'Doctor', nurse: 'Nurse', lab_staff: 'Lab Staff',
  pharmacist: 'Pharmacist', accountant: 'Accountant', patient: 'Patient' };

async function accountRequested(u) {
  await notifyAdmins(
    { type: 'ACCOUNT_REQUEST', title: `New account request: ${u.fullName}`, body: `${ROLE[u.role]} · username ${u.username}. Review it in Users & roles.`, link: '/users' },
    `New account request: ${u.fullName} (${ROLE[u.role]})`,
    `${u.fullName} has asked for a ${ROLE[u.role]} account.\n\nUsername: ${u.username}\nEmail: ${u.email}\nPhone: ${u.phone}\n\nApprove or decline it here: ${appUrl()}/users`,
  );
  await sendEmail(u.email, 'We received your account request',
    `Hello ${u.fullName},\n\nWe received your request for a ${ROLE[u.role]} account (username: ${u.username}).\nAn administrator will review it. You will get another email when it is approved or declined.`);
}

async function accountApproved(u, role) {
  await notify(u.id, { type: 'ACCOUNT_APPROVED', title: 'Your account was approved', body: `Welcome! You have ${ROLE[role]} access.`, link: '/' });
  await sendEmail(u.email, 'Your account was approved',
    `Hello ${u.full_name},\n\nYour account request was approved. You can now sign in with your username "${u.username}".\nAccess level: ${ROLE[role]}\n\nSign in: ${appUrl()}/login`);
}

async function accountDeclined(u, reason) {
  await sendEmail(u.email, 'Your account request was declined',
    `Hello ${u.full_name},\n\nYour request for an account (username "${u.username}") was declined.${reason ? `\nReason: ${reason}` : ''}\n\nIf you think this is a mistake, please contact the hospital administration.`);
}

async function patientWelcome(userId, { fullName, email, mrn }) {
  await notify(userId, { type: 'WELCOME', title: 'Welcome to the patient portal', body: `Your hospital number is ${mrn}. You can book appointments and see your results here.`, link: '/' });
  await sendEmail(email, 'Your patient account is ready',
    `Hello ${fullName},\n\nYour patient account is ready. Your hospital number (MRN) is ${mrn}.\nYou can book appointments and see your results, prescriptions and bills online.\n\nSign in: ${appUrl()}/login`);
}

// ---- Staff alerts (in-app bell) ----
// Never let a notification problem break the action that triggered it.
const safe = (fn) => async (...args) => { try { await fn(...args); } catch (err) { console.error('NOTIFY FAILED', err.message); } };

const notifyRole = safe(async (role, n, exceptUserId = 0) => {
  const users = await db.query("SELECT id FROM users WHERE role = ? AND status = 'active' AND id <> ?", [role, exceptUserId]);
  for (const u of users) await notify(u.id, n);
});

const notifyDoctor = safe(async (doctorId, n) => {
  const d = await db.one("SELECT u.id FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = ? AND u.status = 'active'", [doctorId]);
  if (d) await notify(d.id, n);
});

const apptLabel = (a) => `${a.patient_name} · ${a.appointment_date} ${a.appointment_time}`;

const alerts = {
  appointmentBooked: (a) => notifyDoctor(a.doctor_id, { type: 'APPT_BOOKED', title: 'New appointment', body: apptLabel(a), link: '/appointments' }),
  appointmentRescheduled: (a) => notifyDoctor(a.doctor_id, { type: 'APPT_RESCHEDULED', title: 'Appointment moved', body: apptLabel(a), link: '/appointments' }),
  appointmentCancelled: (a) => notifyDoctor(a.doctor_id, { type: 'APPT_CANCELLED', title: 'Appointment cancelled', body: apptLabel(a), link: '/appointments' }),
  patientCheckedIn: (a) => notifyDoctor(a.doctor_id, { type: 'PATIENT_WAITING', title: `${a.patient_name} is waiting`, body: `Checked in for ${a.appointment_time}`, link: '/appointments' }),
  prescriptionSent: (rx) => notifyRole('pharmacist', { type: 'RX_NEW', title: 'New prescription to dispense', body: `${rx.patient_name} · ${rx.items} item(s) · ${rx.doctor_name}`, link: '/prescriptions' }),
  labRequested: (l) => notifyRole('lab_staff', { type: 'LAB_NEW', title: l.urgent ? 'URGENT lab request' : 'New lab request', body: `${l.patient_name} · ${l.tests}`, link: '/lab' }),
  labResultReady: (l) => notifyDoctor(l.doctor_id, {
    type: 'LAB_RESULT', title: l.result_flag === 'N' ? `Lab result: ${l.test_name}` : `Abnormal lab result (${l.result_flag}): ${l.test_name}`,
    body: `${l.patient_name} · ${l.result_value} ${l.unit || ''}`.trim(), link: `/patients/${l.patient_id}` }),
  chargesReady: (p) => notifyRole('accountant', { type: 'READY_TO_BILL', title: 'Charges ready to bill', body: `${p.patient_name} · medicines dispensed`, link: '/billing' }),
  lowStock: (m) => notifyRole('pharmacist', { type: 'LOW_STOCK', title: `${m.stock_quantity === 0 ? 'Out of stock' : 'Low stock'}: ${m.name} ${m.strength || ''}`.trim(),
    body: `${m.stock_quantity} left, reorder level ${m.reorder_level}`, link: '/medicines' }),
  accountLocked: (username) => notifyRole('admin', { type: 'ACCOUNT_LOCKED', title: `Account locked: ${username}`, body: 'Too many wrong passwords. Unlock it in Users & roles if this was the real user.', link: '/users' }),
  backupFailed: (msg) => notifyRole('admin', { type: 'BACKUP_FAILED', title: 'Database backup failed', body: String(msg).slice(0, 200), link: '/backups' }),
};

// Morning summary for pharmacists: anything low, out of stock, expired or expiring in 30 days.
const stockSummary = safe(async () => {
  const [r] = await db.query(
    `SELECT SUM(stock_quantity <= reorder_level) AS low, SUM(expiry_date < CURDATE()) AS expired,
            SUM(expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiring
       FROM medicines WHERE is_active = 1`);
  const low = Number(r.low || 0); const expired = Number(r.expired || 0); const expiring = Number(r.expiring || 0);
  if (low + expired + expiring === 0) return;
  await notifyRole('pharmacist', { type: 'STOCK_SUMMARY', title: 'Daily stock check',
    body: `${low} low or out of stock · ${expired} expired · ${expiring} expiring within 30 days`, link: '/medicines' });
});

module.exports = { sendEmail, notify, notifyAdmins, accountRequested, accountApproved, accountDeclined, patientWelcome,
  notifyRole, notifyDoctor, alerts, stockSummary };
