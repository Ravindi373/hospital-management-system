const crypto = require('crypto');
const { z } = require('zod');
const db = require('../models/db');
const Users = require('../models/userModel');
const { today } = require('../services/timeService');
const notifications = require('../services/notificationService');
const passwords = require('../services/passwordService');
const sessions = require('../services/sessionService');
const { audit } = require('../services/auditService');
const { permissionsFor } = require('../middleware/rbac');
const { HttpError } = require('../middleware/errorHandler');

const MAX_FAILED = () => Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const LOCK_MINUTES = () => Number(process.env.LOGIN_LOCK_MINUTES || 15);
const BAD_LOGIN = 'Incorrect username or password.';

const schemas = {
  login: z.object({
    username: z.string().trim().min(1, 'Enter your username').max(50).toLowerCase(),
    password: z.string().min(1, 'Enter your password').max(200),
  }),
  // One sign-up form for every category. Patients give their personal details; staff give their full name.
  register: z.object({
    role: z.enum(['patient', 'doctor', 'nurse', 'receptionist', 'lab_staff', 'pharmacist', 'accountant'], { message: 'choose who you are' }),
    fullName: z.string().trim().min(3).max(120).optional(),
    firstName: z.string().trim().min(1).max(60).optional(),
    lastName: z.string().trim().min(1).max(60).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD').refine((d) => d <= today() && d >= '1900-01-01', 'date of birth must be in the past').optional(),
    nic: z.string().trim().toUpperCase().regex(/^(\d{9}[VX]|\d{12})$/, 'use the old (9 digits + V/X) or new (12 digits) NIC format').optional().or(z.literal('').transform(() => undefined)),
    address: z.string().trim().max(255).optional(),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/, 'use 3-50 lowercase letters, numbers, dots, dashes or underscores'),
    email: z.string().trim().toLowerCase().email().max(150),
    phone: z.string().trim().regex(/^0\d{9}$/, 'use a 10-digit number such as 0771234567'),
    password: z.string().max(200),
  }).superRefine((b, ctx) => {
    const need = b.role === 'patient' ? ['firstName', 'lastName', 'gender', 'dateOfBirth'] : ['fullName'];
    for (const k of need) if (!b[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'required' });
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().max(200),
  }),
};

function profile(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName || user.full_name,
    role: user.role,
    doctorId: user.doctorId || user.doctor_id || null,
    patientId: user.patientId || user.patient_id || null,
    mustChangePassword: !!(user.mustChangePassword ?? user.must_change_password),
    permissions: permissionsFor(user.role),
    idleMinutes: sessions.IDLE_MINUTES(),
  };
}

async function login(req, res) {
  const { username, password } = req.body;
  const user = await Users.findForLogin(username);

  if (!user) {
    await passwords.verifyDummy(password);
    await audit(req, 'LOGIN_FAILED', { user: { username }, details: { reason: 'unknown username' } });
    throw new HttpError(401, BAD_LOGIN, 'BAD_CREDENTIALS');
  }
  const who = { id: user.id, username: user.username, role: user.role };

  if (user.is_locked) {
    await audit(req, 'LOGIN_BLOCKED', { user: who, details: { reason: 'account locked' } });
    throw new HttpError(423, `This account is locked after too many failed attempts. Try again in ${user.lock_minutes_left} minute(s).`, 'LOCKED');
  }

  const ok = await passwords.verify(password, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    if (attempts >= MAX_FAILED()) {
      await Users.lock(user.id, LOCK_MINUTES());
      await audit(req, 'ACCOUNT_LOCKED', { user: who, details: { attempts } });
      await notifications.alerts.accountLocked(user.username);
      throw new HttpError(423, `Too many failed attempts. The account is locked for ${LOCK_MINUTES()} minutes.`, 'LOCKED');
    }
    await Users.setFailedAttempts(user.id, attempts);
    await audit(req, 'LOGIN_FAILED', { user: who, details: { reason: 'wrong password', attempts } });
    throw new HttpError(401, BAD_LOGIN, 'BAD_CREDENTIALS');
  }

  if (user.status === 'pending') {
    await audit(req, 'LOGIN_BLOCKED', { user: who, details: { reason: 'awaiting approval' } });
    throw new HttpError(403, 'Your account request is waiting for administrator approval. You will get an email when it is reviewed.', 'PENDING');
  }
  if (user.status !== 'active') {
    await audit(req, 'LOGIN_BLOCKED', { user: who, details: { reason: user.never_approved ? 'request declined' : 'account disabled' } });
    if (user.never_approved) {
      throw new HttpError(403, `Your account request was declined${user.rejection_reason ? `: ${user.rejection_reason}` : '.'} Contact the hospital administration if you think this is a mistake.`, 'DECLINED');
    }
    throw new HttpError(403, 'This account is disabled. Contact the administrator.', 'DISABLED');
  }

  await Users.recordSuccess(user.id);
  await sessions.createSession(req, res, user.id);
  await audit(req, 'LOGIN_SUCCESS', { user: who });
  const full = await Users.findById(user.id);
  res.json({ user: profile(full) });
}

async function logout(req, res) {
  await sessions.destroySession(req.sessionId);
  sessions.clearCookie(res);
  await audit(req, 'LOGOUT');
  res.json({ ok: true });
}

const me = async (req, res) => res.json({ user: profile(req.user) });

