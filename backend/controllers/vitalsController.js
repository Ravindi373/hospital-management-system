// Nurse station: record vital signs. Doctors read them during consultation.
const { z } = require('zod');
const db = require('../models/db');
const Vitals = require('../models/vitalsModel');
const { audit } = require('../services/auditService');
const { HttpError } = require('../middleware/errorHandler');

const num = (min, max) => z.coerce.number().min(min).max(max).optional().nullable();
const schemas = {
  create: z.object({
    patientId: z.coerce.number().int().positive(),
    appointmentId: z.coerce.number().int().positive().optional().nullable(),
    bpSystolic: num(50, 260),
    bpDiastolic: num(30, 160),
    pulse: num(20, 250),
    temperature: num(30, 45),
    spo2: num(50, 100),
    weightKg: num(0.5, 400),
    heightCm: num(30, 250),
    notes: z.string().trim().max(255).optional(),
  }).refine((v) => ['bpSystolic', 'pulse', 'temperature', 'spo2', 'weightKg', 'heightCm'].some((k) => v[k] != null), 'enter at least one measurement')
    .refine((v) => (v.bpSystolic == null) === (v.bpDiastolic == null), 'enter both blood pressure numbers')
    .refine((v) => v.bpSystolic == null || v.bpSystolic > v.bpDiastolic, 'systolic pressure must be higher than diastolic'),
  list: z.object({ patientId: z.coerce.number().int().positive() }),
};

async function list(req, res) {
  const { patientId } = req.validQuery;
  res.json(await Vitals.forPatient(patientId));
}

const queue = async (req, res) => res.json(await Vitals.queue());

async function create(req, res) {
  const b = req.body;
  const patient = await db.one('SELECT id, mrn FROM patients WHERE id = ?', [b.patientId]);
  if (!patient) throw new HttpError(400, 'Patient not found.');
  if (b.appointmentId) {
    const a = await db.one('SELECT patient_id FROM appointments WHERE id = ?', [b.appointmentId]);
    if (!a || a.patient_id !== b.patientId) throw new HttpError(400, 'That appointment does not belong to this patient.');
  }
  const r = await Vitals.create(b, req.user.id);
  await audit(req, 'VITALS_RECORDED', { entity: 'patient', entityId: b.patientId, details: { mrn: patient.mrn, appointmentId: b.appointmentId || null } });
  res.status(201).json(await Vitals.get(r.insertId));
}

module.exports = { schemas, list, queue, create };
