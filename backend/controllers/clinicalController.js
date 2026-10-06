// Doctor: diagnosis, treatment notes and prescriptions. Pharmacist: check and dispense prescriptions.
const { z } = require('zod');
const db = require('../models/db');
const Clinical = require('../models/clinicalModel');
const { audit } = require('../services/auditService');
const { alerts } = require('../services/notificationService');
const { allergyConflicts, defaultQuantity } = require('../services/clinicalService');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const optText = (max) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
const schemas = {
  listRecords: z.object({ patientId: z.coerce.number().int().positive().optional() }),
  createRecord: z.object({
    patientId: z.coerce.number().int().positive(),
    appointmentId: z.coerce.number().int().positive().optional().nullable(),
    complaint: optText(255),
    diagnosis: z.string().trim().min(2).max(255),
    icd10Code: z.string().trim().toUpperCase().regex(/^[A-Z]\d{2}(\.\d{1,4})?$/, 'use an ICD-10 code such as I10 or E11.9').optional().or(z.literal('').transform(() => undefined)),
    clinicalNotes: optText(5000),
    treatmentPlan: optText(5000),
    prescription: z.array(z.object({
      medicineId: z.coerce.number().int().positive(),
      dosage: z.string().trim().min(1).max(40),
      frequency: z.enum(['OD', 'BD', 'TDS', 'QDS', 'NOCTE', 'PRN', 'STAT']),
      durationDays: z.coerce.number().int().min(1).max(365),
      quantity: z.coerce.number().int().min(1).max(10000).optional(),
      instructions: optText(255),
    })).max(20).default([]),
    labTests: z.array(z.coerce.number().int().positive()).max(20).default([]),
    labPriority: z.enum(['routine', 'urgent']).default('routine'),
  }),
  listRx: z.object({
    status: z.enum(['pending', 'dispensed', 'cancelled']).optional(),
    patientId: z.coerce.number().int().positive().optional(),
  }),
};

async function listRecords(req, res) {
  const { patientId } = req.validQuery;
  // Without a patient filter a doctor sees the records they wrote.
  const rows = await Clinical.listRecords({ patientId, doctorId: patientId ? undefined : req.user.doctorId });
  if (patientId) await audit(req, 'RECORDS_VIEW', { entity: 'patient', entityId: patientId });
  res.json(rows);
}

async function getRecord(req, res) {
  const r = await Clinical.getRecord(parseId(req.params.id));
  if (!r) throw new HttpError(404, 'Record not found.');
  await audit(req, 'RECORD_VIEW', { entity: 'medical_record', entityId: r.id, details: { mrn: r.mrn } });
  res.json(r);
}

