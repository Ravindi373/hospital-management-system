import { useEffect, useState } from 'react';
import { get, patch, post } from '../services/api';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Modal, Panel, Table, useForm, useToast } from '../components/UI';
import { addDays, fmtDate, fmtDateTime, isoDate, label, money } from '../services/format';

const FORMS = ['tablet', 'capsule', 'syrup', 'injection', 'inhaler', 'sachet', 'cream', 'drops'];

function stockChips(m) {
  return <>
    {m.expired ? <Chip tone="bad">Expired</Chip> : m.expiring_soon ? <Chip tone="warn">Expires in {m.days_to_expiry} d</Chip> : null}{' '}
    {m.out_of_stock ? <Chip tone="bad">Out of stock</Chip> : m.low_stock ? <Chip tone="warn">Low stock</Chip> : <Chip tone="ok">In stock</Chip>}
  </>;
}

function MedicineForm({ med, onClose, onDone }) {
  const toast = useToast();
  const [f, set] = useForm(med ? { name: med.name, genericName: med.generic_name || '', form: med.form, strength: med.strength || '', unitPrice: med.unit_price, reorderLevel: med.reorder_level, supplier: med.supplier || '' }
    : { name: '', genericName: '', form: 'tablet', strength: '', unitPrice: '', reorderLevel: '', supplier: '', stockQuantity: '', batchNo: '', expiryDate: '' });
  const [error, setError] = useState('');
  async function save() {
    try { if (med) await patch(`/medicines/${med.id}`, f); else await post('/medicines', f); toast('Medicine saved'); onDone(); }
    catch (e) { setError(e.message); }
  }
  return (
    <Modal title={med ? `Edit ${med.name}` : 'Add medicine'} onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save}>Save</button></>}>
      <ErrorMsg error={error} />
      <div className="fgrid">
        <Field label="Brand / name" required id="m_n"><input id="m_n" className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Generic name" id="m_g"><input id="m_g" className="input" value={f.genericName} onChange={set('genericName')} /></Field>
        <Field label="Form" required id="m_f"><select id="m_f" className="input" value={f.form} onChange={set('form')}>{FORMS.map((x) => <option key={x} value={x}>{label(x)}</option>)}</select></Field>
        <Field label="Strength" id="m_s"><input id="m_s" className="input" placeholder="e.g. 500 mg" value={f.strength} onChange={set('strength')} /></Field>
        <Field label="Unit price (Rs.)" required id="m_p"><input id="m_p" className="input" type="number" min="0" step="0.5" value={f.unitPrice} onChange={set('unitPrice')} /></Field>
        <Field label="Reorder level" required id="m_r"><input id="m_r" className="input" type="number" min="0" value={f.reorderLevel} onChange={set('reorderLevel')} /></Field>
        {!med && <>
          <Field label="Opening stock" required id="m_q"><input id="m_q" className="input" type="number" min="0" value={f.stockQuantity} onChange={set('stockQuantity')} /></Field>
          <Field label="Batch number" id="m_b"><input id="m_b" className="input" value={f.batchNo} onChange={set('batchNo')} /></Field>
          <Field label="Expiry date" required id="m_e"><input id="m_e" className="input" type="date" min={addDays(isoDate(), 1)} value={f.expiryDate} onChange={set('expiryDate')} /></Field>
        </>}
        <Field label="Supplier" full id="m_sup"><input id="m_sup" className="input" value={f.supplier} onChange={set('supplier')} /></Field>
      </div>
    </Modal>
  );
}