// Keeps the session alive while the person is actively using the page.
const ping = async (req, res) => res.json({ ok: true, idleMinutes: sessions.IDLE_MINUTES() });

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await Users.findAuthById(req.user.id);
  if (!(await passwords.verify(currentPassword, user.password_hash))) {
    await audit(req, 'PASSWORD_CHANGE_FAILED', { details: { reason: 'wrong current password' } });
    throw new HttpError(400, 'Your current password is incorrect.');
  }
  const problem = passwords.policyError(newPassword, user.username);
  if (problem) throw new HttpError(400, problem);
  if (await passwords.verify(newPassword, user.password_hash)) throw new HttpError(400, 'Choose a password different from your current one.');

  await Users.setPassword(user.id, await passwords.hash(newPassword), false);
  await sessions.destroyUserSessions(user.id, req.sessionId);   // sign out every other device
  await audit(req, 'PASSWORD_CHANGED');
  res.json({ ok: true });
}

// Self-service sign-up.
//  - Patient: the account works straight away (no approval).
//      * No hospital record yet -> a new patient record (MRN) is created with the account.
//      * NIC matches an existing record -> it is linked only if date of birth AND phone number also match
//        what the hospital has on file, so nobody can open someone else's history with just an NIC.
//  - Staff (doctor, nurse, receptionist, ...): the account is *pending* until an admin approves it.
//    Admins get a notification (bell + email); the applicant gets an email when it is approved or declined.
async function register(req, res) {
  const b = req.body;
  const problem = passwords.policyError(b.password, b.username);
  if (problem) throw new HttpError(400, problem);
  const passwordHash = await passwords.hash(b.password);
  const dup = (err) => { if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'That username or email is already registered.'); throw err; };

  if (b.role !== 'patient') {
    try {
      await Users.create({ username: b.username, passwordHash, fullName: b.fullName, email: b.email, phone: b.phone, role: b.role, status: 'pending' });
    } catch (err) { dup(err); }
    await audit(req, 'SIGNUP_REQUEST', { user: { username: b.username }, details: { role: b.role, fullName: b.fullName } });
    await notifications.accountRequested(b);
    return res.status(201).json({ active: false,
      message: 'Request sent. An administrator will review it, and you will get an email when it is approved or declined.' });
  }

  const fullName = `${b.firstName} ${b.lastName}`;
  const existing = b.nic
    ? await db.one('SELECT id, mrn, date_of_birth, phone FROM patients WHERE nic = ?', [b.nic])
    : await db.one('SELECT id, mrn, date_of_birth, phone FROM patients WHERE first_name = ? AND last_name = ? AND date_of_birth = ?', [b.firstName, b.lastName, b.dateOfBirth]);

  let patientId; let mrn;
  if (existing) {
    if (existing.date_of_birth !== b.dateOfBirth || existing.phone !== b.phone) {
      await audit(req, 'PATIENT_SIGNUP_MISMATCH', { user: { username: b.username }, entity: 'patient', entityId: existing.id });
      throw new HttpError(409, 'These details do not match the hospital record for this NIC. Check your date of birth and the phone number you gave the hospital, or ask reception to update it.');
    }
    if (await db.one('SELECT id FROM users WHERE patient_id = ?', [existing.id])) {
      throw new HttpError(409, 'An online account already exists for this hospital record. Sign in, or ask reception to reset your password.');
    }
    try {
      const r = await Users.create({ username: b.username, passwordHash, fullName, email: b.email, phone: b.phone, role: 'patient', status: 'active', patientId: existing.id });
      patientId = existing.id; mrn = existing.mrn;
      await audit(req, 'PATIENT_SIGNUP_LINKED', { user: { id: r.insertId, username: b.username, role: 'patient' }, entity: 'patient', entityId: patientId, details: { mrn } });
      await notifications.patientWelcome(r.insertId, { fullName, email: b.email, mrn });
    } catch (err) { dup(err); }
    return res.status(201).json({ active: true, mrn, message: `Account created and linked to your hospital record ${mrn}. You can sign in now.` });
  }

  let userId;
  try {
    ({ patientId, userId } = await db.withTransaction(async (q) => {
      const p = await q(
        `INSERT INTO patients (mrn, first_name, last_name, gender, date_of_birth, nic, phone, email, address)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [`TMP-${crypto.randomBytes(8).toString('hex')}`, b.firstName, b.lastName, b.gender, b.dateOfBirth, b.nic || null, b.phone, b.email, b.address || null]);
      await q("UPDATE patients SET mrn = CONCAT('MRN-', LPAD(id, 6, '0')) WHERE id = ?", [p.insertId]);
      const u = await Users.create({ username: b.username, passwordHash, fullName, email: b.email, phone: b.phone, role: 'patient', status: 'active', patientId: p.insertId }, q);
      return { patientId: p.insertId, userId: u.insertId };
    }));
  } catch (err) { dup(err); }
  ({ mrn } = await db.one('SELECT mrn FROM patients WHERE id = ?', [patientId]));
  await audit(req, 'PATIENT_SIGNUP', { user: { id: userId, username: b.username, role: 'patient' }, entity: 'patient', entityId: patientId, details: { mrn } });
  await notifications.patientWelcome(userId, { fullName, email: b.email, mrn });
  return res.status(201).json({ active: true, mrn, message: `Account created. Your hospital number is ${mrn}. You can sign in now.` });
}

module.exports = { schemas, login, logout, me, ping, changePassword, register };
