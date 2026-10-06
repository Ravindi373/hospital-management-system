// Receptionist: register and update patients. Doctors: read full history (audited).
const { z } = require('zod');
const Patients = require('../models/patientModel');
const { audit } = require('../services/auditService');
const { today } = require('../services/timeService');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const optText = (max) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
const base = {
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  gender: z.enum(['male', 'female', 'other']),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD').refine((d) => d <= today() && d >= '1900-01-01', 'date of birth must be in the past'),
  nic: z.string().trim().toUpperCase().regex(/^(\d{9}[VX]|\d{12})$/, 'use the old (9 digits + V/X) or new (12 digits) NIC format').optional().or(z.literal('').transform(() => undefined)),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional().or(z.literal('').transform(() => undefined)),
  phone: z.string().trim().regex(/^0\d{9}$/, 'use a 10-digit number such as 0771234567'),
  email: z.string().trim().toLowerCase().email().max(150).optional().or(z.literal('').transform(() => undefined)),
  address: optText(255),
  allergies: optText(255),
  emergencyContactName: optText(120),
  emergencyContactPhone: z.string().trim().regex(/^0\d{9}$/, 'use a 10-digit number').optional().or(z.literal('').transform(() => undefined)),
  smsConsent: z.boolean().optional(),
};
const schemas = {
  create: z.object(base),
  update: z.object(base).partial(),
  search: z.object({ q: z.string().trim().max(60).optional() }),
};

const search = async (req, res) => res.json(await Patients.search(req.validQuery.q));

async function get(req, res) {
  const p = await Patients.get(parseId(req.params.id));
  if (!p) throw new HttpError(404, 'Patient not found.');
  res.json(p);
}

async function create(req, res) {
  const b = req.body;
  const dup = await Patients.findDuplicate(b.firstName, b.lastName, b.dateOfBirth);
  if (dup) throw new HttpError(409, `A patient with this name and date of birth is already registered as ${dup.mrn}.`);
  const id = await Patients.create(b, req.user.id);
  const p = await Patients.get(id);
  await audit(req, 'PATIENT_CREATE', { entity: 'patient', entityId: id, details: { mrn: p.mrn } });
  res.status(201).json(p);
}

async function update(req, res) {
  const id = parseId(req.params.id);
  const before = await Patients.get(id);
  if (!before) throw new HttpError(404, 'Patient not found.');
  const b = req.body;
  if (b.firstName || b.lastName || b.dateOfBirth) {
    const dup = await Patients.findDuplicate(b.firstName || before.first_name, b.lastName || before.last_name, b.dateOfBirth || before.date_of_birth, id);
    if (dup) throw new HttpError(409, `Another patient with this name and date of birth exists (${dup.mrn}).`);
  }
  await Patients.update(id, b);
  await audit(req, 'PATIENT_UPDATE', { entity: 'patient', entityId: id, details: { mrn: before.mrn, fields: Object.keys(b) } });
  res.json(await Patients.get(id));
}

async function history(req, res) {
  const id = parseId(req.params.id);
  const patient = await Patients.get(id);
  if (!patient) throw new HttpError(404, 'Patient not found.');
  const h = await Patients.history(id);
  await audit(req, 'PATIENT_HISTORY_VIEW', { entity: 'patient', entityId: id, details: { mrn: patient.mrn } });
  res.json({ patient, ...h });
}

module.exports = { schemas, search, get, create, update, history };