function StockForm({ med, mode, onClose, onDone }) {
  const toast = useToast();
  const [f, set] = useForm(mode === 'restock' ? { quantity: '', batchNo: '', expiryDate: '', discardExisting: !!med.expired } : { change: '', reason: 'adjustment', note: '' });
  const [error, setError] = useState('');
  async function save() {
    try {
      const body = mode === 'restock' ? { ...f, quantity: Number(f.quantity) } : { ...f, change: Number(f.change) };
      const m = await post(`/medicines/${med.id}/${mode}`, body);
      toast(`${m.name}: ${m.stock_quantity} in stock`); onDone();
    } catch (e) { setError(e.message); }
  }
  return (
    <Modal title={`${mode === 'restock' ? 'Receive stock' : 'Adjust stock'} · ${med.name} ${med.strength || ''}`} onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={save}>Save</button></>}>
      <ErrorMsg error={error} />
      <p style={{ margin: 0 }}>On hand: <b>{med.stock_quantity}</b> · batch {med.batch_no || '—'} · expires {fmtDate(med.expiry_date)}</p>
      {mode === 'restock' ? (
        <div className="fgrid">
          <Field label="Quantity received" required id="rs_q"><input id="rs_q" className="input" type="number" min="1" value={f.quantity} onChange={set('quantity')} /></Field>
          <Field label="New batch number" required id="rs_b"><input id="rs_b" className="input" value={f.batchNo} onChange={set('batchNo')} /></Field>
          <Field label="Batch expiry" required id="rs_e"><input id="rs_e" className="input" type="date" min={addDays(isoDate(), 1)} value={f.expiryDate} onChange={set('expiryDate')} /></Field>
          <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={f.discardExisting} onChange={set('discardExisting')} /> Discard the old units (expired or recalled)</label>
        </div>
      ) : (
        <div className="fgrid">
          <Field label="Change (+ or −)" required id="ad_c" hint="e.g. -5 for broken packs"><input id="ad_c" className="input" type="number" value={f.change} onChange={set('change')} /></Field>
          <Field label="Reason" id="ad_r"><select id="ad_r" className="input" value={f.reason} onChange={set('reason')}><option value="adjustment">Stock count correction</option><option value="expired">Expired / damaged</option></select></Field>
          <Field label="Note" required full id="ad_n"><input id="ad_n" className="input" value={f.note} onChange={set('note')} maxLength={80} /></Field>
        </div>
      )}
    </Modal>
  );
}

function Movements({ med, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => { get(`/medicines/${med.id}`).then((m) => setData(m.movements)); }, [med.id]);
  return (
    <Modal title={`Stock history · ${med.name}`} onClose={onClose} wide>
      <Table rows={data} empty="No stock movements." columns={[
        { h: 'When', r: (s) => fmtDateTime(s.created_at) }, { h: 'Change', r: (s) => <b style={{ color: s.change_qty < 0 ? 'var(--bad)' : 'var(--ok)' }}>{s.change_qty > 0 ? '+' : ''}{s.change_qty}</b>, num: true },
        { h: 'Reason', r: (s) => label(s.reason) }, { h: 'Reference', r: (s) => s.reference || '' }, { h: 'By', r: (s) => s.user_name || '' },
      ]} />
    </Modal>
  );
}

export default function Medicines() {
  const [q, setQ] = useState('');
  const [alerts, setAlerts] = useState(false);
  const [modal, setModal] = useState(null);
  const { data, error, reload } = useLoad('/medicines', { q, alerts: alerts ? '1' : '' });
  const done = () => { setModal(null); reload(); };
  const value = (data || []).reduce((s, m) => s + m.stock_quantity * m.unit_price, 0);
  return (
    <>
      <div className="bar">
        <input className="input" style={{ flex: '1 1 240px' }} placeholder="Search medicine" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search medicine" />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} /> Only alerts</label>
        <span className="muted">Stock value {money(value)}</span>
        <button className="btn primary grow" type="button" onClick={() => setModal({ type: 'new' })}>+ Add medicine</button>
      </div>
      <ErrorMsg error={error} />
      <Panel title="Medicine stock">
        <Table rows={data} empty="No medicines match." columns={[
          { h: 'Medicine', r: (m) => <><b>{m.name} {m.strength || ''}</b><br /><small className="muted">{label(m.form)}{m.generic_name && m.generic_name !== m.name ? ` · ${m.generic_name}` : ''}</small></> },
          { h: 'In stock', r: (m) => <b>{m.stock_quantity}</b>, num: true },
          { h: 'Reorder at', r: (m) => m.reorder_level, num: true },
          { h: 'Unit price', r: (m) => money(m.unit_price), num: true },
          { h: 'Batch / expiry', r: (m) => <><span className="mono">{m.batch_no || '—'}</span><br />{fmtDate(m.expiry_date)}</> },
          { h: 'Status', r: stockChips },
          { h: '', r: (m) => <div className="acts">
            <button className="btn sm primary" type="button" onClick={() => setModal({ type: 'restock', med: m })}>Restock</button>
            <button className="btn sm" type="button" onClick={() => setModal({ type: 'adjust', med: m })}>Adjust</button>
            <button className="btn sm" type="button" onClick={() => setModal({ type: 'edit', med: m })}>Edit</button>
            <button className="btn sm" type="button" onClick={() => setModal({ type: 'history', med: m })}>History</button>
          </div> },
        ]} />
      </Panel>
      {modal && (modal.type === 'new' || modal.type === 'edit') && <MedicineForm med={modal.med} onClose={() => setModal(null)} onDone={done} />}
      {modal && (modal.type === 'restock' || modal.type === 'adjust') && <StockForm med={modal.med} mode={modal.type} onClose={() => setModal(null)} onDone={done} />}
      {modal && modal.type === 'history' && <Movements med={modal.med} onClose={() => setModal(null)} />}
    </>
  );
}
