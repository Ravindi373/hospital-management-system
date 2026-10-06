// Central error handling. Internal details are logged on the server and never sent to the browser.
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Wraps async route handlers so rejected promises reach the error handler.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'A record with these details already exists.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}

module.exports = { HttpError, asyncHandler, notFound, errorHandler };
