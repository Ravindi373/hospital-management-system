import { useState } from 'react';
import { patch, post, put } from '../services/api';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Modal, Panel, Status, Table, Tabs, useForm, useToast } from '../components/UI';
import { fmtDate, money, ROLE_LABEL } from '../services/format';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function DoctorForm({ doc, departments, onClose, onDone }) {
  const toast = useToast();
  const [f, set] = useForm(doc ? { fullName: doc.full_name, specialization: doc.specialization, departmentId: doc.department_id || '', licenseNo: doc.license_no || '',
    phone: doc.phone || '', email: doc.email || '', consultationFee: doc.consultation_fee } : { fullName: 'Dr. ', specialization: '', departmentId: '', licenseNo: '', phone: '', email: '', consultationFee: '' });
  const [error, setError] = useState('');
  async function save() {
    try {
      const body = { ...f, departmentId: f.departmentId ? Number(f.departmentId) : null };
      if (doc) await patch(`/doctors/${doc.id}`, body); else await post('/doctors', body);
      toast('Doctor saved'); onDone();
    } catch (e) { setError(e.message); }
  }
  return (
    <Modal title={doc ? `Edit ${doc.full_name}` : 'Add doctor'} onClose={onClose} footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save}>Save</button></>}>
      <ErrorMsg error={error} />
      <div className="fgrid">
        <Field label="Full name" required id="d_n"><input id="d_n" className="input" value={f.fullName} onChange={set('fullName')} /></Field>
        <Field label="Specialization" required id="d_s"><input id="d_s" className="input" value={f.specialization} onChange={set('specialization')} /></Field>
        <Field label="Department" id="d_d"><select id="d_d" className="input" value={f.departmentId} onChange={set('departmentId')}><option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="SLMC registration no." id="d_l"><input id="d_l" className="input" value={f.licenseNo} onChange={set('licenseNo')} /></Field>
        <Field label="Phone" id="d_p"><input id="d_p" className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email" id="d_e"><input id="d_e" className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Consultation fee (Rs.)" required id="d_f"><input id="d_f" className="input" type="number" min="0" step="50" value={f.consultationFee} onChange={set('consultationFee')} /></Field>
      </div>
    </Modal>
  );
}

function ScheduleForm({ doc, onClose, onDone }) {
  const toast = useToast();
  const init = DAYS.map((_, i) => { const s = doc.schedule.find((x) => x.day_of_week === i); return { on: !!s, start: s ? s.start_time : '08:00', end: s ? s.end_time : '12:00' }; });
  const [rows, setRows] = useState(init);
  const [error, setError] = useState('');
  const upd = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  async function save() {
    try {
      await put(`/doctors/${doc.id}/schedule`, { sessions: rows.map((r, i) => ({ ...r, dayOfWeek: i })).filter((r) => r.on).map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.start, endTime: r.end })) });
      toast('Schedule saved'); onDone();
    } catch (e) { setError(e.message); }
  }
  return (
    <Modal title={`Weekly schedule · ${doc.full_name}`} onClose={onClose} footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save}>Save schedule</button></>}>
      <ErrorMsg error={error} />
      <p className="muted" style={{ margin: 0 }}>Appointments can only be booked inside these hours, in 15-minute slots.</p>
      {rows.map((r, i) => (
        <div key={DAYS[i]} className="bar">
          <label style={{ width: 130, display: 'flex', gap: 8 }}><input type="checkbox" checked={r.on} onChange={(e) => upd(i, 'on', e.target.checked)} /> {DAYS[i]}</label>
          <input className="input" type="time" step="900" value={r.start} disabled={!r.on} onChange={(e) => upd(i, 'start', e.target.value)} aria-label={`${DAYS[i]} start`} />
          <span className="muted">to</span>
          <input className="input" type="time" step="900" value={r.end} disabled={!r.on} onChange={(e) => upd(i, 'end', e.target.value)} aria-label={`${DAYS[i]} end`} />
        </div>
      ))}
    </Modal>
  );
}

function StaffForm({ member, departments, onClose, onDone }) {
  const toast = useToast();
  const [f, set] = useForm(member ? { fullName: member.full_name, designation: member.designation, departmentId: member.department_id || '', phone: member.phone || '',
    email: member.email || '', hireDate: member.hire_date || '', status: member.status } : { fullName: '', designation: '', departmentId: '', phone: '', email: '', hireDate: '', status: 'active' });
  const [error, setError] = useState('');
  async function save() {
    try {
      const body = { ...f, departmentId: f.departmentId ? Number(f.departmentId) : null };
      if (member) await patch(`/staff/${member.id}`, body); else await post('/staff', body);
      toast('Staff member saved'); onDone();
    } catch (e) { setError(e.message); }
  }
  return (
    <Modal title={member ? `Edit ${member.full_name}` : 'Add staff member'} onClose={onClose} footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save}>Save</button></>}>
      <ErrorMsg error={error} />
      <div className="fgrid">
        <Field label="Full name" required id="s_n"><input id="s_n" className="input" value={f.fullName} onChange={set('fullName')} /></Field>
        <Field label="Designation" required id="s_d"><input id="s_d" className="input" value={f.designation} onChange={set('designation')} /></Field>
        <Field label="Department" id="s_dep"><select id="s_dep" className="input" value={f.departmentId} onChange={set('departmentId')}><option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Date joined" id="s_h"><input id="s_h" className="input" type="date" value={f.hireDate} onChange={set('hireDate')} /></Field>
        <Field label="Phone" id="s_p"><input id="s_p" className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email" id="s_e"><input id="s_e" className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Status" id="s_s"><select id="s_s" className="input" value={f.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
      </div>
    </Modal>
  );
}

