import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { patch, post } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Modal, Panel, Status, Table, Tabs, useForm, useToast } from '../components/UI';
import PatientPicker from '../components/PatientPicker';
import { fmtDateTime, money } from '../services/format';

function NewRequest({ onClose, onDone }) {
  const toast = useToast();
  const tests = useLoad('/lab/tests');
  const [patient, setPatient] = useState(null);
  const [picked, setPicked] = useState([]);
  const [priority, setPriority] = useState('routine');
  const [error, setError] = useState('');
  async function save() {
    setError('');
    if (!patient || !picked.length) { setError('Choose the patient and at least one test.'); return; }
    try { const r = await post('/lab/requests', { patientId: patient.id, testIds: picked, priority }); toast(`${r.length} test(s) requested`); onDone(); }
    catch (e) { setError(e.message); }
  }
  return (
    <Modal title="New test request" onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save}>Send request</button></>}>
      <ErrorMsg error={error} />
      <Field label="Patient" required><PatientPicker value={patient} onChange={setPatient} autoFocus /></Field>
      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', margin: 0 }}>
        <legend className="small muted">Tests</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
          {(tests.data || []).map((t) => (
            <label key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={picked.includes(t.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, t.id] : picked.filter((x) => x !== t.id))} />
              {t.name} <small className="muted">{money(t.price)}</small>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Priority" id="lr_pr"><select id="lr_pr" className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="routine">Routine</option><option value="urgent">Urgent</option></select></Field>
    </Modal>
  );
}

function ResultForm({ req, onClose, onDone }) {
  const toast = useToast();
  const [f, set] = useForm({ resultValue: '', remarks: '' });
  const [error, setError] = useState('');
  async function save() {
    setError('');
    try { const r = await post(`/lab/requests/${req.id}/result`, f); toast(r.result_flag === 'N' ? 'Result released' : `Result released · flagged ${r.result_flag}`); onDone(); }
    catch (e) { setError(e.message); }
  }
  return (
    <Modal title={`Enter result · ${req.test_name}`} onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save}>Save &amp; release result</button></>}>
      <ErrorMsg error={error} />
      <dl className="dl"><dt>Patient</dt><dd>{req.patient_name} <span className="mono muted">{req.mrn}</span></dd>
        <dt>Sample</dt><dd className="mono">{req.sample_id}</dd><dt>Reference range</dt><dd className="mono">{req.reference_range} {req.unit || ''}</dd></dl>
      <Field label={`Result${req.unit ? ` (${req.unit})` : ''}`} required id="lr_v" hint="The flag (Low / Normal / High / Abnormal) is worked out from the reference range.">
        <input id="lr_v" className="input" value={f.resultValue} onChange={set('resultValue')} maxLength={60} />
      </Field>
      <Field label="Remarks" id="lr_rm"><textarea id="lr_rm" className="input" rows={2} value={f.remarks} onChange={set('remarks')} maxLength={255} /></Field>
    </Modal>
  );
}

