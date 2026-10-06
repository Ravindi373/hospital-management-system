// Patient portal: a patient only ever sees their own record. All data comes from /api/me/...
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, patch, post } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Modal, Panel, Status, Table, useForm, useToast } from '../components/UI';
import { SlotPicker } from './Appointments';
import { fmtDate, fmtDateTime, isoDate, label, money } from '../services/format';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FREQ = { OD: 'once a day', BD: 'twice a day', TDS: '3 times a day', QDS: '4 times a day', NOCTE: 'at night', PRN: 'when needed', STAT: 'once, straight away' };
const FLAG = { L: 'Below normal', H: 'Above normal', N: 'Normal', A: 'Not normal' };

export function VitalsCard({ v }) {
  if (!v) return null;
  const items = [
    ['Blood pressure', v.bp_systolic ? `${v.bp_systolic}/${v.bp_diastolic}` : null, 'mmHg'],
    ['Pulse', v.pulse, 'bpm'], ['Temperature', v.temperature, '°C'], ['SpO₂', v.spo2, '%'],
    ['Weight', v.weight_kg, 'kg'], ['Height', v.height_cm, 'cm'],
  ].filter((x) => x[1] != null);
  return (
    <div className="vit-grid">
      {items.map(([l, val, u]) => <div className="vit" key={l}><span className="l">{l}</span><span className="v">{val}<span className="u">{u}</span></span></div>)}
    </div>
  );
}

function BookOnline({ onClose, onBooked }) {
  const toast = useToast();
  const doctors = useLoad('/me/doctors');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(isoDate());
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setTime(''), [doctorId, date]);
  const doc = (doctors.data || []).find((d) => String(d.id) === String(doctorId));
  async function book() {
    setError('');
    try {
      const a = await post('/me/appointments', { doctorId: Number(doctorId), date, time, reason });
      toast(`Booked with ${a.doctor_name} on ${fmtDate(a.appointment_date)} at ${a.appointment_time}`); onBooked();
    } catch (e) { setError(e.message); }
  }
  return (
    <Modal title="Book an appointment" onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={!time} onClick={book}>Book appointment</button></>}>
      <ErrorMsg error={error} />
      <Field label="Doctor" required id="bk_doc"><select id="bk_doc" className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
        <option value="">Choose a doctor</option>{(doctors.data || []).map((d) => <option key={d.id} value={d.id}>{d.full_name} · {d.specialization}</option>)}</select></Field>
      {doc && <p className="small muted" style={{ margin: 0 }}>Consults {doc.schedule.map((s) => `${DAYS[s.day_of_week]} ${s.start_time}-${s.end_time}`).join(', ')} · Fee {money(doc.consultation_fee)}</p>}
      <Field label="Date" required id="bk_date"><input id="bk_date" className="input" type="date" min={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Time" required><SlotPicker endpoint="/me/slots" doctorId={doctorId} date={date} value={time} onChange={setTime} /></Field>
      <Field label="Reason for visit" id="bk_r"><input id="bk_r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="e.g. Fever for 3 days" /></Field>
    </Modal>
  );
}

export function PortalHome() {
  const { user } = useAuth();
  const { data, error, reload } = useLoad('/me/summary');
  const [book, setBook] = useState(false);
  if (error) return <ErrorMsg error={error} />;
  if (!data) return <div className="empty">Loading…</div>;
  const { patient: p, next, counts: c } = data;
  return (
    <>
      <div className="bar">
        <div><h2 style={{ fontSize: 20 }}>Hello, {p.first_name}</h2><p className="muted" style={{ margin: '2px 0 0' }}>Hospital number <span className="mono">{p.mrn}</span></p></div>
        <button className="btn primary grow" type="button" onClick={() => setBook(true)}>+ Book an appointment</button>
      </div>
      <div className="kpis">
        <Link className="kpi" to="/my/appointments"><span className="l">Upcoming appointments</span><span className="v">{c.upcoming}</span></Link>
        <Link className="kpi" to="/my/lab"><span className="l">Lab results</span><span className="v">{c.lab_results}</span><span className="small muted">{c.lab_pending} waiting for results</span></Link>
        <Link className="kpi" to="/my/records"><span className="l">Visits</span><span className="v">{c.visits}</span></Link>
        <Link className={`kpi ${c.balance > 0 ? 'alert' : ''}`} to="/my/bills"><span className="l">Amount due</span><span className="v">{money(c.balance)}</span></Link>
      </div>
      <div className="grid2">
        <Panel title="Next appointment" pad>
          {next ? <dl className="dl">
            <dt>When</dt><dd><b>{fmtDate(next.appointment_date)}</b> at <span className="mono">{next.appointment_time}</span></dd>
            <dt>Doctor</dt><dd>{next.doctor_name} · {next.specialization}</dd>
            <dt>Reason</dt><dd>{next.reason || '—'}</dd><dt>Status</dt><dd><Status value={next.status} /></dd>
          </dl> : <p className="muted" style={{ margin: 0 }}>You have no upcoming appointments.</p>}
        </Panel>
        <Panel title="Latest check-up measurements" pad>
          {data.latestVitals ? <><VitalsCard v={data.latestVitals} /><p className="small muted" style={{ margin: '8px 0 0' }}>Recorded {fmtDateTime(data.latestVitals.recorded_at)}</p></>
            : <p className="muted" style={{ margin: 0 }}>Your blood pressure, pulse and weight will appear here after your next visit.</p>}
        </Panel>
        <Panel title="My details" pad actions={<Link className="btn sm" to="/my/profile">Update</Link>}>
          <dl className="dl"><dt>Name</dt><dd>{user.fullName}</dd><dt>Date of birth</dt><dd>{fmtDate(p.date_of_birth)}</dd>
            <dt>Phone</dt><dd className="mono">{p.phone}</dd><dt>Allergies</dt><dd>{p.allergies ? <Chip tone="bad">{p.allergies}</Chip> : 'None recorded'}</dd></dl>
        </Panel>
      </div>
      {book && <BookOnline onClose={() => setBook(false)} onBooked={() => { setBook(false); reload(); }} />}
    </>
  );
}

