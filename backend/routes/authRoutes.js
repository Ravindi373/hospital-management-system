const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errorHandler');

// Slows down password guessing from a single address (on top of per-account lockout).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT || 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts from this network. Wait 15 minutes and try again.' },
});
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: Number(process.env.SIGNUP_RATE_LIMIT || 10), standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many sign-up requests. Try again later.' } });

router.post('/login', loginLimiter, validate(c.schemas.login), asyncHandler(c.login));
router.post('/register', signupLimiter, validate(c.schemas.register), asyncHandler(c.register));
router.post('/logout', requireAuth, asyncHandler(c.logout));
router.get('/me', requireAuth, asyncHandler(c.me));
router.post('/ping', requireAuth, asyncHandler(c.ping));
router.post('/change-password', requireAuth, validate(c.schemas.changePassword), asyncHandler(c.changePassword));

module.exports = router;
