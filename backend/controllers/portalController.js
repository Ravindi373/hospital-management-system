// Patient self-service portal (/api/me/...).
// Every query here is filtered by the signed-in patient's own record (req.user.patientId).
// No patient id is ever taken from the browser, so one patient can never see another's data.
const { z } = require('zod');
const db = require('../models/db');
const Patients = require('../models/patientModel');
const Appointments = require('../models/appointmentModel');
const Doctors = require('../models/doctorModel');
const Vitals = require('../models/vitalsModel');
const appts = require('./appointmentController');
const { audit } = require('../services/auditService');
const { alerts } = require('../services/notificationService');
const sms = require('../services/smsService');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM');
const optPhone = z.string().trim().regex(/^0\d{9}$/, 'use a 10-digit number').optional().or(z.literal('').transform(() => null));
const schemas = {
  profile: z.object({
    phone: z.string().trim().regex(/^0\d{9}$/, 'use a 10-digit number such as 0771234567').optional(),
    email: z.string().trim().toLowerCase().email().max(150).optional().or(z.literal('').transform(() => null)),
    address: z.string().trim().max(255).optional(),
    emergencyContactName: z.string().trim().max(120).optional(),
    emergencyContactPhone: optPhone,
    smsConsent: z.boolean().optional(),
  }),
  book: z.object({ doctorId: z.coerce.number().int().positive(), date, time, reason: z.string().trim().max(255).optional() }),
  slots: z.object({ doctorId: z.coerce.number().int().positive(), date }),
};

// Middleware: the account must be linked to a hospital record.
function requireLinkedPatient(req, res, next) {
  if (!req.user.patientId) return next(new HttpError(403, 'Your account is not linked to a hospital record yet. Please contact reception.'));
  return next();
}

async function summary(req, res) {
  const pid = req.user.patientId;
  const [s] = await db.query(
    `SELECT (SELECT COUNT(*) FROM appointments WHERE patient_id = ? AND status IN ('scheduled','checked_in') AND appointment_date >= CURDATE()) AS upcoming,
            (SELECT COALESCE(SUM(total - amount_paid),0) FROM invoices WHERE patient_id = ? AND status IN ('unpaid','partially_paid')) AS balance,
            (SELECT COUNT(*) FROM lab_requests WHERE patient_id = ? AND status = 'completed') AS lab_results,
            (SELECT COUNT(*) FROM lab_requests WHERE patient_id = ? AND status IN ('requested','sample_collected')) AS lab_pending,
            (SELECT COUNT(*) FROM medical_records WHERE patient_id = ?) AS visits`, [pid, pid, pid, pid, pid]);
  const next = await db.one(
    `SELECT a.id, a.appointment_date, TIME_FORMAT(a.appointment_time,'%H:%i') AS appointment_time, a.reason, a.status, d.full_name AS doctor_name, d.specialization
       FROM appointments a JOIN doctors d ON d.id = a.doctor_id
      WHERE a.patient_id = ? AND a.status IN ('scheduled','checked_in') AND a.appointment_date >= CURDATE()
      ORDER BY a.appointment_date, a.appointment_time LIMIT 1`, [pid]);
  const patient = await Patients.get(pid);
  const latestVitals = await Vitals.latest(pid);
  res.json({ patient, next, latestVitals, counts: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)])) });
}

const profile = async (req, res) => res.json(await Patients.get(req.user.patientId));

async function updateProfile(req, res) {
  await Patients.update(req.user.patientId, req.body);
  await audit(req, 'PORTAL_PROFILE_UPDATE', { entity: 'patient', entityId: req.user.patientId, details: { fields: Object.keys(req.body) } });
  res.json(await Patients.get(req.user.patientId));
}

const appointments = async (req, res) => {
  const rows = await Appointments.list({ patientId: req.user.patientId });
  res.json(rows.reverse().map(({ allergies, record_id, ...a }) => a));
};

async function doctors(req, res) {
  const list = await Doctors.list({ activeOnly: true });
  res.json(list.map((d) => ({ id: d.id, full_name: d.full_name, specialization: d.specialization, department: d.department,
    consultation_fee: d.consultation_fee, schedule: d.schedule })));
}

const slots = async (req, res) => res.json(await appts.computeSlots(req.validQuery.doctorId, req.validQuery.date));

