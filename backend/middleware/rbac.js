// Role-Based Access Control.
// Each permission lists the roles allowed to use it. Routes declare the permission they need,
// so access rules live in one place and can be reviewed at a glance.
const { HttpError } = require('./errorHandler');

const ROLES = ['admin', 'receptionist', 'doctor', 'nurse', 'lab_staff', 'pharmacist', 'accountant', 'patient'];
const STAFF_ROLES = ROLES.filter((r) => r !== 'patient');

const PERMISSIONS = {
  // Patients
  'patients:read':          ['admin', 'receptionist', 'doctor', 'nurse', 'lab_staff', 'accountant'],
  'patients:write':         ['admin', 'receptionist'],
  'patients:history':       ['doctor', 'nurse'],              // full clinical history (read)
  // Appointments
  'appointments:read':      ['admin', 'receptionist', 'doctor', 'nurse'],
  'appointments:write':     ['admin', 'receptionist'],
  'appointments:status':    ['admin', 'receptionist', 'doctor', 'nurse'],
  // Doctors and staff
  'doctors:read':           ['admin', 'receptionist', 'doctor', 'nurse'],
  'doctors:manage':         ['admin'],
  'staff:manage':           ['admin'],
  // Clinical
  'records:read':           ['doctor'],
  'records:write':          ['doctor'],
  'prescriptions:read':     ['doctor', 'pharmacist'],
  'prescriptions:dispense': ['pharmacist'],
  // Vital signs
  'vitals:read':            ['doctor', 'nurse'],
  'vitals:write':           ['doctor', 'nurse'],
  // Laboratory
  'lab:read':               ['doctor', 'nurse', 'lab_staff'],
  'lab:request':            ['doctor', 'lab_staff'],
  'lab:result':             ['lab_staff'],
  'lab:catalogue':          ['admin', 'lab_staff'],
  // Pharmacy stock
  'medicines:read':         ['admin', 'doctor', 'pharmacist'],
  'medicines:write':        ['pharmacist'],
  // Billing
  'billing:read':           ['admin', 'accountant'],
  'billing:write':          ['accountant'],
  'payments:write':         ['accountant'],
  // Administration
  'users:manage':           ['admin'],
  'reports:read':           ['admin'],
  'reports:revenue':        ['admin', 'accountant'],
  'audit:read':             ['admin'],
  'backup:manage':          ['admin'],
  'sms:manage':             ['admin'],
  // Patient self-service portal: only ever their own record
  'portal:self':            ['patient'],
};

const can = (role, perm) => (PERMISSIONS[perm] || []).includes(role);

const permissionsFor = (role) => Object.keys(PERMISSIONS).filter((p) => can(role, p));

// requirePermission('a', 'b') passes if the user holds ANY of the listed permissions.
const requirePermission = (...perms) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in.', 'NOT_AUTHENTICATED'));
  if (perms.some((p) => can(req.user.role, p))) return next();
  return next(new HttpError(403, 'Your role does not have access to this action.', 'FORBIDDEN'));
};

module.exports = { ROLES, STAFF_ROLES, PERMISSIONS, can, permissionsFor, requirePermission };
