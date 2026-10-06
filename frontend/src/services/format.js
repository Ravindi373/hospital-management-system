// Display helpers.
export const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (s) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const label = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return isoDate(d); };
export const initials = (name = '') => name.replace(/^Dr\.?\s*/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export const ROLE_LABEL = {
  admin: 'Administrator', receptionist: 'Receptionist', doctor: 'Doctor', nurse: 'Nurse',
  lab_staff: 'Lab Staff', pharmacist: 'Pharmacist', accountant: 'Accountant', patient: 'Patient',
};

export const TONE = {
  scheduled: 'info', checked_in: 'warn', completed: 'ok', cancelled: 'bad', no_show: 'bad',
  requested: 'info', sample_collected: 'warn', pending: 'warn', dispensed: 'ok',
  paid: 'ok', partially_paid: 'warn', unpaid: 'bad', void: '',
  active: 'ok', disabled: 'bad', declined: 'bad', inactive: 'bad', urgent: 'bad', routine: '',
};

export const timeAgo = (s) => {
  const m = Math.round((Date.now() - new Date(String(s).replace(' ', 'T')).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return fmtDate(s);
};
