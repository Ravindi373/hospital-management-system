// Admin: doctors (profiles, fees, weekly schedules), staff and departments.
const { z } = require('zod');
const Doctors = require('../models/doctorModel');
const Staff = require('../models/staffModel');
const { audit } = require('../services/auditService');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const phone = z.string().trim().regex(/^0\d{9}$/, 'use a 10-digit number').optional().or(z.literal('').transform(() => undefined));
const email = z.string().trim().toLowerCase().email().max(150).optional().or(z.literal('').transform(() => undefined));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM');

const doctorBase = {
  fullName: z.string().trim().min(3).max(120),
  specialization: z.string().trim().min(2).max(120),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
  licenseNo: z.string().trim().max(40).optional(),
  phone, email,
  consultationFee: z.coerce.number().min(0).max(1000000),
};
const staffBase = {
  fullName: z.string().trim().min(3).max(120),
  designation: z.string().trim().min(2).max(100),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
  phone, email,
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  status: z.enum(['active', 'inactive']).optional(),
  userId: z.coerce.number().int().positive().nullable().optional(),
};

const schemas = {
  doctorCreate: z.object(doctorBase),
  doctorUpdate: z.object({ ...doctorBase, isActive: z.boolean().optional() }).partial(),
  schedule: z.object({ sessions: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6), startTime: time, endTime: time,
  }).refine((s) => s.endTime > s.startTime, 'end time must be after start time')).max(7) })
    .refine((v) => new Set(v.sessions.map((s) => s.dayOfWeek)).size === v.sessions.length, 'one session per day'),
  staffCreate: z.object(staffBase),
  staffUpdate: z.object(staffBase).partial(),
  department: z.object({ name: z.string().trim().min(2).max(100) }),
};

const listDoctors = async (req, res) => res.json(await Doctors.list({ activeOnly: req.query.active === '1' }));

async function getDoctor(req, res) {
  const d = await Doctors.get(parseId(req.params.id));
  if (!d) throw new HttpError(404, 'Doctor not found.');
  res.json(d);
}

async function createDoctor(req, res) {
  const r = await Doctors.create(req.body);
  await audit(req, 'DOCTOR_CREATE', { entity: 'doctor', entityId: r.insertId, details: { name: req.body.fullName } });
  res.status(201).json(await Doctors.get(r.insertId));
}

async function updateDoctor(req, res) {
  const id = parseId(req.params.id);
  if (!(await Doctors.get(id))) throw new HttpError(404, 'Doctor not found.');
  await Doctors.update(id, req.body);
  await audit(req, 'DOCTOR_UPDATE', { entity: 'doctor', entityId: id, details: req.body });
  res.json(await Doctors.get(id));
}

async function setSchedule(req, res) {
  const id = parseId(req.params.id);
  if (!(await Doctors.get(id))) throw new HttpError(404, 'Doctor not found.');
  await Doctors.setSchedule(id, req.body.sessions);
  await audit(req, 'DOCTOR_SCHEDULE_UPDATE', { entity: 'doctor', entityId: id, details: { sessions: req.body.sessions.length } });
  res.json(await Doctors.get(id));
}

const listStaff = async (req, res) => res.json(await Staff.list({ departmentId: req.query.departmentId, status: req.query.status }));

async function createStaff(req, res) {
  const r = await Staff.create(req.body);
  await audit(req, 'STAFF_CREATE', { entity: 'staff', entityId: r.insertId, details: { name: req.body.fullName } });
  res.status(201).json(await Staff.get(r.insertId));
}

async function updateStaff(req, res) {
  const id = parseId(req.params.id);
  if (!(await Staff.get(id))) throw new HttpError(404, 'Staff member not found.');
  await Staff.update(id, req.body);
  await audit(req, 'STAFF_UPDATE', { entity: 'staff', entityId: id, details: req.body });
  res.json(await Staff.get(id));
}

const listDepartments = async (req, res) => res.json(await Staff.departments());

async function createDepartment(req, res) {
  const r = await Staff.createDepartment(req.body.name);
  await audit(req, 'DEPARTMENT_CREATE', { entity: 'department', entityId: r.insertId, details: req.body });
  res.status(201).json({ id: r.insertId, name: req.body.name });
}

module.exports = { schemas, listDoctors, getDoctor, createDoctor, updateDoctor, setSchedule,
  listStaff, createStaff, updateStaff, listDepartments, createDepartment };
