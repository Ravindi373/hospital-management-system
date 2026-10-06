// Vercel entry point: every /api/... request is handled by the Express app in backend/server.js.
// (On a normal server, `npm start` runs backend/server.js directly instead.)
module.exports = require('../backend/server');