async function book(req, res) {
  const b = req.body;
  await appts.checkSlot(b.doctorId, b.date, b.time);
  const upcoming = await db.one(
    "SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ? AND status = 'scheduled' AND appointment_date >= CURDATE()", [req.user.patientId]);
  if (Number(upcoming.n) >= 3) throw new HttpError(400, 'You already have 3 upcoming appointments. Cancel one or call reception to book more.');
  const r = await Appointments.book({ ...b, patientId: req.user.patientId }, req.user.id);
  if (r.clash === 'doctor') throw new HttpError(409, 'That time was just taken. Choose another time.');
  if (r.clash === 'patient') throw new HttpError(409, 'You already have an appointment at that time.');
  await audit(req, 'PORTAL_APPOINTMENT_BOOKED', { entity: 'appointment', entityId: r.id, details: { doctorId: b.doctorId, date: b.date, time: b.time } });
  const appt = await Appointments.get(r.id);
  await alerts.appointmentBooked(appt);
  await sms.forAppointment('APPT_BOOKED', r.id, req.user.id);
  res.status(201).json(appt);
}

async function cancel(req, res) {
  const id = parseId(req.params.id);
  const a = await Appointments.get(id);
  if (!a || a.patient_id !== req.user.patientId) throw new HttpError(404, 'Appointment not found.');
  if (a.status !== 'scheduled') throw new HttpError(400, 'Only a scheduled appointment can be cancelled online. Please contact reception.');
  await Appointments.setStatus(id, 'cancelled');
  await audit(req, 'PORTAL_APPOINTMENT_CANCELLED', { entity: 'appointment', entityId: id });
  await alerts.appointmentCancelled(a);
  await sms.forAppointment('APPT_CANCELLED', id, req.user.id);
  res.json(await Appointments.get(id));
}

// Diagnoses, treatment plans and prescriptions. The doctor's private clinical notes are not shown.
async function records(req, res) {
  const pid = req.user.patientId;
  const recs = await db.query(
    `SELECT r.id, r.visit_date, r.complaint, r.diagnosis, r.icd10_code, r.treatment_plan, d.full_name AS doctor_name,
            rx.id AS prescription_id, rx.status AS prescription_status
       FROM medical_records r JOIN doctors d ON d.id = r.doctor_id LEFT JOIN prescriptions rx ON rx.record_id = r.id
      WHERE r.patient_id = ? ORDER BY r.visit_date DESC, r.id DESC`, [pid]);
  const ids = recs.filter((r) => r.prescription_id).map((r) => r.prescription_id);
  const items = ids.length ? await db.query(
    `SELECT i.prescription_id, m.name, m.strength, i.dosage, i.frequency, i.duration_days, i.quantity, i.instructions
       FROM prescription_items i JOIN medicines m ON m.id = i.medicine_id WHERE i.prescription_id IN (?)`, [ids]) : [];
  for (const r of recs) r.items = items.filter((i) => i.prescription_id === r.prescription_id);
  await audit(req, 'PORTAL_RECORDS_VIEW', { entity: 'patient', entityId: pid });
  res.json(recs);
}

async function lab(req, res) {
  res.json(await db.query(
    `SELECT l.id, t.name AS test_name, t.reference_range, t.unit, l.status, l.priority, l.requested_at, l.completed_at,
            IF(l.status = 'completed', l.result_value, NULL) AS result_value, IF(l.status = 'completed', l.result_flag, NULL) AS result_flag,
            IF(l.status = 'completed', l.remarks, NULL) AS remarks, d.full_name AS doctor_name
       FROM lab_requests l JOIN lab_tests t ON t.id = l.test_id LEFT JOIN doctors d ON d.id = l.doctor_id
      WHERE l.patient_id = ? AND l.status <> 'cancelled' ORDER BY l.requested_at DESC`, [req.user.patientId]));
}

async function bills(req, res) {
  const invs = await db.query(
    `SELECT id, invoice_no, created_at, subtotal, discount, total, amount_paid, total - amount_paid AS balance, status
       FROM invoices WHERE patient_id = ? AND status <> 'void' ORDER BY id DESC`, [req.user.patientId]);
  if (invs.length) {
    const ids = invs.map((i) => i.id);
    const items = await db.query('SELECT invoice_id, item_type, description, amount FROM invoice_items WHERE invoice_id IN (?) ORDER BY id', [ids]);
    const pays = await db.query('SELECT invoice_id, receipt_no, amount, method, paid_at FROM payments WHERE invoice_id IN (?) ORDER BY id', [ids]);
    for (const i of invs) { i.items = items.filter((x) => x.invoice_id === i.id); i.payments = pays.filter((x) => x.invoice_id === i.id); }
  }
  res.json(invs);
}

const vitals = async (req, res) => res.json(await Vitals.forPatient(req.user.patientId, 20));

module.exports = { schemas, requireLinkedPatient, summary, profile, updateProfile, appointments, doctors, slots, book, cancel, records, lab, bills, vitals };
