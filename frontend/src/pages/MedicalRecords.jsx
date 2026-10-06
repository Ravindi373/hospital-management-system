import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { get, post } from '../services/api';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Panel, Status, Table, copyText, useToast } from '../components/UI';
import PatientPicker from '../components/PatientPicker';
import { VitalsCard } from './Portal';
import { fmtDate, fmtDateTime, label } from '../services/format';

export function RecordsList() {
  const [patient, setPatient] = useState(null);
  const { data, error } = useLoad('/records', { patientId: patient && patient.id });
  return (
    <>
      <div className="bar">
        <div style={{ flex: '1 1 320px' }}><PatientPicker value={patient} onChange={setPatient} /></div>
        <Link className="btn primary grow" to="/records/new">+ New consultation</Link>
      </div>
      <ErrorMsg error={error} />
      <Panel title={patient ? `Records for ${patient.full_name}` : 'Consultations I recorded'}>
        <Table rows={data} empty="No records yet." columns={[
          { h: 'Date', r: (r) => fmtDate(r.visit_date) },
          { h: 'Patient', r: (r) => <><Link to={`/patients/${r.patient_id}`}>{r.patient_name}</Link><br /><small className="mono muted">{r.mrn}</small></> },
          { h: 'Diagnosis', r: (r) => <><b>{r.diagnosis}</b> {r.icd10_code && <span className="mono muted">{r.icd10_code}</span>}</> },
          { h: 'Doctor', r: (r) => r.doctor_name },
          { h: 'Prescription', r: (r) => (r.prescription_id ? <Status value={r.prescription_status} /> : <span className="muted">None</span>) },
          { h: '', r: (r) => <Link className="btn sm" to={`/records/${r.id}`}>Open</Link> },
        ]} />
      </Panel>
    </>
  );
}

const FREQ = [['OD', 'OD · once daily'], ['BD', 'BD · twice daily'], ['TDS', 'TDS · 3 times'], ['QDS', 'QDS · 4 times'], ['NOCTE', 'Nocte · at night'], ['PRN', 'PRN · when needed'], ['STAT', 'Stat · once now']];
const blankItem = () => ({ medicineId: '', dosage: '1 tablet', frequency: 'BD', durationDays: 5, quantity: '' });

