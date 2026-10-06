// All API routes. Every route except sign-in and sign-up requires a valid session (requireAuth),
// and each one declares the permission it needs (requirePermission) - see middleware/rbac.js.
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission: allow } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { asyncHandler: h } = require('../middleware/errorHandler');

const users = require('../controllers/userController');
const patients = require('../controllers/patientController');
const appts = require('../controllers/appointmentController');
const ds = require('../controllers/doctorStaffController');
const clin = require('../controllers/clinicalController');
const lab = require('../controllers/labController');
const meds = require('../controllers/medicineController');
const bill = require('../controllers/billingController');
const admin = require('../controllers/adminController');
const vitals = require('../controllers/vitalsController');
const portal = require('../controllers/portalController');
const notes = require('../controllers/notificationController');

router.use('/auth', require('./authRoutes'));

// Everything below needs a signed-in user.
router.use(requireAuth);

router.get('/dashboard', h(admin.dashboard));

// Users and sign-up approvals (admin)
router.get('/users', allow('users:manage'), validate(users.schemas.list, 'query'), h(users.list));
router.post('/users', allow('users:manage'), validate(users.schemas.create), h(users.create));
router.patch('/users/:id', allow('users:manage'), validate(users.schemas.update), h(users.update));
router.post('/users/:id/approve', allow('users:manage'), validate(users.schemas.approve), h(users.approve));
router.post('/users/:id/reject', allow('users:manage'), validate(users.schemas.reject), h(users.reject));
router.post('/users/:id/reset-password', allow('users:manage'), validate(users.schemas.reset), h(users.resetPassword));
router.post('/users/:id/unlock', allow('users:manage'), h(users.unlock));

// The signed-in user's notifications (bell icon)
router.get('/notifications', h(notes.list));
router.post('/notifications/read-all', h(notes.markAllRead));
router.post('/notifications/:id/read', h(notes.markRead));

// Vital signs (nurse station)
router.get('/vitals', allow('vitals:read'), validate(vitals.schemas.list, 'query'), h(vitals.list));
router.get('/vitals/queue', allow('vitals:write'), h(vitals.queue));
router.post('/vitals', allow('vitals:write'), validate(vitals.schemas.create), h(vitals.create));

// Patient portal - always the signed-in patient's own record
const self = [allow('portal:self'), portal.requireLinkedPatient];
router.get('/me/summary', ...self, h(portal.summary));
router.get('/me/profile', ...self, h(portal.profile));
router.patch('/me/profile', ...self, validate(portal.schemas.profile), h(portal.updateProfile));
router.get('/me/appointments', ...self, h(portal.appointments));
router.post('/me/appointments', ...self, validate(portal.schemas.book), h(portal.book));
router.post('/me/appointments/:id/cancel', ...self, h(portal.cancel));
router.get('/me/doctors', ...self, h(portal.doctors));
router.get('/me/slots', ...self, validate(portal.schemas.slots, 'query'), h(portal.slots));
router.get('/me/records', ...self, h(portal.records));
router.get('/me/lab', ...self, h(portal.lab));
router.get('/me/bills', ...self, h(portal.bills));
router.get('/me/vitals', ...self, h(portal.vitals));

// Patients
router.get('/patients', allow('patients:read'), validate(patients.schemas.search, 'query'), h(patients.search));
router.get('/patients/:id', allow('patients:read'), h(patients.get));
router.post('/patients', allow('patients:write'), validate(patients.schemas.create), h(patients.create));
router.patch('/patients/:id', allow('patients:write'), validate(patients.schemas.update), h(patients.update));
router.get('/patients/:id/history', allow('patients:history'), h(patients.history));

// Appointments
router.get('/appointments', allow('appointments:read'), validate(appts.schemas.list, 'query'), h(appts.list));
router.get('/appointments/slots', allow('appointments:read'), validate(appts.schemas.slots, 'query'), h(appts.slots));
router.post('/appointments', allow('appointments:write'), validate(appts.schemas.create), h(appts.create));
router.patch('/appointments/:id/reschedule', allow('appointments:write'), validate(appts.schemas.reschedule), h(appts.reschedule));
router.patch('/appointments/:id/status', allow('appointments:status'), validate(appts.schemas.status), h(appts.setStatus));

