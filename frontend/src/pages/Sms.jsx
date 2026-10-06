// Admin: patient SMS - provider status, private message to a patient or number, log of every SMS with re-send for failures.
import { useState } from 'react';
import { post } from '../services/api';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Panel, Table, Tabs, useToast } from '../components/UI';
import PatientPicker from '../components/PatientPicker';
import { fmtDateTime, label } from '../services/format';

const TONE = { sent: 'ok', queued: 'info', failed: 'bad', skipped: '' };
const TYPE = { APPT_BOOKED: 'Booking confirmed', APPT_RESCHEDULED: 'Rescheduled', APPT_CANCELLED: 'Cancelled',
  APPT_REMINDER: 'Reminder', LAB_READY: 'Lab report ready', TEST: 'Test', PRIVATE: 'Private message' };
const HOSPITAL = 'City General Hospital';
const MAX = 300;
const PROVIDER = { log: 'Log only (nothing is sent)', notifylk: 'Notify.lk', twilio: 'Twilio' };

export default function Sms() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [to, setTo] = useState('patient');
  const [patient, setPatient] = useState(null);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, error: loadErr, reload } = useLoad('/sms', { status, q });
  const s = data && data.settings;
  const c = (data && data.counts) || {};
  const full = HOSPITAL.length + 2 + msg.trim().length;
  const parts = full <= 160 ? 1 : Math.ceil(full / 153);

  async function run(fn, ok) {
    setError(''); setBusy(true);
    try { const r = await fn(); toast(ok(r)); reload(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <ErrorMsg error={loadErr || error} />
      <div className="kpis">
        <div className="kpi"><span className="l">Sent (30 days)</span><span className="v">{c.sent || 0}</span></div>
        <div className="kpi"><span className="l">Waiting to send</span><span className="v">{c.queued || 0}</span></div>
        <div className={`kpi ${c.failed ? 'alert' : ''}`}><span className="l">Failed</span><span className="v">{c.failed || 0}</span></div>
        <div className="kpi"><span className="l">Not sent</span><span className="v">{c.skipped || 0}</span><span className="small muted">opted out or invalid number</span></div>
      </div>
      <div className="grid2">
        <Panel title="SMS gateway" pad>
          {s && (
            <dl className="dl">
              <dt>Status</dt><dd>{s.enabled ? <Chip tone="ok">On</Chip> : <Chip tone="bad">Off</Chip>}</dd>
              <dt>Provider</dt><dd>{PROVIDER[s.provider] || s.provider} {!s.configured && <Chip tone="bad">Missing settings in .env</Chip>}</dd>
              {s.senderId && <><dt>Sender ID</dt><dd className="mono">{s.senderId}</dd></>}
              <dt>Reminders</dt><dd>Day before each appointment, schedule <span className="mono">{s.reminderSchedule}</span></dd>
            </dl>
          )}
          {s && s.provider === 'log' && <p className="note" style={{ margin: '12px 0 0' }}>Messages are only written to <span className="mono">logs/sms-outbox.log</span>. To send real SMS, set <span className="mono">SMS_PROVIDER=notifylk</span> and your Notify.lk User ID and API key in <span className="mono">.env</span>, then restart the server.</p>}
        </Panel>
        <Panel title="Send a private message" pad>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tabs value={to} onChange={(v) => { setTo(v); setError(''); }} items={[['patient', 'To a patient'], ['number', 'To a mobile number']]} />
            {to === 'patient' ? (
              <Field label="Patient" required>
                <PatientPicker id="sms_patient" value={patient} onChange={setPatient} />
                {patient && <small>Will be sent to <span className="mono">{patient.phone}</span>{patient.sms_consent === 0 && <b style={{ color: 'var(--bad)' }}> · this patient has opted out of SMS</b>}</small>}
              </Field>
            ) : (
              <Field label="Mobile number" required id="sms_phone"><input id="sms_phone" className="input" type="tel" placeholder="0771234567" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            )}
            <Field label="Message" required id="sms_msg" hint={`${msg.length} / ${MAX} characters · ${parts} SMS · "${HOSPITAL}:" is added at the start`}>
              <textarea id="sms_msg" className="input" rows={4} maxLength={MAX} value={msg} onChange={(e) => setMsg(e.target.value)}
                placeholder="e.g. Please come to the hospital tomorrow at 9 am to collect your report." />
            </Field>
            <p className="note warn" style={{ margin: 0 }}>SMS is not private on a shared phone. Do not include diagnoses, test results or amounts.</p>
            <div className="bar">
              <button className="btn primary" type="button" disabled={busy || msg.trim().length < 2 || (to === 'patient' ? !patient : !phone)}
                onClick={() => run(() => post('/sms/send', { message: msg, ...(to === 'patient' ? { patientId: patient.id } : { phone }) }),
                  (r) => { if (r.status === 'sent') { setMsg(''); return 'Message sent'; } return `Message ${r.status}: ${r.error || ''}`; })}>
                {busy ? 'Sending…' : 'Send message'}</button>
              <button className="btn sm" type="button" disabled={busy || !phone || to !== 'number'} title="Sends a fixed test text to the number above"
                onClick={() => run(() => post('/sms/test', { phone }), (r) => (r.status === 'sent' ? 'Test SMS sent' : `Test SMS ${r.status}: ${r.error || ''}`))}>Send test text</button>
            </div>
          </div>
          <div className="bar" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <span className="small muted">Reminders go out automatically each evening. You can also send tomorrow's now.</span>
            <button className="btn sm grow" type="button" disabled={busy} onClick={() => run(() => post('/sms/reminders'), (r) => `${r.queued} reminder(s) queued`)}>Send tomorrow's reminders</button>
          </div>
        </Panel>
      </div>
      <div className="bar">
        <input className="input" style={{ flex: '1 1 240px' }} placeholder="Search patient name, MRN or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search SMS" />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>{['sent', 'queued', 'failed', 'skipped'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
      </div>
      <Panel title="SMS log">
        <Table rows={data && data.rows} empty="No SMS yet. Book an appointment to see the confirmation here." columns={[
          { h: 'When', r: (m) => <span className="mono small">{fmtDateTime(m.created_at)}</span> },
          { h: 'Patient', r: (m) => (m.patient_name ? <>{m.patient_name}<br /><small className="mono muted">{m.mrn}</small></> : <span className="muted">—</span>) },
          { h: 'To', r: (m) => <span className="mono">{m.phone}</span> },
          { h: 'Type', r: (m) => <>{TYPE[m.type] || m.type}{m.type === 'PRIVATE' && m.sent_by && <><br /><small className="muted">by {m.sent_by}</small></>}</> },
          { h: 'Message', r: (m) => <small style={{ display: 'block', maxWidth: 380 }}>{m.message}</small> },
          { h: 'Status', r: (m) => <><Chip tone={TONE[m.status]}>{label(m.status)}</Chip>{m.provider === 'log' && m.status === 'sent' && <><br /><small className="muted">log only</small></>}
            {m.error && <><br /><small style={{ color: 'var(--bad)' }}>{m.error}</small></>}</> },
          { h: '', r: (m) => (m.status === 'failed' ? <button className="btn sm" type="button" disabled={busy} onClick={() => run(() => post(`/sms/${m.id}/retry`), (r) => `Re-send: ${r.status}`)}>Re-send</button> : null) },
        ]} />
      </Panel>
    </>
  );
}