async function createRecord(req, res) {
  const b = req.body;
  if (!req.user.doctorId) throw new HttpError(403, 'Your account is not linked to a doctor profile. Ask the administrator.');
  const patient = await db.one('SELECT id, mrn, allergies FROM patients WHERE id = ?', [b.patientId]);
  if (!patient) throw new HttpError(400, 'Patient not found.');

  if (b.appointmentId) {
    const a = await db.one('SELECT id, patient_id, doctor_id, status FROM appointments WHERE id = ?', [b.appointmentId]);
    if (!a || a.patient_id !== b.patientId) throw new HttpError(400, 'That appointment does not belong to this patient.');
    if (a.doctor_id !== req.user.doctorId) throw new HttpError(403, 'That appointment belongs to another doctor.');
    if (!['scheduled', 'checked_in'].includes(a.status)) throw new HttpError(400, `That appointment is already ${a.status.replace('_', ' ')}.`);
    if (await db.one('SELECT id FROM medical_records WHERE appointment_id = ?', [a.id])) throw new HttpError(409, 'A record already exists for this appointment.');
  }

  const meds = await Clinical.medicinesByIds([...new Set(b.prescription.map((i) => i.medicineId))]);
  const medById = new Map(meds.map((m) => [m.id, m]));
  for (const i of b.prescription) {
    const m = medById.get(i.medicineId);
    if (!m || !m.is_active) throw new HttpError(400, 'One of the prescribed medicines is not in the formulary.');
    i.quantity = i.quantity || defaultQuantity(i.frequency, i.durationDays, m.form);
  }
  const conflicts = allergyConflicts(patient.allergies, meds);
  if (conflicts.length) {
    await audit(req, 'ALLERGY_ALERT', { entity: 'patient', entityId: patient.id, details: { allergies: patient.allergies, medicines: conflicts.map((m) => m.name) } });
    throw new HttpError(409, `Allergy alert: the patient is allergic to ${patient.allergies}. Remove ${conflicts.map((m) => m.name).join(', ')} or update the allergy record.`, 'ALLERGY');
  }
  const tests = await Clinical.testsByIds(b.labTests);
  if (tests.length !== new Set(b.labTests).size) throw new HttpError(400, 'One of the requested lab tests is not available.');

  const r = await Clinical.createRecord({ ...b, items: b.prescription, doctorId: req.user.doctorId, userId: req.user.id });
  await audit(req, 'RECORD_CREATE', { entity: 'medical_record', entityId: r.recordId, details: {
    mrn: patient.mrn, diagnosis: b.diagnosis, prescriptionItems: b.prescription.length, labTests: b.labTests.length } });
  const rec = await Clinical.getRecord(r.recordId);
  if (b.prescription.length) await alerts.prescriptionSent({ patient_name: rec.patient_name, doctor_name: rec.doctor_name, items: b.prescription.length });
  if (tests.length) await alerts.labRequested({ patient_name: rec.patient_name, tests: tests.map((x) => x.name).join(', '), urgent: b.labPriority === 'urgent' });
  res.status(201).json(rec);
}

async function listPrescriptions(req, res) {
  const f = { ...req.validQuery };
  if (req.user.role === 'doctor') f.doctorId = req.user.doctorId || -1;
  res.json(await Clinical.listPrescriptions(f));
}

async function getPrescription(req, res) {
  const rx = await Clinical.getPrescription(parseId(req.params.id));
  if (!rx) throw new HttpError(404, 'Prescription not found.');
  if (req.user.role === 'doctor' && rx.doctor_id !== req.user.doctorId) throw new HttpError(403, 'This prescription belongs to another doctor.');
  res.json(rx);
}

async function dispense(req, res) {
  const id = parseId(req.params.id);
  const r = await Clinical.dispense(id, req.user.id);
  if (r.error) throw new HttpError(r.status, r.error);
  const rx = await Clinical.getPrescription(id);
  // Alert pharmacists about anything this dispense pushed to or below its reorder level.
  const low = await db.query(
    'SELECT name, strength, stock_quantity, reorder_level FROM medicines WHERE id IN (?) AND stock_quantity <= reorder_level', [rx.items.map((i) => i.medicine_id)]);
  for (const m of low) await alerts.lowStock(m);
  await alerts.chargesReady({ patient_name: rx.patient_name });
  await audit(req, 'PRESCRIPTION_DISPENSED', { entity: 'prescription', entityId: id, details: {
    mrn: rx.mrn, items: rx.items.map((i) => `${i.name} x${i.quantity}`) } });
  res.json(rx);
}

async function cancelPrescription(req, res) {
  const id = parseId(req.params.id);
  const rx = await Clinical.getPrescription(id);
  if (!rx) throw new HttpError(404, 'Prescription not found.');
  if (rx.doctor_id !== req.user.doctorId) throw new HttpError(403, 'Only the prescribing doctor can cancel this prescription.');
  if (rx.status !== 'pending') throw new HttpError(400, `This prescription is already ${rx.status}.`);
  await Clinical.cancelPrescription(id);
  await audit(req, 'PRESCRIPTION_CANCELLED', { entity: 'prescription', entityId: id });
  res.json(await Clinical.getPrescription(id));
}

module.exports = { schemas, listRecords, getRecord, createRecord, listPrescriptions, getPrescription, dispense, cancelPrescription };
