// Server-side sessions.
// The browser holds a random 256-bit token in an HttpOnly, SameSite=Strict cookie.
// The database stores only its SHA-256 hash. Sessions end after SESSION_IDLE_MINUTES of
// inactivity or SESSION_ABSOLUTE_HOURS after sign-in, whichever comes first.
const crypto = require('crypto');
const db = require('../models/db');

const COOKIE_NAME = 'hms_sid';
const IDLE_MINUTES = () => Number(process.env.SESSION_IDLE_MINUTES || 15);
const ABSOLUTE_HOURS = () => Number(process.env.SESSION_ABSOLUTE_HOURS || 8);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function cookieOptions() {
  return {
    httpOnly: true,                                   // not readable from JavaScript
    secure: process.env.COOKIE_SECURE === 'true',     // set true when served over HTTPS
    sameSite: 'strict',
    path: '/',
    maxAge: ABSOLUTE_HOURS() * 3600 * 1000,
  };
}

async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [userId, hashToken(token), req.ip, (req.get('user-agent') || '').slice(0, 255), ABSOLUTE_HOURS()],
  );
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

async function findSession(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  return db.one(
    `SELECT s.id AS session_id, s.expires_at <= NOW() AS expired,
            TIMESTAMPDIFF(SECOND, s.last_activity_at, NOW()) AS idle_seconds,
            u.id, u.username, u.full_name, u.role, u.status, u.must_change_password, u.patient_id,
            d.id AS doctor_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
  LEFT JOIN doctors d ON d.user_id = u.id
      WHERE s.token_hash = ?`,
    [hashToken(token)],
  );
}

const touchSession = (sessionId) =>
  db.query('UPDATE sessions SET last_activity_at = NOW() WHERE id = ?', [sessionId]);

const destroySession = (sessionId) => db.query('DELETE FROM sessions WHERE id = ?', [sessionId]);

const destroyUserSessions = (userId, exceptSessionId = 0) =>
  db.query('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [userId, exceptSessionId]);

function clearCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
}

// Housekeeping: remove sessions that can no longer be used.
const purgeExpired = () =>
  db.query(
    `DELETE FROM sessions
      WHERE expires_at <= NOW() OR last_activity_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [IDLE_MINUTES()],
  );

module.exports = {
  COOKIE_NAME, IDLE_MINUTES, ABSOLUTE_HOURS,
  createSession, findSession, touchSession, destroySession, destroyUserSessions, clearCookie, purgeExpired,
};