// Doctors, staff and departments
router.get('/doctors', allow('doctors:read', 'doctors:manage', 'users:manage'), h(ds.listDoctors));
router.get('/doctors/:id', allow('doctors:read'), h(ds.getDoctor));
router.post('/doctors', allow('doctors:manage'), validate(ds.schemas.doctorCreate), h(ds.createDoctor));
router.patch('/doctors/:id', allow('doctors:manage'), validate(ds.schemas.doctorUpdate), h(ds.updateDoctor));
router.put('/doctors/:id/schedule', allow('doctors:manage'), validate(ds.schemas.schedule), h(ds.setSchedule));
router.get('/staff', allow('staff:manage'), h(ds.listStaff));
router.post('/staff', allow('staff:manage'), validate(ds.schemas.staffCreate), h(ds.createStaff));
router.patch('/staff/:id', allow('staff:manage'), validate(ds.schemas.staffUpdate), h(ds.updateStaff));
router.get('/departments', allow('staff:manage', 'doctors:manage'), h(ds.listDepartments));
router.post('/departments', allow('staff:manage'), validate(ds.schemas.department), h(ds.createDepartment));

// Medical records and prescriptions
router.get('/records', allow('records:read'), validate(clin.schemas.listRecords, 'query'), h(clin.listRecords));
router.get('/records/:id', allow('records:read'), h(clin.getRecord));
router.post('/records', allow('records:write'), validate(clin.schemas.createRecord), h(clin.createRecord));
router.get('/prescriptions', allow('prescriptions:read'), validate(clin.schemas.listRx, 'query'), h(clin.listPrescriptions));
router.get('/prescriptions/:id', allow('prescriptions:read'), h(clin.getPrescription));
router.post('/prescriptions/:id/dispense', allow('prescriptions:dispense'), h(clin.dispense));
router.post('/prescriptions/:id/cancel', allow('records:write'), h(clin.cancelPrescription));

// Laboratory
router.get('/lab/tests', allow('lab:read', 'lab:catalogue', 'records:write'), h(lab.tests));
router.post('/lab/tests', allow('lab:catalogue'), validate(lab.schemas.testCreate), h(lab.createTest));
router.patch('/lab/tests/:id', allow('lab:catalogue'), validate(lab.schemas.testUpdate), h(lab.updateTest));
router.get('/lab/requests', allow('lab:read'), validate(lab.schemas.list, 'query'), h(lab.list));
router.post('/lab/requests', allow('lab:request'), validate(lab.schemas.create), h(lab.create));
router.post('/lab/requests/:id/collect', allow('lab:result'), h(lab.collect));
router.post('/lab/requests/:id/result', allow('lab:result'), validate(lab.schemas.result), h(lab.result));
router.post('/lab/requests/:id/cancel', allow('lab:request'), h(lab.cancel));

// Medicines and stock
router.get('/medicines', allow('medicines:read'), validate(meds.schemas.list, 'query'), h(meds.list));
router.get('/medicines/:id', allow('medicines:read'), h(meds.get));
router.post('/medicines', allow('medicines:write'), validate(meds.schemas.create), h(meds.create));
router.patch('/medicines/:id', allow('medicines:write'), validate(meds.schemas.update), h(meds.update));
router.post('/medicines/:id/restock', allow('medicines:write'), validate(meds.schemas.restock), h(meds.restock));
router.post('/medicines/:id/adjust', allow('medicines:write'), validate(meds.schemas.adjust), h(meds.adjust));

// Billing and payments
router.get('/billing/unbilled/:patientId', allow('billing:write'), h(bill.unbilled));
router.get('/billing/invoices', allow('billing:read'), validate(bill.schemas.list, 'query'), h(bill.list));
router.get('/billing/invoices/:id', allow('billing:read'), h(bill.get));
router.post('/billing/invoices', allow('billing:write'), validate(bill.schemas.create), h(bill.create));
router.post('/billing/invoices/:id/payments', allow('payments:write'), validate(bill.schemas.pay), h(bill.pay));
router.get('/billing/payments', allow('billing:read'), validate(bill.schemas.payments, 'query'), h(bill.payments));
router.get('/billing/payments/:id', allow('billing:read'), h(bill.getPayment));

// Reports, audit log, backups
router.get('/reports/:type', allow('reports:read', 'reports:revenue'), validate(admin.schemas.report, 'query'), h(admin.report));
router.get('/audit', allow('audit:read'), validate(admin.schemas.audit, 'query'), h(admin.auditLog));
router.get('/backups', allow('backup:manage'), h(admin.listBackups));
// Patient SMS log, re-send and test (admin)
const smsCtl = require('../controllers/smsController');
router.get('/sms', allow('sms:manage'), validate(smsCtl.schemas.list, 'query'), h(smsCtl.list));
router.post('/sms/send', allow('sms:manage'), validate(smsCtl.schemas.send), h(smsCtl.send));
router.post('/sms/test', allow('sms:manage'), validate(smsCtl.schemas.test), h(smsCtl.test));
router.post('/sms/reminders', allow('sms:manage'), h(smsCtl.runReminders));
router.post('/sms/:id/retry', allow('sms:manage'), h(smsCtl.retry));
router.post('/backups', allow('backup:manage'), h(admin.createBackup));

module.exports = router;
