// Hospital Management System - API server
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });   // TZ in .env sets the server's time zone
// Hosts that reserve TZ (Vercel) use APP_TIMEZONE instead, e.g. APP_TIMEZONE=Asia/Colombo.
if (process.env.APP_TIMEZONE) process.env.TZ = process.env.APP_TIMEZONE;

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const db = require('./models/db');
const sessions = require('./services/sessionService');
const backups = require('./services/backupService');
const { audit } = require('./services/auditService');
const sms = require('./services/smsService');
const notifications = require('./services/notificationService');
const { csrfGuard } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');

for (const key of ['DB_USER', 'DB_PASSWORD']) {
  if (!process.env[key]) { console.error(`Missing ${key} in .env - copy .env.example to .env and fill it in.`); process.exit(1); }
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// Security headers: Content-Security-Policy, HSTS, no-sniff, frame blocking, referrer policy...
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      // Only force HTTPS sub-requests when the site is actually served over HTTPS.
      'upgrade-insecure-requests': process.env.COOKIE_SECURE === 'true' ? [] : null,
    },
  },
  hsts: process.env.COOKIE_SECURE === 'true' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// API responses hold patient data: never cache them.
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', csrfGuard);
app.get('/api/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});
// Daily scheduled job for hosts without an always-on server (Vercel Cron calls this once a day).
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; without the secret the job cannot be started.
app.get('/api/cron/daily', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Not allowed.' });
  const out = {};
  try { out.remindersQueued = await sms.queueReminders(); await sms.processQueue(); } catch (e) { out.smsError = e.message; }
  try { await notifications.stockSummary(); out.stockCheck = 'done'; } catch (e) { out.stockError = e.message; }
  try { await sessions.purgeExpired(); } catch { /* not critical */ }
  await audit(null, 'DAILY_JOB', { user: { username: 'system' }, details: out });
  return res.json(out);
});
app.use('/api', require('./routes'));
app.use('/api', notFound);

// In production the built React app is served from the same origin as the API.
const dist = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`HMS API listening on http://localhost:${PORT}`);
    try { await db.query('SELECT 1'); console.log('Connected to MySQL.'); } catch (e) { console.error('Cannot reach MySQL:', e.message); }
  });

  // Remove dead sessions every 10 minutes.
  setInterval(() => sessions.purgeExpired().catch((e) => console.error('Session purge failed', e.message)), 10 * 60 * 1000).unref();

  // Patient SMS worker + next-day reminders, and the pharmacists' morning stock check.
  sms.start();
  const cron = require('node-cron');
  const stockCron = process.env.STOCK_ALERT_CRON || '30 7 * * *';
  if (cron.validate(stockCron)) cron.schedule(stockCron, () => notifications.stockSummary());

  if (process.env.BACKUP_ENABLED !== 'false') {
    backups.schedule((err, b) => {
      if (err) { console.error('Scheduled backup failed:', err.message); audit(null, 'BACKUP_FAILED', { user: { username: 'system' }, details: { error: err.message } }); notifications.alerts.backupFailed(err.message); }
      else audit(null, 'BACKUP_CREATED', { user: { username: 'system' }, entity: 'backup', entityId: b.file, details: { size: b.size, scheduled: true } });
    });
  }
}

module.exports = app;
