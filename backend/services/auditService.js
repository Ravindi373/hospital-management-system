// Audit trail. Every sign-in, sign-out, failed attempt, record view and data change is written here.
// Never pass passwords or tokens in `details`.
const db = require('../models/db');

const SENSITIVE = /pass|token|secret|hash/i;

function clean(details) {
  if (!details) return null;
  const out = {};
  for (const [k, v] of Object.entries(details)) out[k] = SENSITIVE.test(k) ? '[redacted]' : v;
  return JSON.stringify(out).slice(0, 4000);
}

async function audit(req, action, { entity = null, entityId = null, details = null, user = null } = {}) {
  const u = user || (req && req.user) || {};
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, username, role, action, entity, entity_id, details, ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [u.id || null, u.username || null, u.role || null, action, entity,
        entityId == null ? null : String(entityId), clean(details), req ? req.ip : null],
    );
  } catch (err) {
    // Auditing must never break the request, but a failure is logged loudly.
    console.error('AUDIT WRITE FAILED', action, err.message);
  }
}

module.exports = { audit };
