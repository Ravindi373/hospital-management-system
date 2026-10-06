import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Modal, Panel, Status, Table, Tabs, useToast } from '../components/UI';
import { fmtDate, fmtDateTime, money } from '../services/format';

const itemProblem = (i) => (i.expired ? 'Batch expired' : i.stock_quantity < i.quantity ? `Only ${i.stock_quantity} in stock` : '');

export default function Prescriptions() {
  const { user, can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const { data, reload } = useLoad('/prescriptions', { status: tab });
  const pharmacist = can('prescriptions:dispense');

  async function act(rx, action) {
    setError('');
    try {
      await post(`/prescriptions/${rx.id}/${action}`);
      toast(action === 'dispense' ? `Dispensed for ${rx.patient_name}. Stock updated.` : 'Prescription cancelled');
      setOpen(null); reload();
    } catch (e) { setError(e.message); }
  }

  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[['pending', pharmacist ? 'To dispense' : 'Not yet dispensed'], ['dispensed', 'Dispensed'], ['cancelled', 'Cancelled']]} />
      {pharmacist && <div className="bar"><span className="muted">Check each prescription against the patient's allergies and stock before dispensing.</span><Link className="btn grow" to="/medicines">Medicine stock</Link></div>}
      <Panel title={user.role === 'doctor' ? 'My prescriptions' : 'Prescriptions'}>
        <Table rows={data} empty="No prescriptions here." columns={[
          { h: 'Date', r: (rx) => fmtDate(rx.created_at) },
          { h: 'Patient', r: (rx) => <>{rx.patient_name}<br /><small className="mono muted">{rx.mrn}</small>{rx.allergies && <><br /><Chip tone="bad">Allergy: {rx.allergies}</Chip></>}</> },
          { h: 'Diagnosis', r: (rx) => rx.diagnosis },
          { h: 'Medicines', r: (rx) => rx.items.map((i) => <div key={i.id}>{i.name} {i.strength} · {i.dosage} {i.frequency} × {i.duration_days}d · <b>qty {i.quantity}</b>
            {rx.status === 'pending' && itemProblem(i) && <> <Chip tone="bad">{itemProblem(i)}</Chip></>}</div>) },
          { h: 'Prescriber', r: (rx) => rx.doctor_name },
          { h: tab === 'dispensed' ? 'Dispensed' : 'Status', r: (rx) => (tab === 'dispensed' ? <>{fmtDateTime(rx.dispensed_at)}<br /><small className="muted">{rx.dispensed_by_name}</small></> : <Status value={rx.status} />) },
          { h: '', r: (rx) => <div className="acts">
            {pharmacist && rx.status === 'pending' && <button className="btn sm primary" type="button" onClick={() => { setError(''); setOpen(rx); }}>Check &amp; dispense</button>}
            {user.role === 'doctor' && rx.status === 'pending' && <button className="btn sm" type="button" onClick={() => act(rx, 'cancel')}>Cancel</button>}
            {user.role === 'doctor' && <Link className="btn sm" to={`/records/${rx.record_id}`}>Record</Link>}
          </div> },
        ]} />
      </Panel>
      {!open && <ErrorMsg error={error} />}
      {open && (
        <Modal title={`Dispense for ${open.patient_name}`} onClose={() => setOpen(null)} wide
          footer={<><button className="btn" type="button" onClick={() => setOpen(null)}>Close</button>
            <button className="btn primary" type="button" disabled={!open.can_dispense} onClick={() => act(open, 'dispense')}>Confirm dispensing</button></>}>
          <ErrorMsg error={error} />
          <dl className="dl">
            <dt>Patient</dt><dd>{open.patient_name} <span className="mono muted">{open.mrn}</span></dd>
            <dt>Allergies</dt><dd>{open.allergies ? <Chip tone="bad">{open.allergies}</Chip> : 'None recorded'}</dd>
            <dt>Prescriber</dt><dd>{open.doctor_name} · {fmtDate(open.created_at)}</dd>
            <dt>Diagnosis</dt><dd>{open.diagnosis}</dd>
          </dl>
          <Table rows={open.items} columns={[
            { h: 'Medicine', r: (i) => `${i.name} ${i.strength || ''}` },
            { h: 'Directions', r: (i) => `${i.dosage} ${i.frequency} × ${i.duration_days} day(s)${i.instructions ? ` · ${i.instructions}` : ''}` },
            { h: 'Qty', r: (i) => i.quantity, num: true },
            { h: 'In stock', r: (i) => i.stock_quantity, num: true },
            { h: 'Amount', r: (i) => money(i.quantity * i.unit_price), num: true },
            { h: '', r: (i) => (itemProblem(i) ? <Chip tone="bad">{itemProblem(i)}</Chip> : <Chip tone="ok">OK</Chip>) },
          ]} />
          <p style={{ margin: 0, textAlign: 'right' }}><b>Total {money(open.total)}</b> · added to the patient's next bill</p>
          {!open.can_dispense && <p className="note warn" style={{ margin: 0 }}>This prescription cannot be dispensed until the stock problem is fixed. Restock the medicine or ask the prescriber for an alternative.</p>}
        </Modal>
      )}
    </>
  );
}
