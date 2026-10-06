import { useState } from 'react';
import { patch, post } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Modal, Panel, Status, Table, useForm, useToast } from '../components/UI';
import { fmtDateTime, ROLE_LABEL } from '../services/format';

const ROLES = Object.keys(ROLE_LABEL).filter((r) => r !== 'patient');   // patients sign themselves up
const PERM_ROWS = [
  ['Register patients', 'patients:write'], ['Book appointments', 'appointments:write'], ['Check patients in', 'checkin'],
  ['Record vital signs', 'vitals:write'], ['Patient history', 'patients:history'],
  ['Diagnosis & prescriptions', 'records:write'], ['Lab test requests', 'lab:request'], ['Enter lab results', 'lab:result'],
  ['Dispense medicine', 'prescriptions:dispense'], ['Manage stock', 'medicines:write'], ['Generate bills', 'billing:write'],
  ['Record payments', 'payments:write'], ['Manage users', 'users:manage'], ['Doctors & staff', 'staff:manage'],
  ['All reports', 'reports:read'], ['Revenue report', 'reports:revenue'], ['Audit log', 'audit:read'], ['Backups', 'backup:manage'],
];
// Mirror of backend/middleware/rbac.js for the read-only matrix shown to admins.
const MATRIX = {
  'patients:write': ['admin', 'receptionist'], 'appointments:write': ['admin', 'receptionist'], 'checkin': ['admin', 'receptionist', 'nurse'],
  'vitals:write': ['doctor', 'nurse'], 'patients:history': ['doctor', 'nurse'],
  'records:write': ['doctor'], 'lab:request': ['doctor', 'lab_staff'], 'lab:result': ['lab_staff'], 'prescriptions:dispense': ['pharmacist'],
  'medicines:write': ['pharmacist'], 'billing:write': ['accountant'], 'payments:write': ['accountant'], 'users:manage': ['admin'],
  'staff:manage': ['admin'], 'reports:read': ['admin'], 'reports:revenue': ['admin', 'accountant'], 'audit:read': ['admin'], 'backup:manage': ['admin'],
};

function UserForm({ mode, user, doctors, onClose, onDone }) {
  const toast = useToast();
  const [f, set] = useForm(mode === 'create'
    ? { username: '', fullName: '', email: '', phone: '', role: 'receptionist', doctorId: '', tempPassword: '' }
    : { role: user.role, doctorId: user.doctor_id || '', tempPassword: '' });
  const [error, setError] = useState('');
  const doctorPick = f.role === 'doctor' && (
    <Field label="Doctor profile" required id="u_doc" hint="Links the account so the doctor sees their own patients.">
      <select id="u_doc" className="input" value={f.doctorId} onChange={set('doctorId')}><option value="">Choose…</option>
        {doctors.map((d) => <option key={d.id} value={d.id} disabled={d.user_id && (!user || d.user_id !== user.id)}>{d.full_name}{d.user_id && (!user || d.user_id !== user.id) ? ' (linked)' : ''}</option>)}</select>
    </Field>
  );
  async function save() {
    setError('');
    try {
      const doctorId = f.role === 'doctor' ? Number(f.doctorId) || null : null;
      if (mode === 'create') await post('/users', { ...f, doctorId });
      if (mode === 'approve') await post(`/users/${user.id}/approve`, { role: f.role, doctorId });
      if (mode === 'role') await patch(`/users/${user.id}`, { role: f.role, doctorId });
      if (mode === 'reset') await post(`/users/${user.id}/reset-password`, { tempPassword: f.tempPassword });
      toast({ create: 'User created', approve: 'Account approved. The user has been notified by email.', role: 'Role updated', reset: 'Temporary password set' }[mode]);
      onDone();
    } catch (e) { setError(e.message); }
  }
  const title = { create: 'Create user', approve: `Approve ${user && user.full_name}`, role: `Change role · ${user && user.username}`, reset: `Reset password · ${user && user.username}` }[mode];
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save}>Save</button></>}>
      <ErrorMsg error={error} />
      {mode === 'approve' && <dl className="dl"><dt>Username</dt><dd className="mono">{user.username}</dd><dt>Email</dt><dd>{user.email}</dd><dt>Phone</dt><dd className="mono">{user.phone}</dd><dt>Asked for</dt><dd><Chip tone="acc">{ROLE_LABEL[user.role]}</Chip></dd></dl>}
      {mode === 'create' && <div className="fgrid">
        <Field label="Username" required id="u_un"><input id="u_un" className="input" value={f.username} onChange={set('username')} autoComplete="off" /></Field>
        <Field label="Full name" required id="u_fn"><input id="u_fn" className="input" value={f.fullName} onChange={set('fullName')} /></Field>
        <Field label="Email" id="u_em"><input id="u_em" className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone" id="u_ph"><input id="u_ph" className="input" value={f.phone} onChange={set('phone')} /></Field>
      </div>}
      {mode !== 'reset' && <Field label="Role" required id="u_role"><select id="u_role" className="input" value={f.role} onChange={set('role')}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>}
      {mode !== 'reset' && doctorPick}
      {(mode === 'create' || mode === 'reset') && <Field label="Temporary password" required id="u_pw" hint="The user must choose their own password at first sign-in. 10+ characters with upper and lower case, a number and a symbol.">
        <input id="u_pw" className="input" type="password" autoComplete="new-password" value={f.tempPassword} onChange={set('tempPassword')} /></Field>}
      {mode === 'role' && <p className="note" style={{ margin: 0 }}>Changing the role signs the user out of every device so the new permissions apply immediately.</p>}
    </Modal>
  );
}

function DeclineForm({ user, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function save() {
    try { await post(`/users/${user.id}/reject`, { reason }); toast(`Request declined. ${user.full_name} has been emailed.`); onDone(); }
    catch (e) { setError(e.message); }
  }
  return (
    <Modal title={`Decline ${user.full_name}`} onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn danger" type="button" onClick={save}>Decline request</button></>}>
      <ErrorMsg error={error} />
      <p style={{ margin: 0 }}>{user.full_name} asked for a <b>{ROLE_LABEL[user.role]}</b> account (username <span className="mono">{user.username}</span>).</p>
      <Field label="Reason (sent to the applicant)" id="dc_r" hint="Optional. Shown in the email and when they try to sign in.">
        <input id="dc_r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="e.g. Not on the staff list" />
      </Field>
    </Modal>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, error, reload } = useLoad('/users');
  const doctors = useLoad('/doctors');
  const [form, setForm] = useState(null);
  const [decline, setDecline] = useState(null);
  const [err, setErr] = useState('');
  const all = data || [];
  const pending = all.filter((u) => u.status === 'pending' && u.role !== 'patient');
  const staff = all.filter((u) => u.status !== 'pending' && u.role !== 'patient');
  const patients = all.filter((u) => u.role === 'patient');

  async function quick(path, body, msg) {
    setErr('');
    try { if (body) await patch(path, body); else await post(path); toast(msg); reload(); } catch (e) { setErr(e.message); }
  }
  const locked = (u) => u.locked_until && new Date(u.locked_until.replace(' ', 'T')) > new Date();
  const status = (u) => (u.status === 'disabled' && u.rejection_reason !== null ? <Chip tone="bad">Declined</Chip> : <Status value={u.status} />);
  const actions = (u, isPatient) => <div className="acts">
    {locked(u) && <button className="btn sm" type="button" onClick={() => quick(`/users/${u.id}/unlock`, null, 'Account unlocked')}>Unlock</button>}
    {u.rejection_reason === null && <button className="btn sm" type="button" onClick={() => setForm({ mode: 'reset', user: u })}>Reset password</button>}
    {!isPatient && u.id !== me.id && u.rejection_reason === null && <button className="btn sm" type="button" onClick={() => setForm({ mode: 'role', user: u })}>Change role</button>}
    {u.id !== me.id && <button className="btn sm" type="button" onClick={() => quick(`/users/${u.id}`, { status: u.status === 'active' ? 'disabled' : 'active' }, u.status === 'active' ? 'Account disabled and signed out' : 'Account enabled')}>{u.status === 'active' ? 'Disable' : 'Enable'}</button>}
  </div>;

  return (
    <>
      <div className="bar"><span className="muted">Staff requests from the sign-up page appear here and in your notifications. Patients do not need approval.</span>
        <button className="btn primary grow" type="button" onClick={() => setForm({ mode: 'create' })}>+ Create staff user</button></div>
      <ErrorMsg error={error || err} />
      <Panel title={`Staff account requests (${pending.length})`}>
        <Table rows={data ? pending : null} empty="No requests waiting for approval." columns={[
          { h: 'Name', r: (u) => <><b>{u.full_name}</b><br /><small className="muted">{u.email} · {u.phone}</small></> },
          { h: 'Username', r: (u) => <span className="mono">{u.username}</span> },
          { h: 'Asked for', r: (u) => <Chip tone="acc">{ROLE_LABEL[u.role]}</Chip> },
          { h: 'Requested', r: (u) => fmtDateTime(u.created_at) },
          { h: '', r: (u) => <div className="acts"><button className="btn sm primary" type="button" onClick={() => setForm({ mode: 'approve', user: u })}>Approve</button>
            <button className="btn sm" type="button" onClick={() => setDecline(u)}>Decline</button></div> },
        ]} />
      </Panel>
      <Panel title="Staff accounts">
        <Table rows={data ? staff : null} columns={[
          { h: 'Username', r: (u) => <span className="mono">{u.username}</span> },
          { h: 'Name', r: (u) => u.full_name },
          { h: 'Role', r: (u) => <><Chip tone="acc">{ROLE_LABEL[u.role]}</Chip>{u.doctor_name && <><br /><small className="muted">{u.doctor_name}</small></>}</> },
          { h: 'Last sign-in', r: (u) => fmtDateTime(u.last_login_at) },
          { h: 'Status', r: (u) => <>{status(u)}{locked(u) && <> <Chip tone="bad">Locked</Chip></>}{u.must_change_password ? <> <Chip tone="warn">Temp password</Chip></> : null}
            {u.rejection_reason ? <><br /><small className="muted">{u.rejection_reason}</small></> : null}</> },
          { h: '', r: (u) => actions(u, false) },
        ]} />
      </Panel>
      <Panel title={`Patient accounts (${patients.length})`}>
        <Table rows={data ? patients : null} empty="No patient has signed up yet." columns={[
          { h: 'Username', r: (u) => <span className="mono">{u.username}</span> },
          { h: 'Name', r: (u) => <>{u.full_name}<br /><small className="muted">{u.email}</small></> },
          { h: 'Hospital no.', r: (u) => <span className="mono">{u.patient_mrn || '—'}</span> },
          { h: 'Last sign-in', r: (u) => fmtDateTime(u.last_login_at) },
          { h: 'Status', r: (u) => <>{status(u)}{locked(u) && <> <Chip tone="bad">Locked</Chip></>}</> },
          { h: '', r: (u) => actions(u, true) },
        ]} />
      </Panel>
      <Panel title="What each staff role can do">
        <div className="tbl-wrap"><table>
          <thead><tr><th>Action</th>{ROLES.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr></thead>
          <tbody>{PERM_ROWS.map(([l, p]) => <tr key={p}><td>{l}</td>{ROLES.map((r) => <td key={r}>{MATRIX[p].includes(r) ? <Chip tone="ok">Yes</Chip> : <span className="muted">—</span>}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="small muted" style={{ margin: 0, padding: '10px 16px' }}>Patients only see their own appointments, results, prescriptions and bills.</p>
      </Panel>
      {form && <UserForm {...form} doctors={doctors.data || []} onClose={() => setForm(null)} onDone={() => { setForm(null); reload(); doctors.reload(); }} />}
      {decline && <DeclineForm user={decline} onClose={() => setDecline(null)} onDone={() => { setDecline(null); reload(); }} />}
    </>
  );
}
