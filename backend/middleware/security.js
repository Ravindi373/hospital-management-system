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

// An entry may start with a wildcard sub-domain, e.g. https://*.trycloudflare.com
// (matches https://any-words.trycloudflare.com but not https://trycloudflare.com.evil.com).
function originAllowed(origin) {
  return allowedOrigins().some((a) => {
    if (a === origin) return true;
    const m = a.match(/^(https?:\/\/)\*\.(.+)$/);
    return !!m && origin.startsWith(m[1]) && /^[a-z0-9-]+$/i.test(origin.slice(m[1].length, -(m[2].length + 1)))
      && origin.endsWith(`.${m[2]}`);
  });
}

function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  // The site's own address is always allowed (same-origin), so it works on any host name
  // (Vercel preview links, a new tunnel link ...) without editing ALLOWED_ORIGINS.
  const self = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== self && !originAllowed(origin)) {
    return next(new HttpError(403, 'Request origin is not allowed.', 'BAD_ORIGIN'));
  }
  if (!req.get('x-requested-with')) {
    return next(new HttpError(403, 'Missing request header.', 'CSRF'));
  }
  return next();
}

module.exports = { csrfGuard, allowedOrigins, originAllowed };
