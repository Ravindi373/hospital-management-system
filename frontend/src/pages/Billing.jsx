import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, post } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Modal, Panel, Status, Table, Tabs, copyText, useToast } from '../components/UI';
import PatientPicker from '../components/PatientPicker';
import { fmtDate, fmtDateTime, label, money } from '../services/format';

const toC = (n) => Math.round(Number(n || 0) * 100);

function GenerateBill({ onClose, onCreated }) {
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [items, setItems] = useState(null);
  const [picked, setPicked] = useState([]);
  const [extra, setExtra] = useState({ description: '', amount: '' });
  const [discount, setDiscount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setItems(null); setPicked([]);
    if (patient) get(`/billing/unbilled/${patient.id}`).then((d) => { setItems(d); setPicked(d.map((i) => `${i.type}:${i.reference_id}`)); }).catch((e) => setError(e.message));
  }, [patient]);
  const chosen = (items || []).filter((i) => picked.includes(`${i.type}:${i.reference_id}`));
  const subtotalC = chosen.reduce((s, i) => s + toC(i.amount), 0) + (extra.description && Number(extra.amount) > 0 ? toC(extra.amount) : 0);
  const totalC = Math.max(0, subtotalC - toC(discount));

  async function create() {
    setError(''); setBusy(true);
    try {
      const inv = await post('/billing/invoices', {
        patientId: patient.id,
        items: chosen.map((i) => ({ type: i.type, referenceId: i.reference_id })),
        extraItems: extra.description && Number(extra.amount) > 0 ? [{ description: extra.description, amount: Number(extra.amount) }] : [],
        discount: Number(discount || 0),
      });
      toast(`Invoice ${inv.invoice_no} created · ${money(inv.total)}`);
      onCreated(inv);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Generate bill" onClose={onClose} wide
      footer={<><span className="grow" style={{ marginRight: 'auto' }}><b>Total {money(totalC / 100)}</b></span>
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" onClick={create} disabled={!patient || busy || subtotalC === 0}>{busy ? 'Creating…' : 'Create invoice'}</button></>}>
      <ErrorMsg error={error} />
      <Field label="Patient" required><PatientPicker value={patient} onChange={setPatient} autoFocus /></Field>
      {patient && (items === null ? <p className="muted">Loading charges…</p> : (
        <>
          <Table rows={items} rowKey={(i) => `${i.type}:${i.reference_id}`} empty="No unbilled charges for this patient. You can still add an item below." columns={[
            { h: '', r: (i) => { const k = `${i.type}:${i.reference_id}`; return <input type="checkbox" aria-label="Include" checked={picked.includes(k)} onChange={(e) => setPicked(e.target.checked ? [...picked, k] : picked.filter((x) => x !== k))} />; } },
            { h: 'Type', r: (i) => <Chip>{label(i.type)}</Chip> }, { h: 'Charge', r: (i) => i.description }, { h: 'Amount', r: (i) => money(i.amount), num: true },
          ]} />
          <div className="fgrid three">
            <Field label="Other item" id="bx_d"><input id="bx_d" className="input" placeholder="e.g. Dressing" value={extra.description} onChange={(e) => setExtra({ ...extra, description: e.target.value })} /></Field>
            <Field label="Amount (Rs.)" id="bx_a"><input id="bx_a" className="input" type="number" min="0" value={extra.amount} onChange={(e) => setExtra({ ...extra, amount: e.target.value })} /></Field>
            <Field label="Discount (Rs.)" id="bx_ds"><input id="bx_ds" className="input" type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          </div>
          <p style={{ margin: 0, textAlign: 'right' }}>Subtotal {money(subtotalC / 100)} · Discount {money(toC(discount) / 100)} · <b>Total {money(totalC / 100)}</b></p>
        </>
      ))}
    </Modal>
  );
}

function receiptText(p) {
  return ['CITY GENERAL HOSPITAL', 'PAYMENT RECEIPT', '------------------------------', `Receipt : ${p.receipt_no}`, `Date    : ${fmtDateTime(p.paid_at)}`,
    `Patient : ${p.patient_name} (${p.mrn})`, `Invoice : ${p.invoice_no}`, `Method  : ${label(p.method)}${p.reference ? ` (${p.reference})` : ''}`,
    `Amount  : ${money(p.amount)}`, `Balance : ${money(p.balance)}`, `Received by: ${p.received_by_name}`].join('\n');
}

function InvoiceView({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: inv, reload } = useLoad(`/billing/invoices/${id}`);
  const [pay, setPay] = useState({ amount: '', method: 'cash', reference: '' });
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (inv) setPay((p) => ({ ...p, amount: inv.balance > 0 ? inv.balance.toFixed(2) : '' })); }, [inv]);
  if (!inv) return <Modal title="Invoice" onClose={onClose}><p>Loading…</p></Modal>;

  async function record() {
    setError('');
    try {
      const p = await post(`/billing/invoices/${inv.id}/payments`, { amount: Number(pay.amount), method: pay.method, reference: pay.reference || undefined });
      toast(`Payment ${p.receipt_no} recorded`); setReceipt(p); reload(); onChanged();
    } catch (e) { setError(e.message); }
  }
  const text = ['CITY GENERAL HOSPITAL', `INVOICE ${inv.invoice_no}    ${fmtDate(inv.created_at)}`, `Patient: ${inv.patient_name} (${inv.mrn})`, '----------------------------------------',
    ...inv.items.map((i) => `${i.description.slice(0, 44).padEnd(46)}${money(i.amount).padStart(16)}`), '----------------------------------------',
    `${'Subtotal'.padEnd(46)}${money(inv.subtotal).padStart(16)}`, `${'Discount'.padEnd(46)}${money(inv.discount).padStart(16)}`,
    `${'TOTAL'.padEnd(46)}${money(inv.total).padStart(16)}`, `${'Paid'.padEnd(46)}${money(inv.amount_paid).padStart(16)}`, `${'BALANCE DUE'.padEnd(46)}${money(inv.balance).padStart(16)}`].join('\n');

  return (
    <Modal title={`Invoice ${inv.invoice_no}`} onClose={onClose} wide
      footer={<><button className="btn" type="button" onClick={() => copyText(text, toast)}>Copy invoice text</button><button className="btn primary" type="button" onClick={onClose}>Done</button></>}>
      <div className="bar"><span>{inv.patient_name} <span className="mono muted">{inv.mrn}</span> · {fmtDate(inv.created_at)}</span><span className="grow"><Status value={inv.status} /></span></div>
      <Table rows={inv.items} columns={[{ h: 'Type', r: (i) => <Chip>{label(i.item_type)}</Chip> }, { h: 'Description', r: (i) => i.description }, { h: 'Amount', r: (i) => money(i.amount), num: true }]} />
      <p style={{ margin: 0, textAlign: 'right' }}>Subtotal {money(inv.subtotal)} · Discount {money(inv.discount)} · <b>Total {money(inv.total)}</b> · Paid {money(inv.amount_paid)} · <b>Balance {money(inv.balance)}</b></p>
      {inv.payments.length > 0 && <Table rows={inv.payments} columns={[
        { h: 'Receipt', r: (p) => <span className="mono">{p.receipt_no}</span> }, { h: 'Paid', r: (p) => fmtDateTime(p.paid_at) },
        { h: 'Method', r: (p) => `${label(p.method)}${p.reference ? ` · ${p.reference}` : ''}` }, { h: 'By', r: (p) => p.received_by_name }, { h: 'Amount', r: (p) => money(p.amount), num: true }]} />}
      {can('payments:write') && inv.balance > 0 && (
        <Panel title="Record payment" pad>
          <ErrorMsg error={error} />
          <div className="fgrid three">
            <Field label="Amount (Rs.)" required id="py_a"><input id="py_a" className="input" type="number" min="0.01" step="0.01" max={inv.balance} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Method" id="py_m"><select id="py_m" className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              {['cash', 'card', 'bank_transfer', 'insurance'].map((m) => <option key={m} value={m}>{label(m)}</option>)}</select></Field>
            <Field label="Card / transfer reference" id="py_r"><input id="py_r" className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} maxLength={80} /></Field>
          </div>
          <div style={{ marginTop: 10 }}><button className="btn primary" type="button" onClick={record}>Record payment</button></div>
        </Panel>
      )}
      {receipt && <div className="panel"><div className="panel-h"><h2>Receipt {receipt.receipt_no}</h2><button className="btn sm" type="button" onClick={() => copyText(receiptText(receipt), toast)}>Copy receipt</button></div>
        <pre className="doc-print" style={{ margin: 12 }}>{receiptText(receipt)}</pre></div>}
    </Modal>
  );
}

