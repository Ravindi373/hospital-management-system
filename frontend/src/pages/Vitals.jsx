// Nurse station: today's clinic list, check-in, and vital signs.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { patch, post } from '../services/api';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Modal, Panel, Status, Table, useForm, useToast } from '../components/UI';
import { VitalsCard } from './Portal';
import { fmtDateTime, label } from '../services/format';

export function VitalsForm({ patient, appointmentId, onClose, onDone }) {
  const toast = useToast();
  const [f, set] = useForm({ bpSystolic: '', bpDiastolic: '', pulse: '', temperature: '', spo2: '', weightKg: '', heightCm: '', notes: '' });
  const [error, setError] = useState('');
  async function save() {
    setError('');
    const body = { patientId: patient.id, appointmentId: appointmentId || null, notes: f.notes || undefined };
    for (const k of ['bpSystolic', 'bpDiastolic', 'pulse', 'temperature', 'spo2', 'weightKg', 'heightCm']) if (f[k] !== '') body[k] = Number(f[k]);
    try { await post('/vitals', body); toast(`Vitals saved for ${patient.name}`); onDone(); } catch (e) { setError(e.message); }
  }
  const num = (k, l, unit, step = '1') => (
    <Field label={`${l} (${unit})`} id={`vt_${k}`}><input id={`vt_${k}`} className="input" type="number" step={step} inputMode="decimal" value={f[k]} onChange={set(k)} /></Field>
  );
  return (
    <Modal title={`Vital signs · ${patient.name}`} onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save}>Save vitals</button></>}>
      <ErrorMsg error={error} />
      {patient.allergies && <p className="note bad" style={{ margin: 0 }}><b>Allergy:</b> {patient.allergies}</p>}
      <div className="fgrid three">
        {num('bpSystolic', 'BP systolic', 'mmHg')}{num('bpDiastolic', 'BP diastolic', 'mmHg')}{num('pulse', 'Pulse', 'bpm')}
        {num('temperature', 'Temperature', '°C', '0.1')}{num('spo2', 'SpO₂', '%')}{num('weightKg', 'Weight', 'kg', '0.1')}
        {num('heightCm', 'Height', 'cm', '0.1')}
        <Field label="Notes" full id="vt_notes"><input id="vt_notes" className="input" value={f.notes} onChange={set('notes')} maxLength={255} placeholder="e.g. Patient anxious, BP re-checked" /></Field>
      </div>
    </Modal>
  );
}

export default function Vitals() {
  const toast = useToast();
  const { data, error, reload } = useLoad('/vitals/queue');
  const [form, setForm] = useState(null);
  const [history, setHistory] = useState(null);
  const hist = useLoad(history ? '/vitals' : null, history ? { patientId: history.patient_id } : undefined);

  async function checkIn(a) {
    try { await patch(`/appointments/${a.id}/status`, { status: 'checked_in' }); toast(`${a.patient_name} checked in`); reload(); } catch (e) { toast(e.message); }
  }
  const due = (data || []).filter((a) => !a.vitals_id && a.status !== 'completed').length;

  return (
    <>
      <div className="bar"><span className="muted">{data ? `${data.length} patients today · ${due} still need vitals` : ''}</span>
        <button className="btn grow" type="button" onClick={reload}>Refresh</button></div>
      <ErrorMsg error={error} />
      <Panel title="Today's clinic">
        <Table rows={data} empty="No patients booked today." columns={[
          { h: 'Time', r: (a) => <span className="mono">{a.appointment_time}</span> },
          { h: 'Patient', r: (a) => <><Link to={`/patients/${a.patient_id}`}><b>{a.patient_name}</b></Link><br /><small className="muted">{a.mrn} · {a.age} y · {label(a.gender)}</small>
            {a.allergies && <><br /><Chip tone="bad">Allergy: {a.allergies}</Chip></>}</> },
          { h: 'Doctor', r: (a) => a.doctor_name }, { h: 'Reason', r: (a) => a.reason || '' },
          { h: 'Status', r: (a) => <Status value={a.status} /> },
          { h: 'Vitals', r: (a) => (a.vitals_id ? <Chip tone="ok">Done</Chip> : a.status === 'completed' ? <span className="muted">—</span> : <Chip tone="warn">Due</Chip>) },
          { h: '', r: (a) => <div className="acts">
            {a.status === 'scheduled' && <button className="btn sm" type="button" onClick={() => checkIn(a)}>Check in</button>}
            {a.status !== 'completed' && <button className={`btn sm ${a.vitals_id ? '' : 'primary'}`} type="button"
              onClick={() => setForm({ patient: { id: a.patient_id, name: a.patient_name, allergies: a.allergies }, appointmentId: a.id })}>{a.vitals_id ? 'Re-record' : 'Record vitals'}</button>}
            <button className="btn sm" type="button" onClick={() => setHistory(a)}>History</button>
          </div> },
        ]} />
      </Panel>
      {form && <VitalsForm {...form} onClose={() => setForm(null)} onDone={() => { setForm(null); reload(); }} />}
      {history && (
        <Modal title={`Vitals history · ${history.patient_name}`} onClose={() => setHistory(null)} wide>
          {!hist.data ? <p>Loading…</p> : !hist.data.length ? <p className="muted">No vitals recorded yet.</p> : hist.data.map((v) => (
            <div key={v.id} className="panel" style={{ padding: 12 }}>
              <div className="small muted" style={{ marginBottom: 8 }}>{fmtDateTime(v.recorded_at)} · {v.recorded_by_name}{v.notes ? ` · ${v.notes}` : ''}</div>
              <VitalsCard v={v} />
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
