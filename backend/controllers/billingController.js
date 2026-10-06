// Accountant: generate bills from unbilled services and record payments.
const { z } = require('zod');
const db = require('../models/db');
const Billing = require('../models/billingModel');
const { audit } = require('../services/auditService');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schemas = {
  create: z.object({
    patientId: z.coerce.number().int().positive(),
    items: z.array(z.object({
      type: z.enum(['consultation', 'lab', 'pharmacy']),
      referenceId: z.coerce.number().int().positive(),
    })).max(100).default([]),
    extraItems: z.array(z.object({
      description: z.string().trim().min(2).max(200),
      amount: z.coerce.number().positive().max(10000000),
    })).max(20).default([]),
    discount: z.coerce.number().min(0).max(10000000).default(0),
  }),
  list: z.object({
    status: z.enum(['unpaid', 'partially_paid', 'paid', 'void']).optional(),
    patientId: z.coerce.number().int().positive().optional(),
    from: date.optional(), to: date.optional(),
  }),
  pay: z.object({
    amount: z.coerce.number().positive().max(10000000),
    method: z.enum(['cash', 'card', 'bank_transfer', 'insurance']),
    reference: z.string().trim().max(80).optional(),
  }),
  payments: z.object({ from: date.optional(), to: date.optional() }),
};

async function unbilled(req, res) {
  const patientId = parseId(req.params.patientId, 'patient');
  res.json(await Billing.unbilled(patientId));
}

async function create(req, res) {
  const b = req.body;
  const patient = await db.one('SELECT id, mrn FROM patients WHERE id = ?', [b.patientId]);
  if (!patient) throw new HttpError(400, 'Patient not found.');
  const available = await Billing.unbilled(b.patientId);
  const picked = b.items.map((i) => {
    const found = available.find((a) => a.type === i.type && a.reference_id === i.referenceId);
    if (!found) throw new HttpError(409, 'One of the selected charges has already been billed or does not belong to this patient. Reload and try again.');
    return found;
  });
  const items = [...picked, ...b.extraItems.map((e) => ({ type: 'other', reference_id: null, description: e.description, amount: e.amount }))];
  if (!items.length) throw new HttpError(400, 'Select at least one charge or add an item.');
  const subtotalC = items.reduce((s, i) => s + Billing.cents(i.amount), 0);
  if (Billing.cents(b.discount) > subtotalC) throw new HttpError(400, 'The discount cannot be more than the subtotal.');
  let id;
  try {
    id = await Billing.createInvoice({ patientId: b.patientId, items, discount: b.discount, userId: req.user.id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'One of these charges was billed a moment ago. Reload and try again.');
    throw err;
  }
  const inv = await Billing.get(id);
  await audit(req, 'INVOICE_CREATE', { entity: 'invoice', entityId: id, details: { invoiceNo: inv.invoice_no, mrn: patient.mrn, total: inv.total, discount: inv.discount } });
  res.status(201).json(inv);
}

const list = async (req, res) => res.json(await Billing.list(req.validQuery));

async function get(req, res) {
  const inv = await Billing.get(parseId(req.params.id));
  if (!inv) throw new HttpError(404, 'Invoice not found.');
  res.json(inv);
}

async function pay(req, res) {
  const id = parseId(req.params.id);
  const r = await Billing.pay(id, req.body, req.user.id);
  if (r.error) throw new HttpError(r.status, r.error);
  const payment = await Billing.payment(r.paymentId);
  await audit(req, 'PAYMENT_RECORDED', { entity: 'payment', entityId: r.paymentId, details: {
    receiptNo: payment.receipt_no, invoiceNo: payment.invoice_no, amount: payment.amount, method: payment.method } });
  res.status(201).json(payment);
}

async function getPayment(req, res) {
  const p = await Billing.payment(parseId(req.params.id));
  if (!p) throw new HttpError(404, 'Payment not found.');
  res.json(p);
}

const payments = async (req, res) => res.json(await Billing.payments(req.validQuery));

module.exports = { schemas, unbilled, create, list, get, pay, getPayment, payments };