function Catalogue() {
  const toast = useToast();
  const { data, reload } = useLoad('/lab/tests', { all: '1' });
  const [edit, setEdit] = useState(null);
  const [f, set, setF] = useForm({});
  const [error, setError] = useState('');
  const open = (t) => { setError(''); setEdit(t || 'new'); setF(t ? { name: t.name, referenceRange: t.reference_range, unit: t.unit || '', price: t.price } : { name: '', referenceRange: '', unit: '', price: '' }); };
  async function save() {
    try { if (edit === 'new') await post('/lab/tests', f); else await patch(`/lab/tests/${edit.id}`, f); toast('Test saved'); setEdit(null); reload(); }
    catch (e) { setError(e.message); }
  }
  return (
    <Panel title="Test catalogue" actions={<button className="btn sm primary" type="button" onClick={() => open(null)}>+ Add test</button>}>
      <Table rows={data} columns={[
        { h: 'Test', r: (t) => t.name }, { h: 'Reference range', r: (t) => <span className="mono">{t.reference_range} {t.unit || ''}</span> },
        { h: 'Price', r: (t) => money(t.price), num: true }, { h: 'Status', r: (t) => (t.is_active ? <Chip tone="ok">Active</Chip> : <Chip>Inactive</Chip>) },
        { h: '', r: (t) => <button className="btn sm" type="button" onClick={() => open(t)}>Edit</button> },
      ]} />
      {edit && (
        <Modal title={edit === 'new' ? 'Add test' : `Edit ${edit.name}`} onClose={() => setEdit(null)}
          footer={<><button className="btn" type="button" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" type="button" onClick={save}>Save</button></>}>
          <ErrorMsg error={error} />
          <div className="fgrid">
            <Field label="Test name" required full id="lt_n"><input id="lt_n" className="input" value={f.name} onChange={set('name')} /></Field>
            <Field label="Reference range" required id="lt_r" hint="e.g. 70-100, or Negative"><input id="lt_r" className="input" value={f.referenceRange} onChange={set('referenceRange')} /></Field>
            <Field label="Unit" id="lt_u"><input id="lt_u" className="input" value={f.unit} onChange={set('unit')} /></Field>
            <Field label="Price (Rs.)" required id="lt_p"><input id="lt_p" className="input" type="number" min="0" value={f.price} onChange={set('price')} /></Field>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

export default function Laboratory() {
  const { can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('open');
  const [newReq, setNewReq] = useState(params.get('new') === '1');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const query = tab === 'open' ? { open: '1' } : { status: 'completed' };
  const { data, reload } = useLoad(tab === 'catalogue' ? null : '/lab/requests', query);
  const staff = can('lab:result');

  async function act(r, action) {
    setError('');
    try { const x = await post(`/lab/requests/${r.id}/${action}`); toast(action === 'collect' ? `Sample ${x.sample_id} logged` : 'Request cancelled'); reload(); }
    catch (e) { setError(e.message); }
  }
  const closeNew = () => { setNewReq(false); if (params.get('new')) setParams({}, { replace: true }); };

  return (
    <>
      <div className="bar">
        <Tabs value={tab} onChange={setTab} items={[['open', 'Requests in progress'], ['done', 'Completed results'], ...(can('lab:catalogue') ? [['catalogue', 'Test catalogue']] : [])]} />
        {can('lab:request') && <button className="btn primary grow" type="button" onClick={() => setNewReq(true)}>+ New test request</button>}
      </div>
      <ErrorMsg error={error} />
      {tab === 'catalogue' ? <Catalogue /> : (
        <Panel title={tab === 'open' ? 'Requests in progress (urgent first)' : 'Completed results'}>
          <Table rows={data} empty={tab === 'open' ? 'No open requests.' : 'No results yet.'} columns={[
            { h: 'Request', r: (r) => <><span className="mono">LAB-{r.id}</span>{r.sample_id && <><br /><small className="mono muted">{r.sample_id}</small></>}</> },
            { h: 'Requested', r: (r) => fmtDateTime(r.requested_at) },
            { h: 'Patient', r: (r) => <>{r.patient_name}<br /><small className="mono muted">{r.mrn}</small></> },
            { h: 'Test', r: (r) => r.test_name },
            { h: 'Ordered by', r: (r) => r.doctor_name || 'Lab (walk-in)' },
            tab === 'open'
              ? { h: 'Status', r: (r) => <><Status value={r.status} />{r.priority === 'urgent' && <> <Status value="urgent" /></>}</> }
              : { h: 'Result', r: (r) => <><span className="mono">{r.result_value} {r.unit || ''}</span> <span className={`flag ${r.result_flag}`}>{r.result_flag}</span><br /><small className="muted">Ref {r.reference_range} {r.unit || ''}</small></> },
            { h: '', r: (r) => <div className="acts">
              {staff && r.status === 'requested' && <button className="btn sm primary" type="button" onClick={() => act(r, 'collect')}>Collect sample</button>}
              {staff && r.status === 'sample_collected' && <button className="btn sm primary" type="button" onClick={() => setResult(r)}>Enter result</button>}
              {can('lab:request') && r.status === 'requested' && <button className="btn sm" type="button" onClick={() => act(r, 'cancel')}>Cancel</button>}
              {r.remarks && tab !== 'open' && <small className="muted">{r.remarks}</small>}
            </div> },
          ]} />
        </Panel>
      )}
      {newReq && <NewRequest onClose={closeNew} onDone={() => { closeNew(); reload(); }} />}
      {result && <ResultForm req={result} onClose={() => setResult(null)} onDone={() => { setResult(null); reload(); }} />}
    </>
  );
}