export function NewConsultation() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [appointmentId] = useState(params.get('appointment') || null);
  const [f, setF] = useState({ complaint: '', diagnosis: '', icd10Code: '', clinicalNotes: '', treatmentPlan: '' });
  const [items, setItems] = useState([]);
  const [tests, setTests] = useState([]);
  const [priority, setPriority] = useState('routine');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const meds = useLoad('/medicines');
  const vitals = useLoad(patient ? '/vitals' : null, patient ? { patientId: patient.id } : undefined);
  const latestVitals = vitals.data && vitals.data[0];
  const labTests = useLoad('/lab/tests');
  useEffect(() => { const pid = params.get('patient'); if (pid) get(`/patients/${pid}`).then(setPatient).catch(() => {}); }, [params]);
  useEffect(() => {
    if (appointmentId) get('/appointments', {}).then((list) => { const a = list.find((x) => String(x.id) === appointmentId); if (a && a.reason) setF((p) => ({ ...p, complaint: p.complaint || a.reason })); }).catch(() => {});
  }, [appointmentId]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setItem = (i, k, v) => setItems((list) => list.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  async function save() {
    setError('');
    if (!patient) { setError('Choose the patient.'); return; }
    if (items.some((i) => !i.medicineId)) { setError('Choose a medicine on every prescription line, or remove the empty line.'); return; }
    setBusy(true);
    try {
      const r = await post('/records', {
        patientId: patient.id, appointmentId: appointmentId ? Number(appointmentId) : null, ...f,
        prescription: items.map((i) => ({ ...i, medicineId: Number(i.medicineId), durationDays: Number(i.durationDays), quantity: i.quantity ? Number(i.quantity) : undefined })),
        labTests: tests, labPriority: priority,
      });
      toast(r.prescription ? 'Record saved and prescription sent to the pharmacy' : 'Record saved');
      nav(`/records/${r.id}`, { replace: true });
    } catch (e) { setError(e.message); window.scrollTo(0, 0); } finally { setBusy(false); }
  }

  const medList = meds.data || [];
  return (
    <>
      <ErrorMsg error={error} />
      <Panel title="Patient" pad>
        <PatientPicker value={patient} onChange={setPatient} />
        {appointmentId && <p className="small muted" style={{ margin: '8px 0 0' }}>Saving completes appointment #{appointmentId}.</p>}
      </Panel>
      {patient && patient.allergies && <div className="note bad"><b>Allergy alert:</b> {patient.full_name} is allergic to {patient.allergies}. Matching medicines are blocked.</div>}
      {patient && (
        <Panel title="Latest vital signs" pad>
          {latestVitals ? <><VitalsCard v={latestVitals} /><p className="small muted" style={{ margin: '8px 0 0' }}>Recorded {fmtDateTime(latestVitals.recorded_at)} by {latestVitals.recorded_by_name}{latestVitals.notes ? ` · ${latestVitals.notes}` : ''}</p></>
            : <p className="muted" style={{ margin: 0 }}>No vitals recorded for this patient yet. The nurse records them at the nurse station.</p>}
        </Panel>
      )}
      <Panel title="Diagnosis" pad>
        <div className="fgrid three">
          <Field label="Presenting complaint" id="c_comp"><input id="c_comp" className="input" value={f.complaint} onChange={set('complaint')} maxLength={255} /></Field>
          <Field label="Diagnosis" required id="c_dx"><input id="c_dx" className="input" value={f.diagnosis} onChange={set('diagnosis')} maxLength={255} placeholder="e.g. Essential hypertension" /></Field>
          <Field label="ICD-10 code" id="c_icd"><input id="c_icd" className="input" value={f.icd10Code} onChange={set('icd10Code')} placeholder="e.g. I10" maxLength={10} /></Field>
          <Field label="Clinical notes and examination" full id="c_notes"><textarea id="c_notes" className="input" rows={3} value={f.clinicalNotes} onChange={set('clinicalNotes')} /></Field>
          <Field label="Treatment plan and advice" full id="c_plan"><textarea id="c_plan" className="input" rows={2} value={f.treatmentPlan} onChange={set('treatmentPlan')} /></Field>
        </div>
      </Panel>
      <Panel title="Prescription" actions={<button className="btn sm" type="button" onClick={() => setItems([...items, blankItem()])}>+ Add medicine</button>} pad>
        {!items.length && <p className="muted" style={{ margin: 0 }}>No medicines. Use “Add medicine” to prescribe.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length > 0 && <div className="rx-row small muted"><span>Medicine</span><span>Dose</span><span>Frequency</span><span>Days</span><span>Qty (auto)</span><span /></div>}
          {items.map((it, i) => {
            const m = medList.find((x) => String(x.id) === String(it.medicineId));
            return (
              <div key={i} className="rx-row">
                <select className="input" aria-label="Medicine" value={it.medicineId} onChange={(e) => setItem(i, 'medicineId', e.target.value)}>
                  <option value="">Choose medicine</option>
                  {medList.map((x) => <option key={x.id} value={x.id}>{x.name} {x.strength || ''} ({x.form}) · {x.stock_quantity} in stock{x.expired ? ' · EXPIRED' : ''}</option>)}
                </select>
                <input className="input" aria-label="Dose" value={it.dosage} onChange={(e) => setItem(i, 'dosage', e.target.value)} />
                <select className="input" aria-label="Frequency" value={it.frequency} onChange={(e) => setItem(i, 'frequency', e.target.value)}>{FREQ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <input className="input" aria-label="Days" type="number" min="1" value={it.durationDays} onChange={(e) => setItem(i, 'durationDays', e.target.value)} />
                <input className="input" aria-label="Quantity" type="number" min="1" placeholder="auto" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
                <button className="btn sm" type="button" aria-label="Remove medicine" onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
                {m && (m.out_of_stock || m.expired) ? <div className="small" style={{ gridColumn: '1 / -1', color: 'var(--warn)' }}>Pharmacy cannot dispense this right now ({m.expired ? 'batch expired' : 'out of stock'}).</div> : null}
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Lab tests" pad>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {(labTests.data || []).map((t) => (
            <label key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={tests.includes(t.id)} onChange={(e) => setTests(e.target.checked ? [...tests, t.id] : tests.filter((x) => x !== t.id))} /> {t.name}
            </label>
          ))}
        </div>
        {tests.length > 0 && <div className="bar" style={{ marginTop: 10 }}><span className="small muted">Priority</span>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority"><option value="routine">Routine</option><option value="urgent">Urgent</option></select></div>}
      </Panel>
      <div className="bar"><button className="btn primary" type="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button>
        <Link className="btn" to="/records">Cancel</Link></div>
    </>
  );
}

export function RecordView() {
  const { id } = useParams();
  const toast = useToast();
  const { data: r, error } = useLoad(`/records/${id}`);
  if (error) return <ErrorMsg error={error} />;
  if (!r) return <div className="empty">Loading…</div>;
  const text = [`MEDICAL RECORD  ${r.id}`, `Date: ${fmtDate(r.visit_date)}`, `Patient: ${r.patient_name} (${r.mrn})`, `Doctor: ${r.doctor_name}`, '',
    `Complaint: ${r.complaint || '-'}`, `Diagnosis: ${r.diagnosis}${r.icd10_code ? ` [ICD-10 ${r.icd10_code}]` : ''}`, '', `Notes: ${r.clinical_notes || '-'}`,
    `Plan: ${r.treatment_plan || '-'}`, '', 'Prescription:',
    ...(r.prescription ? r.prescription.items.map((i, n) => `${n + 1}. ${i.name} ${i.strength || ''} - ${i.dosage} ${i.frequency} x ${i.duration_days} day(s) [qty ${i.quantity}]`) : ['None'])].join('\n');
  return (
    <>
      <Panel title={`${r.diagnosis}`} actions={<button className="btn sm" type="button" onClick={() => copyText(text, toast)}>Copy as text</button>} pad>
        <dl className="dl">
          <dt>Patient</dt><dd><Link to={`/patients/${r.patient_id}`}>{r.patient_name}</Link> <span className="mono muted">{r.mrn}</span></dd>
          <dt>Visit</dt><dd>{fmtDate(r.visit_date)} · {r.doctor_name}</dd>
          <dt>Complaint</dt><dd>{r.complaint || '—'}</dd>
          <dt>ICD-10</dt><dd className="mono">{r.icd10_code || '—'}</dd>
          <dt>Clinical notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.clinical_notes || '—'}</dd>
          <dt>Treatment plan</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.treatment_plan || '—'}</dd>
        </dl>
      </Panel>
      <Panel title="Prescription" actions={r.prescription && <Status value={r.prescription.status} />}>
        <Table rows={r.prescription ? r.prescription.items : []} empty="No medicines prescribed." columns={[
          { h: 'Medicine', r: (i) => `${i.name} ${i.strength || ''}` }, { h: 'Dose', r: (i) => i.dosage },
          { h: 'Frequency', r: (i) => i.frequency }, { h: 'Days', r: (i) => i.duration_days, num: true }, { h: 'Qty', r: (i) => i.quantity, num: true },
          { h: '', r: (i) => (i.expired ? <Chip tone="bad">Batch expired</Chip> : i.stock_quantity < i.quantity ? <Chip tone="warn">Low stock</Chip> : '') },
        ]} />
      </Panel>
      {r.prescription && r.prescription.status === 'pending' && <p className="note">Sent to the pharmacy. {label(r.prescription.status)}.</p>}
    </>
  );
}
