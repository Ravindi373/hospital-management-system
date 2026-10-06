import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Panel, Status, Table, Tabs } from '../components/UI';
import { fmtDate, fmtDateTime, label } from '../services/format';
import { PatientForm } from './Patients';
import { VitalsCard } from './Portal';

export default function PatientDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const doctor = can('patients:history');
  const basic = useLoad(doctor ? null : `/patients/${id}`);
  const hist = useLoad(doctor ? `/patients/${id}/history` : null);
  const [tab, setTab] = useState('records');
  const [edit, setEdit] = useState(false);
  const p = doctor ? hist.data && hist.data.patient : basic.data;
  const err = basic.error || hist.error;
  if (err) return <ErrorMsg error={err} />;
  if (!p) return <div className="empty">Loading…</div>;

  return (
    <>
      <Panel title={`${p.full_name}`} actions={<div className="bar">
        {can('patients:write') && <button className="btn sm" type="button" onClick={() => setEdit(true)}>Edit details</button>}
        {can('appointments:write') && <Link className="btn sm" to={`/appointments?book=1&patient=${p.id}`}>Book appointment</Link>}
        {can('records:write') && <Link className="btn sm primary" to={`/records/new?patient=${p.id}`}>New consultation</Link>}
      </div>} pad>
        <dl className="dl">
          <dt>MRN</dt><dd className="mono">{p.mrn}</dd>
          <dt>Age / sex</dt><dd>{p.age} years ({fmtDate(p.date_of_birth)}) · {label(p.gender)}</dd>
          <dt>Blood group</dt><dd>{p.blood_group || '—'}</dd>
          <dt>NIC</dt><dd className="mono">{p.nic || '—'}</dd>
          <dt>Phone</dt><dd className="mono">{p.phone}</dd>
          <dt>Address</dt><dd>{p.address || '—'}</dd>
          <dt>Allergies</dt><dd>{p.allergies ? <Chip tone="bad">{p.allergies}</Chip> : 'None recorded'}</dd>
          <dt>Emergency contact</dt><dd>{p.emergency_contact_name || '—'} <span className="mono">{p.emergency_contact_phone || ''}</span></dd>
          <dt>Registered</dt><dd>{fmtDate(p.created_at)}</dd>
        </dl>
      </Panel>

      {doctor && hist.data && (
        <Panel title="Medical history">
          <div style={{ padding: '0 16px' }}><Tabs value={tab} onChange={setTab} items={[
            ['records', `Diagnoses & prescriptions (${hist.data.records.length})`], ['vitals', `Vital signs (${hist.data.vitals.length})`],
            ['labs', `Lab results (${hist.data.labs.length})`], ['appts', `Appointments (${hist.data.appointments.length})`]]} /></div>
          {tab === 'vitals' && (hist.data.vitals.length ? <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {hist.data.vitals.map((v) => <div key={v.id}><div className="small muted" style={{ marginBottom: 6 }}>{fmtDateTime(v.recorded_at)} · {v.recorded_by_name}{v.notes ? ` · ${v.notes}` : ''}</div><VitalsCard v={v} /></div>)}
          </div> : <div className="empty">No vital signs recorded yet.</div>)}
          {tab === 'records' && (hist.data.records.length ? (
            <div className="panel-b"><div className="timeline">
              {hist.data.records.map((r) => (
                <div key={r.id}>
                  <small className="mono muted">{fmtDate(r.visit_date)} · {r.doctor_name}</small>
                  <b style={{ display: 'block' }}>{r.diagnosis} {r.icd10_code && <span className="mono muted">({r.icd10_code})</span>}</b>
                  {r.complaint && <div className="small">Complaint: {r.complaint}</div>}
                  {r.clinical_notes && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{r.clinical_notes}</div>}
                  {r.items.length > 0 && <div className="small" style={{ marginTop: 4 }}>Rx: {r.items.map((i) => `${i.name} ${i.strength || ''} ${i.dosage} ${i.frequency} × ${i.duration_days}d`).join('; ')} <Status value={r.prescription_status} /></div>}
                  {can('records:read') && <Link className="small" to={`/records/${r.id}`}>Open record</Link>}
                </div>
              ))}
            </div></div>) : <div className="empty">No consultations recorded yet.</div>)}
          {tab === 'labs' && <Table rows={hist.data.labs} empty="No lab tests." columns={[
            { h: 'Requested', r: (l) => fmtDateTime(l.requested_at) },
            { h: 'Test', r: (l) => l.test_name },
            { h: 'Result', r: (l) => (l.status === 'completed' ? <><span className="mono">{l.result_value} {l.unit}</span> <span className={`flag ${l.result_flag}`}>{l.result_flag}</span><br /><small className="muted">Ref: {l.reference_range} {l.unit}</small></> : <Status value={l.status} />) },
            { h: 'Remarks', r: (l) => l.remarks || '' },
          ]} />}
          {tab === 'appts' && <Table rows={hist.data.appointments} empty="No appointments." columns={[
            { h: 'Date', r: (a) => `${fmtDate(a.appointment_date)} ${a.appointment_time}` },
            { h: 'Doctor', r: (a) => a.doctor_name }, { h: 'Reason', r: (a) => a.reason || '' }, { h: 'Status', r: (a) => <Status value={a.status} /> },
          ]} />}
        </Panel>
      )}
      {!doctor && <p className="note">Clinical history is visible to doctors and nurses only. Every view of it is recorded in the audit log.</p>}
      {edit && <PatientForm patient={p} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); (doctor ? hist : basic).reload(); }} />}
    </>
  );
}