export function MyAppointments() {
  const toast = useToast();
  const { data, error, reload } = useLoad('/me/appointments');
  const [book, setBook] = useState(false);
  const [confirm, setConfirm] = useState(null);
  async function cancel(a) {
    try { await post(`/me/appointments/${a.id}/cancel`); toast('Appointment cancelled'); setConfirm(null); reload(); } catch (e) { toast(e.message); }
  }
  const today = isoDate();
  const upcoming = (data || []).filter((a) => a.appointment_date >= today && ['scheduled', 'checked_in'].includes(a.status));
  const past = (data || []).filter((a) => !upcoming.includes(a));
  const cols = (actions) => [
    { h: 'Date', r: (a) => <><b>{fmtDate(a.appointment_date)}</b> <span className="mono">{a.appointment_time}</span></> },
    { h: 'Doctor', r: (a) => a.doctor_name }, { h: 'Reason', r: (a) => a.reason || '' }, { h: 'Status', r: (a) => <Status value={a.status} /> },
    ...(actions ? [{ h: '', r: (a) => (a.status === 'scheduled' ? <button className="btn sm" type="button" onClick={() => setConfirm(a)}>Cancel</button> : null) }] : []),
  ];
  return (
    <>
      <div className="bar"><span className="muted">You can book up to 3 upcoming appointments online.</span><button className="btn primary grow" type="button" onClick={() => setBook(true)}>+ Book an appointment</button></div>
      <ErrorMsg error={error} />
      <Panel title="Upcoming"><Table rows={data ? upcoming : null} empty="No upcoming appointments." columns={cols(true)} /></Panel>
      <Panel title="Past and cancelled"><Table rows={data ? past : null} empty="No past appointments." columns={cols(false)} /></Panel>
      {book && <BookOnline onClose={() => setBook(false)} onBooked={() => { setBook(false); reload(); }} />}
      {confirm && <Modal title="Cancel appointment" onClose={() => setConfirm(null)}
        footer={<><button className="btn" type="button" onClick={() => setConfirm(null)}>Keep it</button><button className="btn danger" type="button" onClick={() => cancel(confirm)}>Cancel appointment</button></>}>
        <p style={{ margin: 0 }}>Cancel your appointment with {confirm.doctor_name} on {fmtDate(confirm.appointment_date)} at {confirm.appointment_time}?</p></Modal>}
    </>
  );
}

