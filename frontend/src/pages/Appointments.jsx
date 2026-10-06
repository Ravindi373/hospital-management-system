import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, patch, post } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Modal, Panel, Status, Table, useToast } from '../components/UI';
import PatientPicker from '../components/PatientPicker';
import { addDays, fmtDate, isoDate, label } from '../services/format';

export function SlotPicker({ doctorId, date, value, onChange, endpoint = '/appointments/slots' }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    setS(null);
    if (doctorId && date) get(endpoint, { doctorId, date }).then(setS).catch((e) => setS({ slots: [], message: e.message }));
  }, [doctorId, date, endpoint]);
  if (!doctorId || !date) return <p className="muted small" style={{ margin: 0 }}>Choose a doctor and date to see free times.</p>;
  if (!s) return <p className="muted small" style={{ margin: 0 }}>Loading times…</p>;
  if (!s.slots.length) return <p className="note warn" style={{ margin: 0 }}>{s.message || 'No sessions on this day.'}</p>;
  return (
    <div className="slots" role="group" aria-label="Available times">
      {s.slots.map((x) => (
        <button key={x.time} type="button" className="slot" disabled={!x.available} aria-pressed={value === x.time} onClick={() => onChange(x.time)}>{x.time}</button>
      ))}
    </div>
  );
}

function BookForm({ initialPatientId, doctors, onClose, onBooked }) {
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(isoDate());
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (initialPatientId) get(`/patients/${initialPatientId}`).then(setPatient).catch(() => {}); }, [initialPatientId]);
  useEffect(() => setTime(''), [doctorId, date]);
  const doc = doctors.find((d) => String(d.id) === String(doctorId));
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  async function book() {
    setError('');
    if (!patient || !doctorId || !time) { setError('Choose the patient, doctor, date and a free time.'); return; }
    setBusy(true);
    try {
      const a = await post('/appointments', { patientId: patient.id, doctorId: Number(doctorId), date, time, reason });
      toast(`Booked ${a.patient_name} with ${a.doctor_name} on ${fmtDate(a.appointment_date)} at ${a.appointment_time}`);
      onBooked(a);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Book appointment" onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={book} disabled={busy}>{busy ? 'Booking…' : 'Book appointment'}</button></>}>
      <ErrorMsg error={error} />
      <Field label="Patient" required><PatientPicker id="b_pat" value={patient} onChange={setPatient} autoFocus /></Field>
      <div className="fgrid">
        <Field label="Doctor" required id="b_doc"><select id="b_doc" className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">Choose doctor</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name} · {d.specialization}</option>)}</select></Field>
        <Field label="Date" required id="b_date"><input id="b_date" className="input" type="date" min={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {doc && <p className="small muted" style={{ margin: 0 }}>Consults: {doc.schedule.map((s) => `${DAYS[s.day_of_week]} ${s.start_time}-${s.end_time}`).join(', ') || 'no sessions set'}</p>}
      <Field label="Time" required><SlotPicker doctorId={doctorId} date={date} value={time} onChange={setTime} /></Field>
      <Field label="Reason for visit" id="b_reason"><input id="b_reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} /></Field>
    </Modal>
  );
}

function RescheduleForm({ appt, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(appt.appointment_date);
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  async function save() {
    setError('');
    try {
      await patch(`/appointments/${appt.id}/reschedule`, { date, time });
      toast('Appointment moved'); onDone();
    } catch (e) { setError(e.message); }
  }
  return (
    <Modal title={`Reschedule · ${appt.patient_name}`} onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save} disabled={!time}>Move appointment</button></>}>
      <ErrorMsg error={error} />
      <p style={{ margin: 0 }}>{appt.doctor_name} · now {fmtDate(appt.appointment_date)} at {appt.appointment_time}</p>
      <Field label="New date" id="rs_d"><input id="rs_d" className="input" type="date" min={isoDate()} value={date} onChange={(e) => { setDate(e.target.value); setTime(''); }} /></Field>
      <Field label="New time"><SlotPicker doctorId={appt.doctor_id} date={date} value={time} onChange={setTime} /></Field>
    </Modal>
  );
}

