// Lab staff: register test requests, collect samples and enter results. Doctors: request tests and read results.
const { z } = require('zod');
const db = require('../models/db');
const Lab = require('../models/labModel');
const { audit } = require('../services/auditService');
const { alerts } = require('../services/notificationService');
const sms = require('../services/smsService');
const { labFlag } = require('../services/clinicalService');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const testBase = {
  name: z.string().trim().min(2).max(120),
  referenceRange: z.string().trim().min(1).max(60),
  unit: z.string().trim().max(30).optional(),
  price: z.coerce.number().min(0).max(1000000),
};
const schemas = {
  testCreate: z.object(testBase),
  testUpdate: z.object({ ...testBase, isActive: z.boolean().optional() }).partial(),
  list: z.object({
    status: z.enum(['requested', 'sample_collected', 'completed', 'cancelled']).optional(),
    open: z.enum(['1']).optional(),
    patientId: z.coerce.number().int().positive().optional(),
  }),
  create: z.object({
    patientId: z.coerce.number().int().positive(),
    doctorId: z.coerce.number().int().positive().optional().nullable(),
    testIds: z.array(z.coerce.number().int().positive()).min(1, 'choose at least one test').max(20),
    priority: z.enum(['routine', 'urgent']).default('routine'),
  }),
  result: z.object({
    resultValue: z.string().trim().min(1).max(60),
    remarks: z.string().trim().max(255).optional(),
  }),
};

const tests = async (req, res) => res.json(await Lab.tests(req.query.all === '1'));

async function createTest(req, res) {
  const r = await Lab.createTest(req.body);
  await audit(req, 'LAB_TEST_CREATE', { entity: 'lab_test', entityId: r.insertId, details: req.body });
  res.status(201).json(await Lab.getTest(r.insertId));
}

async function updateTest(req, res) {
  const id = parseId(req.params.id);
  if (!(await Lab.getTest(id))) throw new HttpError(404, 'Test not found.');
  await Lab.updateTest(id, req.body);
  await audit(req, 'LAB_TEST_UPDATE', { entity: 'lab_test', entityId: id, details: req.body });
  res.json(await Lab.getTest(id));
}

async function list(req, res) {
  const f = { ...req.validQuery, open: req.validQuery.open === '1' };
  if (req.user.role === 'doctor') f.doctorId = req.user.doctorId || -1;
  res.json(await Lab.list(f));
}

async function create(req, res) {
  const b = req.body;
  const patient = await db.one('SELECT id, mrn FROM patients WHERE id = ?', [b.patientId]);
  if (!patient) throw new HttpError(400, 'Patient not found.');
  const doctorId = req.user.role === 'doctor' ? req.user.doctorId : b.doctorId;
  const active = await db.query('SELECT id FROM lab_tests WHERE is_active = 1 AND id IN (?)', [b.testIds]);
  if (active.length !== new Set(b.testIds).size) throw new HttpError(400, 'One of the chosen tests is not available.');
  const ids = await Lab.create({ ...b, testIds: [...new Set(b.testIds)], doctorId, userId: req.user.id });
  await audit(req, 'LAB_REQUEST_CREATE', { entity: 'lab_request', entityId: ids.join(','), details: { mrn: patient.mrn, tests: b.testIds, priority: b.priority } });
  const created = await Promise.all(ids.map((id) => Lab.get(id)));
  if (req.user.role !== 'lab_staff') {
    await alerts.labRequested({ patient_name: created[0].patient_name, tests: created.map((x) => x.test_name).join(', '), urgent: b.priority === 'urgent' });
  }
  res.status(201).json(created);
}

async function collect(req, res) {
  const id = parseId(req.params.id);
  const r = await Lab.collect(id);
  if (!r.affectedRows) throw new HttpError(409, 'A sample can only be collected for a request that is still "requested".');
  const lr = await Lab.get(id);
  await audit(req, 'LAB_SAMPLE_COLLECTED', { entity: 'lab_request', entityId: id, details: { sampleId: lr.sample_id } });
  res.json(lr);
}

async function result(req, res) {
  const id = parseId(req.params.id);
  const lr = await Lab.get(id);
  if (!lr) throw new HttpError(404, 'Request not found.');
  if (lr.status !== 'sample_collected') throw new HttpError(409, 'Collect the sample before entering a result.');
  const flag = labFlag(lr.reference_range, req.body.resultValue);
  await Lab.saveResult(id, { value: req.body.resultValue, flag, remarks: req.body.remarks, userId: req.user.id });
  await audit(req, 'LAB_RESULT_ENTERED', { entity: 'lab_request', entityId: id, details: { mrn: lr.mrn, test: lr.test_name, flag } });
  const done = await Lab.get(id);
  if (done.doctor_id) await alerts.labResultReady(done);
  // Tell the patient once all of their open tests are finished (one SMS, not one per test).
  const open = await db.one("SELECT COUNT(*) AS n FROM lab_requests WHERE patient_id = ? AND status IN ('requested','sample_collected')", [lr.patient_id]);
  if (Number(open.n) === 0) await sms.queue({ type: 'LAB_READY', patientId: lr.patient_id, userId: req.user.id });
  res.json(done);
}

async function cancel(req, res) {
  const id = parseId(req.params.id);
  const lr = await Lab.get(id);
  if (!lr) throw new HttpError(404, 'Request not found.');
  if (req.user.role === 'doctor' && lr.doctor_id !== req.user.doctorId) throw new HttpError(403, 'This request belongs to another doctor.');
  const r = await Lab.cancel(id);
  if (!r.affectedRows) throw new HttpError(409, 'Only a request that has not been collected can be cancelled.');
  await audit(req, 'LAB_REQUEST_CANCELLED', { entity: 'lab_request', entityId: id });
  res.json(await Lab.get(id));
}

module.exports = { schemas, tests, createTest, updateTest, list, create, collect, result, cancel };