export function MyRecords() {
  const { data, error } = useLoad('/me/records');
  if (error) return <ErrorMsg error={error} />;
  return (
    <Panel title="Diagnoses and prescriptions">
      {!data ? <div className="empty">Loading…</div> : !data.length ? <div className="empty">No visits recorded yet.</div> : (
        <div className="panel-b"><div className="timeline">
          {data.map((r) => (
            <div key={r.id}>
              <small className="mono muted">{fmtDate(r.visit_date)} · {r.doctor_name}</small>
              <b style={{ display: 'block' }}>{r.diagnosis}</b>
              {r.treatment_plan && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>Advice: {r.treatment_plan}</div>}
              {r.items.length > 0 && (
                <div className="small" style={{ marginTop: 6 }}>
                  <b>Medicines</b> <Status value={r.prescription_status} />
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {r.items.map((i, n) => <li key={n}>{i.name} {i.strength || ''}: {i.dosage}, {FREQ[i.frequency] || i.frequency}, for {i.duration_days} day(s){i.instructions ? ` · ${i.instructions}` : ''}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div></div>
      )}
    </Panel>
  );
}

export function MyLab() {
  const { data, error } = useLoad('/me/lab');
  return (
    <>
      <ErrorMsg error={error} />
      <Panel title="Lab results">
        <Table rows={data} empty="No lab tests yet." columns={[
          { h: 'Requested', r: (l) => fmtDate(l.requested_at) }, { h: 'Test', r: (l) => l.test_name },
          { h: 'Result', r: (l) => (l.status === 'completed' ? <><b className="mono">{l.result_value} {l.unit || ''}</b> <Chip tone={l.result_flag === 'N' ? 'ok' : 'bad'}>{FLAG[l.result_flag]}</Chip></> : <Status value={l.status} />) },
          { h: 'Normal range', r: (l) => <span className="mono">{l.reference_range} {l.unit || ''}</span> },
          { h: 'Note', r: (l) => l.remarks || '' },
        ]} />
      </Panel>
      <p className="note" style={{ margin: 0 }}>Please discuss any result outside the normal range with your doctor.</p>
    </>
  );
}

export function MyBills() {
  const { data, error } = useLoad('/me/bills');
  return (
    <>
      <ErrorMsg error={error} />
      {data && !data.length && <Panel title="Bills" pad><p className="muted" style={{ margin: 0 }}>You have no bills.</p></Panel>}
      {(data || []).map((inv) => (
        <Panel key={inv.id} title={`${inv.invoice_no} · ${fmtDate(inv.created_at)}`} actions={<Status value={inv.status} />}>
          <Table rows={inv.items} rowKey={(i) => i.description} columns={[{ h: 'Item', r: (i) => i.description }, { h: 'Amount', r: (i) => money(i.amount), num: true }]} />
          <div className="panel-b" style={{ borderTop: '1px solid var(--line)', textAlign: 'right' }}>
            {inv.discount > 0 && <>Discount {money(inv.discount)} · </>}<b>Total {money(inv.total)}</b> · Paid {money(inv.amount_paid)} · <b>Balance {money(inv.balance)}</b>
            {inv.payments.map((p) => <div key={p.receipt_no} className="small muted">Receipt {p.receipt_no} · {fmtDateTime(p.paid_at)} · {label(p.method)} · {money(p.amount)}</div>)}
          </div>
        </Panel>
      ))}
      <p className="note" style={{ margin: 0 }}>Pay at the hospital cashier. Bring your hospital number.</p>
    </>
  );
}

export function MyProfile() {
  const toast = useToast();
  const { data: p, error, reload } = useLoad('/me/profile');
  const [f, set, setF] = useForm(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (p) setF({ phone: p.phone, email: p.email || '', address: p.address || '', emergencyContactName: p.emergency_contact_name || '', emergencyContactPhone: p.emergency_contact_phone || '', smsConsent: !!p.sms_consent }); }, [p, setF]);
  if (error) return <ErrorMsg error={error} />;
  if (!p || !f) return <div className="empty">Loading…</div>;
  async function save() { setErr(''); try { await patch('/me/profile', f); toast('Your details were saved'); reload(); } catch (e) { setErr(e.message); } }
  return (
    <div className="grid2">
      <Panel title="Hospital record" pad>
        <dl className="dl"><dt>Hospital number</dt><dd className="mono">{p.mrn}</dd><dt>Name</dt><dd>{p.full_name}</dd>
          <dt>Date of birth</dt><dd>{fmtDate(p.date_of_birth)} ({p.age} years)</dd><dt>Sex</dt><dd>{label(p.gender)}</dd>
          <dt>NIC</dt><dd className="mono">{p.nic || '—'}</dd><dt>Blood group</dt><dd>{p.blood_group || '—'}</dd>
          <dt>Allergies</dt><dd>{p.allergies ? <Chip tone="bad">{p.allergies}</Chip> : 'None recorded'}</dd></dl>
        <p className="small muted" style={{ margin: '10px 0 0' }}>To correct your name, date of birth, NIC or allergies, please ask reception or your doctor.</p>
      </Panel>
      <Panel title="Contact details" pad>
        <ErrorMsg error={err} />
        <div className="fgrid">
          <Field label="Phone" id="mp_ph"><input id="mp_ph" className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email" id="mp_em"><input id="mp_em" className="input" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Address" full id="mp_ad"><input id="mp_ad" className="input" value={f.address} onChange={set('address')} /></Field>
          <Field label="Emergency contact" id="mp_ec"><input id="mp_ec" className="input" value={f.emergencyContactName} onChange={set('emergencyContactName')} /></Field>
          <Field label="Emergency contact phone" id="mp_ep"><input id="mp_ep" className="input" value={f.emergencyContactPhone} onChange={set('emergencyContactPhone')} /></Field>
          <label className="fld full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} htmlFor="mp_sms">
            <input id="mp_sms" type="checkbox" checked={f.smsConsent} onChange={set('smsConsent')} /> Send me SMS about my appointments and when my lab report is ready
          </label>
        </div>
        <div style={{ marginTop: 12 }}><button className="btn primary" type="button" onClick={save}>Save details</button></div>
      </Panel>
    </div>
  );
}
