// Folder for the "outbox" log files (SMS and email written instead of sent).
// On Vercel the project folder is read-only, so the temporary folder is used there.
const os = require('os');
const path = require('path');

module.exports = () => (process.env.VERCEL ? path.join(os.tmpdir(), 'hms-logs') : path.resolve(__dirname, '../../logs'));
