// Pharmacist: medicine stock - add, edit, restock by batch, adjust, and alerts for low stock and expiry.
const { z } = require('zod');
const Medicines = require('../models/medicineModel');
const { audit } = require('../services/auditService');
const { today } = require('../services/timeService');
const { HttpError } = require('../middleware/errorHandler');
const { parseId } = require('../middleware/validate');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const base = {
  name: z.string().trim().min(2).max(120),
  genericName: z.string().trim().max(120).optional(),
  form: z.enum(['tablet', 'capsule', 'syrup', 'injection', 'inhaler', 'sachet', 'cream', 'drops']),
  strength: z.string().trim().max(40).optional(),
  unitPrice: z.coerce.number().min(0).max(1000000),
  reorderLevel: z.coerce.number().int().min(0).max(1000000),
  supplier: z.string().trim().max(120).optional(),
};
const schemas = {
  list: z.object({ q: z.string().trim().max(60).optional(), alerts: z.enum(['1']).optional() }),
  create: z.object({
    ...base,
    stockQuantity: z.coerce.number().int().min(0).max(1000000),
    batchNo: z.string().trim().max(40).optional(),
    expiryDate: date.refine((d) => d > today(), 'expiry date must be in the future'),
  }),
  update: z.object({ ...base, isActive: z.boolean().optional() }).partial(),
  restock: z.object({
    quantity: z.coerce.number().int().min(1).max(1000000),
    batchNo: z.string().trim().min(1).max(40),
    expiryDate: date.refine((d) => d > today(), 'expiry date must be in the future'),
    discardExisting: z.boolean().default(false),
  }),
  adjust: z.object({
    change: z.coerce.number().int().refine((n) => n !== 0, 'change cannot be zero'),
    reason: z.enum(['adjustment', 'expired']),
    note: z.string().trim().min(3, 'say why the stock is being adjusted').max(80),
  }),
};

const list = async (req, res) => res.json(await Medicines.list({ q: req.validQuery.q, alertsOnly: req.validQuery.alerts === '1' }));

async function get(req, res) {
  const m = await Medicines.get(parseId(req.params.id));
  if (!m) throw new HttpError(404, 'Medicine not found.');
  res.json({ ...m, movements: await Medicines.movements(m.id) });
}

async function create(req, res) {
  const id = await Medicines.create(req.body, req.user.id);
  await audit(req, 'MEDICINE_CREATE', { entity: 'medicine', entityId: id, details: { name: req.body.name, stock: req.body.stockQuantity } });
  res.status(201).json(await Medicines.get(id));
}

async function update(req, res) {
  const id = parseId(req.params.id);
  if (!(await Medicines.get(id))) throw new HttpError(404, 'Medicine not found.');
  await Medicines.update(id, req.body);
  await audit(req, 'MEDICINE_UPDATE', { entity: 'medicine', entityId: id, details: req.body });
  res.json(await Medicines.get(id));
}

async function restock(req, res) {
  const id = parseId(req.params.id);
  if (!(await Medicines.get(id))) throw new HttpError(404, 'Medicine not found.');
  const r = await Medicines.restock(id, req.body, req.user.id);
  await audit(req, 'STOCK_RECEIVED', { entity: 'medicine', entityId: id, details: { ...req.body, ...r } });
  res.json(await Medicines.get(id));
}

async function adjust(req, res) {
  const id = parseId(req.params.id);
  if (!(await Medicines.get(id))) throw new HttpError(404, 'Medicine not found.');
  const r = await Medicines.adjust(id, req.body, req.user.id);
  if (r.error) throw new HttpError(400, r.error);
  await audit(req, 'STOCK_ADJUSTED', { entity: 'medicine', entityId: id, details: { ...req.body, ...r } });
  res.json(await Medicines.get(id));
}

module.exports = { schemas, list, get, create, update, restock, adjust };
