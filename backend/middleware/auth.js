// Authentication: loads the signed-in user from the session cookie on every request,
// enforces the idle and absolute session timeouts, and blocks everything except
// "change password" while a user still has a temporary password.
const sessions = require('../services/sessionService');
const { audit } = require('../services/auditService');
const { HttpError } = require('./errorHandler');

const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/me', '/api/auth/logout', '/api/auth/change-password', '/api/auth/ping']);

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[sessions.COOKIE_NAME];
    if (!token) throw new HttpError(401, 'Please sign in.', 'NOT_AUTHENTICATED');

    const s = await sessions.findSession(token);
    if (!s) {
      sessions.clearCookie(res);
      throw new HttpError(401, 'Your session has ended. Please sign in again.', 'SESSION_EXPIRED');
    }

    const idleLimit = sessions.IDLE_MINUTES() * 60;
    if (s.expired || s.idle_seconds > idleLimit || s.status !== 'active') {
      await sessions.destroySession(s.session_id);
      sessions.clearCookie(res);
      const user = { id: s.id, username: s.username, role: s.role };
      await audit(req, s.status !== 'active' ? 'SESSION_REVOKED' : 'SESSION_TIMEOUT', {
        user, details: { idleSeconds: s.idle_seconds, reason: s.expired ? 'absolute limit' : s.status !== 'active' ? `account ${s.status}` : 'idle' },
      });
      throw new HttpError(401, 'Your session timed out. Please sign in again.', 'SESSION_EXPIRED');
    }

    // Refresh activity at most every 30 seconds to keep database writes low.
    // Background checks (the notification bell) send X-Background and do NOT count as activity,
    // otherwise an open page would never time out.
    if (s.idle_seconds > 30 && !req.get('x-background')) await sessions.touchSession(s.session_id);

    req.sessionId = s.session_id;
    req.user = {
      id: s.id,
      username: s.username,
      fullName: s.full_name,
      role: s.role,
      doctorId: s.doctor_id || null,
      patientId: s.patient_id || null,
      mustChangePassword: !!s.must_change_password,
    };

    if (req.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.originalUrl.split('?')[0])) {
      throw new HttpError(403, 'Please choose a new password before continuing.', 'PASSWORD_CHANGE_REQUIRED');
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth };
