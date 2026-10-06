// Receptionist: book, reschedule, check in and cancel. Doctor: sees own appointments and completes them.
const { z } = require('zod');
const db = require('../models/db');
const Appointments = require('../models/appointmentModel');
const Doctors = require('../models/doctorModel');
const { audit } = require('../services/auditService');
const { alerts } = require('../services/notificationService');
const sms = require('../services/smsService');
const t = require('../services/timeService');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const SLOT_MINUTES = 15;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM');
const STATUSES = ['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'];

const schemas = {
  list: z.object({
    date: date.optional(), from: date.optional(), to: date.optional(),
    doctorId: z.coerce.number().int().positive().optional(),
    patientId: z.coerce.number().int().positive().optional(),
    status: z.enum(STATUSES).optional(),
  }),
  slots: z.object({ doctorId: z.coerce.number().int().positive(), date }),
  create: z.object({
    patientId: z.coerce.number().int().positive(),
    doctorId: z.coerce.number().int().positive(),
    date, time,
    reason: z.string().trim().max(255).optional(),
  }),
  reschedule: z.object({ date, time }),
  status: z.object({ status: z.enum(['checked_in', 'completed', 'cancelled', 'no_show']) }),
};

// Allowed status changes, and which roles may make them.
const TRANSITIONS = {
  checked_in: { from: ['scheduled'], roles: ['admin', 'receptionist', 'nurse'] },
  cancelled: { from: ['scheduled', 'checked_in'], roles: ['admin', 'receptionist'] },
  no_show: { from: ['scheduled', 'checked_in'], roles: ['admin', 'receptionist', 'doctor', 'nurse'] },
  completed: { from: ['checked_in', 'scheduled'], roles: ['doctor'] },
};

async function checkSlot(doctorId, d, tm) {
  const doctor = await Doctors.get(doctorId);
  if (!doctor || !doctor.is_active) throw new HttpError(400, 'Choose an active doctor.');
  if (d < t.today() || (d === t.today() && tm < t.nowTime())) throw new HttpError(400, 'Appointments cannot be booked in the past.');
  const sch = await Doctors.scheduleFor(doctorId, t.weekday(d));
  if (!sch) throw new HttpError(400, `${doctor.full_name} does not consult on ${t.DAY_NAMES[t.weekday(d)]}s.`);
  if (tm < sch.start_time || tm >= sch.end_time) {
    throw new HttpError(400, `${doctor.full_name} consults from ${sch.start_time} to ${sch.end_time} on ${t.DAY_NAMES[t.weekday(d)]}s.`);
  }
  const [, mm] = tm.split(':').map(Number);
  if (mm % SLOT_MINUTES !== 0) throw new HttpError(400, `Choose a time on a ${SLOT_MINUTES}-minute slot (e.g. 09:00, 09:15).`);
  return doctor;
}

async function list(req, res) {
  const f = { ...req.validQuery };
  if (req.user.role === 'doctor') f.doctorId = req.user.doctorId || -1;   // doctors see only their own list
  res.json(await Appointments.list(f));
}

// Free and taken times for one doctor on one day (used by reception and by patients booking online).
async function computeSlots(doctorId, d) {
  const sch = await Doctors.scheduleFor(doctorId, t.weekday(d));
  if (!sch) return { slots: [], message: 'The doctor does not consult on this day.' };
  const booked = new Set((await Appointments.bookedTimes(doctorId, d)).map((r) => r.t));
  const out = [];
  for (let s = sch.start_time; s < sch.end_time; s = t.addMinutes(s, SLOT_MINUTES)) {
    const past = d < t.today() || (d === t.today() && s < t.nowTime());
    out.push({ time: s, available: !booked.has(s) && !past });
  }
  return { slots: out, session: sch };
}

async function slots(req, res) {
  res.json(await computeSlots(req.validQuery.doctorId, req.validQuery.date));
}

async function create(req, res) {
  const b = req.body;
  const patient = await db.one('SELECT id, mrn FROM patients WHERE id = ?', [b.patientId]);
  if (!patient) throw new HttpError(400, 'Choose a registered patient.');
  await checkSlot(b.doctorId, b.date, b.time);
  const r = await Appointments.book(b, req.user.id);
  if (r.clash === 'doctor') throw new HttpError(409, 'That time is already booked for this doctor. Choose another slot.');
  if (r.clash === 'patient') throw new HttpError(409, 'This patient already has an appointment at that time.');
  await audit(req, 'APPOINTMENT_CREATE', { entity: 'appointment', entityId: r.id, details: { mrn: patient.mrn, doctorId: b.doctorId, date: b.date, time: b.time } });
  const appt = await Appointments.get(r.id);
  await alerts.appointmentBooked(appt);
  await sms.forAppointment('APPT_BOOKED', r.id, req.user.id);
  res.status(201).json(appt);
}

async function reschedule(req, res) {
  const id = parseId(req.params.id);
  const a = await Appointments.get(id);
  if (!a) throw new HttpError(404, 'Appointment not found.');
  if (!['scheduled', 'checked_in'].includes(a.status)) throw new HttpError(400, `A ${a.status.replace('_', ' ')} appointment cannot be rescheduled.`);
  await checkSlot(a.doctor_id, req.body.date, req.body.time);
  const r = await Appointments.book({ patientId: a.patient_id, doctorId: a.doctor_id, ...req.body, excludeId: id }, req.user.id);
  if (r.clash) throw new HttpError(409, 'That time is already booked. Choose another slot.');
  await audit(req, 'APPOINTMENT_RESCHEDULE', { entity: 'appointment', entityId: id,
    details: { from: `${a.appointment_date} ${a.appointment_time}`, to: `${req.body.date} ${req.body.time}` } });
  const moved = await Appointments.get(id);
  await alerts.appointmentRescheduled(moved);
  await sms.forAppointment('APPT_RESCHEDULED', id, req.user.id);
  res.json(moved);
}

async function setStatus(req, res) {
  const id = parseId(req.params.id);
  const { status } = req.body;
  const a = await Appointments.get(id);
  if (!a) throw new HttpError(404, 'Appointment not found.');
  const rule = TRANSITIONS[status];
  if (!rule.roles.includes(req.user.role)) throw new HttpError(403, 'Your role cannot make this change.');
  if (req.user.role === 'doctor' && a.doctor_id !== req.user.doctorId) throw new HttpError(403, 'This appointment belongs to another doctor.');
  if (!rule.from.includes(a.status)) throw new HttpError(400, `Cannot change a ${a.status.replace('_', ' ')} appointment to ${status.replace('_', ' ')}.`);
  await Appointments.setStatus(id, status);
  await audit(req, 'APPOINTMENT_STATUS', { entity: 'appointment', entityId: id, details: { from: a.status, to: status } });
  if (status === 'checked_in') await alerts.patientCheckedIn(a);
  if (status === 'cancelled') { await alerts.appointmentCancelled(a); await sms.forAppointment('APPT_CANCELLED', id, req.user.id); }
  res.json(await Appointments.get(id));
}

module.exports = { schemas, list, slots, create, reschedule, setStatus, checkSlot, computeSlots };