export default function Appointments() {
  const { user, can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(isoDate());
  const [doctorId, setDoctorId] = useState('');
  const [status, setStatus] = useState('');
  const [book, setBook] = useState(params.get('book') === '1');
  const [resched, setResched] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const doctors = useLoad(user.role === 'doctor' ? null : '/doctors', { active: '1' });
  const { data, error, reload } = useLoad('/appointments', { date, doctorId, status });

  async function setApptStatus(a, s) {
    try { await patch(`/appointments/${a.id}/status`, { status: s }); toast(`${a.patient_name}: ${label(s)}`); setConfirm(null); reload(); }
    catch (e) { toast(e.message); }
  }
  const closeBook = () => { setBook(false); if (params.get('book')) setParams({}, { replace: true }); };

  return (
    <>
      <div className="bar">
        <button className="btn sm" type="button" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <button className="btn sm" type="button" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
        <button className="btn sm" type="button" onClick={() => setDate(isoDate())}>Today</button>
        {user.role !== 'doctor' && <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} aria-label="Doctor">
          <option value="">All doctors</option>{(doctors.data || []).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select>}
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>{['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        {can('appointments:write') && <button className="btn primary grow" type="button" onClick={() => setBook(true)}>+ Book appointment</button>}
      </div>
      <ErrorMsg error={error} />
      <Panel title={`${user.role === 'doctor' ? 'My appointments' : 'Appointments'} · ${fmtDate(date)}`}>
        <Table rows={data} empty="No appointments for this day." columns={[
          { h: 'Time', r: (a) => <span className="mono">{a.appointment_time}</span> },
          { h: 'Patient', r: (a) => <><Link to={`/patients/${a.patient_id}`}>{a.patient_name}</Link><br /><small className="mono muted">{a.mrn}</small>
            {a.allergies && <><br /><Chip tone="bad">Allergy: {a.allergies}</Chip></>}</> },
          ...(user.role === 'doctor' ? [] : [{ h: 'Doctor', r: (a) => a.doctor_name }]),
          { h: 'Reason', r: (a) => a.reason || '' },
          { h: 'Status', r: (a) => <Status value={a.status} /> },
          { h: '', r: (a) => <div className="acts">
            {user.role === 'doctor' && ['scheduled', 'checked_in'].includes(a.status) && <Link className="btn sm primary" to={`/records/new?appointment=${a.id}&patient=${a.patient_id}`}>Start consultation</Link>}
            {a.record_id && <Link className="btn sm" to={`/records/${a.record_id}`}>View record</Link>}
            {(can('appointments:write') || user.role === 'nurse') && a.status === 'scheduled' && <button className="btn sm primary" type="button" onClick={() => setApptStatus(a, 'checked_in')}>Check in</button>}
            {can('vitals:write') && user.role === 'nurse' && ['scheduled', 'checked_in'].includes(a.status) && <Link className="btn sm" to="/vitals">Vitals</Link>}
            {can('appointments:write') && ['scheduled', 'checked_in'].includes(a.status) && <>
              <button className="btn sm" type="button" onClick={() => setResched(a)}>Reschedule</button>
              <button className="btn sm" type="button" onClick={() => setConfirm({ a, s: 'cancelled' })}>Cancel</button></>}
            {['scheduled', 'checked_in'].includes(a.status) && a.appointment_date <= isoDate() && <button className="btn sm" type="button" onClick={() => setConfirm({ a, s: 'no_show' })}>No-show</button>}
          </div> },
        ]} />
      </Panel>
      {book && <BookForm initialPatientId={params.get('patient')} doctors={doctors.data || []} onClose={closeBook} onBooked={(a) => { closeBook(); setDate(a.appointment_date); reload(); }} />}
      {resched && <RescheduleForm appt={resched} onClose={() => setResched(null)} onDone={() => { setResched(null); reload(); }} />}
      {confirm && (
        <Modal title={confirm.s === 'cancelled' ? 'Cancel appointment' : 'Mark as no-show'} onClose={() => setConfirm(null)}
          footer={<><button className="btn" type="button" onClick={() => setConfirm(null)}>Go back</button>
            <button className="btn danger" type="button" onClick={() => setApptStatus(confirm.a, confirm.s)}>{confirm.s === 'cancelled' ? 'Cancel appointment' : 'Mark no-show'}</button></>}>
          <p style={{ margin: 0 }}>{confirm.a.patient_name} with {confirm.a.doctor_name} on {fmtDate(confirm.a.appointment_date)} at {confirm.a.appointment_time}.</p>
        </Modal>
      )}
    </>
  );
}
