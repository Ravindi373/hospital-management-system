// Request-forgery protection (CSRF) in two layers on top of the SameSite=Strict session cookie:
//  1. Any state-changing request that carries an Origin header must come from an allowed origin.
//  2. Every state-changing request must carry the X-Requested-With header, which a plain HTML
//     form on another site cannot set.
const { HttpError } = require('./errorHandler');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5000')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins().includes(origin)) {
    return next(new HttpError(403, 'Request origin is not allowed.', 'BAD_ORIGIN'));
  }
  if (!req.get('x-requested-with')) {
    return next(new HttpError(403, 'Missing request header.', 'CSRF'));
  }
  return next();
}

module.exports = { csrfGuard, allowedOrigins };