export default function DoctorsStaff() {
  const toast = useToast();
  const [tab, setTab] = useState('doctors');
  const [modal, setModal] = useState(null);
  const [dept, setDept] = useState('');
  const doctors = useLoad('/doctors');
  const staff = useLoad('/staff');
  const departments = useLoad('/departments');
  const deps = departments.data || [];
  const done = () => { setModal(null); doctors.reload(); staff.reload(); };
  async function addDept() {
    try { await post('/departments', { name: dept }); setDept(''); departments.reload(); toast('Department added'); } catch (e) { toast(e.message); }
  }

  return (
    <>
      <div className="bar">
        <Tabs value={tab} onChange={setTab} items={[['doctors', 'Doctors'], ['staff', 'Staff'], ['departments', 'Departments']]} />
        {tab === 'doctors' && <button className="btn primary grow" type="button" onClick={() => setModal({ t: 'doctor' })}>+ Add doctor</button>}
        {tab === 'staff' && <button className="btn primary grow" type="button" onClick={() => setModal({ t: 'staff' })}>+ Add staff member</button>}
      </div>
      {tab === 'doctors' && <Panel title="Doctors">
        <Table rows={doctors.data} columns={[
          { h: 'Doctor', r: (d) => <><b>{d.full_name}</b><br /><small className="muted">{d.specialization}{d.license_no ? ` · ${d.license_no}` : ''}</small></> },
          { h: 'Department', r: (d) => d.department || '—' },
          { h: 'Fee', r: (d) => money(d.consultation_fee), num: true },
          { h: 'Weekly schedule', r: (d) => (d.schedule.length ? d.schedule.map((s) => <Chip key={s.day_of_week} tone="acc">{DAYS[s.day_of_week].slice(0, 3)} {s.start_time}-{s.end_time}</Chip>) : <span className="muted">No sessions</span>) },
          { h: 'Login', r: (d) => (d.username ? <span className="mono">{d.username}</span> : <span className="muted">Not linked</span>) },
          { h: 'Status', r: (d) => <Status value={d.is_active ? 'active' : 'inactive'} /> },
          { h: '', r: (d) => <div className="acts"><button className="btn sm" type="button" onClick={() => setModal({ t: 'doctor', d })}>Edit</button>
            <button className="btn sm" type="button" onClick={() => setModal({ t: 'schedule', d })}>Schedule</button></div> },
        ]} />
      </Panel>}
      {tab === 'staff' && <Panel title="Staff">
        <Table rows={staff.data} columns={[
          { h: 'Name', r: (s) => <><b>{s.full_name}</b><br /><small className="muted">{s.designation}</small></> },
          { h: 'Department', r: (s) => s.department || '—' },
          { h: 'Contact', r: (s) => <><span className="mono">{s.phone || ''}</span><br /><small className="muted">{s.email || ''}</small></> },
          { h: 'Joined', r: (s) => fmtDate(s.hire_date) },
          { h: 'Login', r: (s) => (s.username ? <><span className="mono">{s.username}</span><br /><small className="muted">{ROLE_LABEL[s.role]}</small></> : <span className="muted">None</span>) },
          { h: 'Status', r: (s) => <Status value={s.status} /> },
          { h: '', r: (s) => <button className="btn sm" type="button" onClick={() => setModal({ t: 'staff', s })}>Edit</button> },
        ]} />
      </Panel>}
      {tab === 'departments' && <Panel title="Departments" pad>
        <div className="bar" style={{ marginBottom: 12 }}><input className="input" placeholder="New department name" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="New department" />
          <button className="btn primary" type="button" disabled={dept.trim().length < 2} onClick={addDept}>Add department</button></div>
        <div className="bar">{deps.map((d) => <Chip key={d.id} tone="acc">{d.name}</Chip>)}</div>
      </Panel>}
      {modal && modal.t === 'doctor' && <DoctorForm doc={modal.d} departments={deps} onClose={() => setModal(null)} onDone={done} />}
      {modal && modal.t === 'schedule' && <ScheduleForm doc={modal.d} onClose={() => setModal(null)} onDone={done} />}
      {modal && modal.t === 'staff' && <StaffForm member={modal.s} departments={deps} onClose={() => setModal(null)} onDone={done} />}
    </>
  );
}
