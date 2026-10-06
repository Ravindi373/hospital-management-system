// Admin: user accounts, sign-up approvals, roles, password resets and unlocks.
const { z } = require('zod');
const db = require('../models/db');
const Users = require('../models/userModel');
const passwords = require('../services/passwordService');
const sessions = require('../services/sessionService');
const { audit } = require('../services/auditService');
const notifications = require('../services/notificationService');
const { STAFF_ROLES } = require('../middleware/rbac');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const role = z.enum(STAFF_ROLES);   // patient accounts come only from patient sign-up
const schemas = {
  list: z.object({ status: z.enum(['pending', 'active', 'disabled']).optional(), role: z.enum([...STAFF_ROLES, 'patient']).optional() }),
  create: z.object({
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/, 'use 3-50 lowercase letters, numbers, dots, dashes or underscores'),
    fullName: z.string().trim().min(3).max(120),
    email: z.string().trim().toLowerCase().email().max(150).optional().or(z.literal('')),
    phone: z.string().trim().regex(/^0\d{9}$/, 'use a 10-digit number').optional().or(z.literal('')),
    role,
    doctorId: z.coerce.number().int().positive().optional().nullable(),
    tempPassword: z.string().max(200),
  }),
  update: z.object({
    fullName: z.string().trim().min(3).max(120).optional(),
    email: z.string().trim().toLowerCase().email().max(150).optional(),
    phone: z.string().trim().regex(/^0\d{9}$/).optional(),
    role: role.optional(),
    status: z.enum(['active', 'disabled']).optional(),
    doctorId: z.coerce.number().int().positive().optional().nullable(),
  }),
  approve: z.object({ role: role.optional(), doctorId: z.coerce.number().int().positive().optional().nullable() }),
  reset: z.object({ tempPassword: z.string().max(200) }),
  reject: z.object({ reason: z.string().trim().max(255).optional() }),
};

async function linkDoctor(userId, userRole, doctorId) {
  await db.query('UPDATE doctors SET user_id = NULL WHERE user_id = ?', [userId]);
  if (userRole === 'doctor') {
    if (!doctorId) throw new HttpError(400, 'Choose the doctor profile this account belongs to.');
    const d = await db.one('SELECT id, user_id FROM doctors WHERE id = ?', [doctorId]);
    if (!d) throw new HttpError(400, 'That doctor profile does not exist.');
    if (d.user_id && d.user_id !== userId) throw new HttpError(409, 'That doctor profile is already linked to another account.');
    await db.query('UPDATE doctors SET user_id = ? WHERE id = ?', [userId, doctorId]);
  }
}

async function list(req, res) {
  res.json(await Users.list(req.validQuery));
}

async function create(req, res) {
  const b = req.body;
  const problem = passwords.policyError(b.tempPassword, b.username);
  if (problem) throw new HttpError(400, problem);
  if (b.role === 'doctor' && !b.doctorId) throw new HttpError(400, 'Choose the doctor profile this account belongs to.');
  const r = await Users.create({
    username: b.username, passwordHash: await passwords.hash(b.tempPassword), fullName: b.fullName,
    email: b.email || null, phone: b.phone || null, role: b.role, status: 'active', mustChange: true,
  });
  await linkDoctor(r.insertId, b.role, b.doctorId);
  await audit(req, 'USER_CREATE', { entity: 'user', entityId: r.insertId, details: { username: b.username, role: b.role } });
  res.status(201).json(await Users.findById(r.insertId));
}

async function update(req, res) {
  const id = parseId(req.params.id);
  const b = req.body;
  const before = await Users.findById(id);
  if (!before) throw new HttpError(404, 'User not found.');
  if (before.role === 'patient' && b.role && b.role !== 'patient') throw new HttpError(400, 'A patient account cannot be given a staff role. Create a separate staff account.');
  if (id === req.user.id && ((b.role && b.role !== before.role) || b.status === 'disabled')) {
    throw new HttpError(400, 'You cannot change your own role or disable your own account.');
  }
  await Users.update(id, b);
  const newRole = b.role || before.role;
  if (newRole !== 'patient' && (b.doctorId !== undefined || b.role)) await linkDoctor(id, newRole, b.doctorId ?? before.doctor_id);
  // A changed role or a disabled account takes effect immediately: end the user's sessions.
  if ((b.role && b.role !== before.role) || b.status === 'disabled') await sessions.destroyUserSessions(id);
  await audit(req, 'USER_UPDATE', { entity: 'user', entityId: id, details: {
    username: before.username, ...b, previousRole: before.role, previousStatus: before.status } });
  res.json(await Users.findById(id));
}

async function approve(req, res) {
  const id = parseId(req.params.id);
  const u = await Users.findById(id);
  if (!u) throw new HttpError(404, 'User not found.');
  if (u.status !== 'pending') throw new HttpError(400, 'This account is not waiting for approval.');
  if (u.role === 'patient') {
    // Reception has checked the person's NIC against the linked hospital record.
    await Users.review(id, 'active');
    await audit(req, 'PATIENT_ACCOUNT_APPROVED', { entity: 'user', entityId: id, details: { username: u.username, mrn: u.patient_mrn } });
    return res.json(await Users.findById(id));
  }
  if (req.user.role !== 'admin') throw new HttpError(403, 'Only an administrator can approve staff accounts.');
  if (!req.body.role) throw new HttpError(400, 'Choose the role for this account.');
  await linkDoctor(id, req.body.role, req.body.doctorId);
  await Users.update(id, { role: req.body.role });
  await Users.review(id, 'active');
  await audit(req, 'USER_APPROVED', { entity: 'user', entityId: id, details: { username: u.username, role: req.body.role } });
  await notifications.accountApproved(u, req.body.role);
  res.json(await Users.findById(id));
}

async function reject(req, res) {
  const id = parseId(req.params.id);
  const u = await Users.findById(id);
  if (!u || u.status !== 'pending') throw new HttpError(400, 'This account is not waiting for approval.');
  if (u.role !== 'patient' && req.user.role !== 'admin') throw new HttpError(403, 'Only an administrator can decline staff accounts.');
  const reason = (req.body && req.body.reason) || '';
  await Users.review(id, 'disabled', reason);       // '' = declined without a reason (NULL means never declined)
  await audit(req, 'USER_REJECTED', { entity: 'user', entityId: id, details: { username: u.username, reason } });
  await notifications.accountDeclined(u, reason);
  res.json({ ok: true });
}

async function resetPassword(req, res) {
  const id = parseId(req.params.id);
  const u = await Users.findById(id);
  if (!u) throw new HttpError(404, 'User not found.');
  const problem = passwords.policyError(req.body.tempPassword, u.username);
  if (problem) throw new HttpError(400, problem);
  await Users.setPassword(id, await passwords.hash(req.body.tempPassword), true);
  await sessions.destroyUserSessions(id);
  await audit(req, 'PASSWORD_RESET', { entity: 'user', entityId: id, details: { username: u.username } });
  res.json({ ok: true });
}

async function unlock(req, res) {
  const id = parseId(req.params.id);
  await Users.unlock(id);
  await audit(req, 'USER_UNLOCKED', { entity: 'user', entityId: id });
  res.json({ ok: true });
}

module.exports = { schemas, list, create, update, approve, reject, resetPassword, unlock };