export default function Billing() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('invoices');
  const [status, setStatus] = useState('');
  const [gen, setGen] = useState(params.get('new') === '1');
  const [view, setView] = useState(null);
  const inv = useLoad(tab === 'invoices' ? '/billing/invoices' : null, { status });
  const pays = useLoad(tab === 'payments' ? '/billing/payments' : null);
  const closeGen = () => { setGen(false); if (params.get('new')) setParams({}, { replace: true }); };

  return (
    <>
      <div className="bar">
        <Tabs value={tab} onChange={setTab} items={[['invoices', 'Invoices'], ['payments', 'Payments received']]} />
        {tab === 'invoices' && <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>{['unpaid', 'partially_paid', 'paid'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>}
        {can('billing:write') && <button className="btn primary grow" type="button" onClick={() => setGen(true)}>+ Generate bill</button>}
      </div>
      <ErrorMsg error={inv.error || pays.error} />
      {tab === 'invoices' ? (
        <Panel title="Invoices">
          <Table rows={inv.data} empty="No invoices yet." columns={[
            { h: 'Invoice', r: (i) => <span className="mono">{i.invoice_no}</span> }, { h: 'Date', r: (i) => fmtDate(i.created_at) },
            { h: 'Patient', r: (i) => <>{i.patient_name}<br /><small className="mono muted">{i.mrn}</small></> },
            { h: 'Total', r: (i) => money(i.total), num: true }, { h: 'Balance', r: (i) => money(i.balance), num: true },
            { h: 'Status', r: (i) => <Status value={i.status} /> },
            { h: '', r: (i) => <button className={`btn sm ${i.balance > 0 && can('payments:write') ? 'primary' : ''}`} type="button" onClick={() => setView(i.id)}>{i.balance > 0 && can('payments:write') ? 'Receive payment' : 'View'}</button> },
          ]} />
        </Panel>
      ) : (
        <Panel title="Payments received">
          <Table rows={pays.data} empty="No payments yet." columns={[
            { h: 'Receipt', r: (p) => <span className="mono">{p.receipt_no}</span> }, { h: 'Paid', r: (p) => fmtDateTime(p.paid_at) },
            { h: 'Invoice', r: (p) => <span className="mono">{p.invoice_no}</span> }, { h: 'Patient', r: (p) => p.patient_name },
            { h: 'Method', r: (p) => label(p.method) }, { h: 'Amount', r: (p) => money(p.amount), num: true },
          ]} />
        </Panel>
      )}
      {gen && <GenerateBill onClose={closeGen} onCreated={(i) => { closeGen(); inv.reload(); setView(i.id); }} />}
      {view && <InvoiceView id={view} onClose={() => setView(null)} onChanged={() => { inv.reload(); pays.reload(); }} />}
    </>
  );
}
