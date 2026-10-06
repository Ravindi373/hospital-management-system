// Request validation with zod. Unknown fields are stripped, so a client cannot set columns
// it is not supposed to (mass-assignment protection).
//   validate(schema)          -> replaces req.body with the parsed body
//   validate(schema, 'query') -> puts the parsed query string on req.validQuery
const { HttpError } = require('./errorHandler');

const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] || {});
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    return next(new HttpError(400, msg, 'VALIDATION'));
  }
  if (source === 'body') req.body = result.data;
  else req.validQuery = result.data;
  return next();
};

// Parses a positive integer route parameter such as /patients/:id
function parseId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `Invalid ${label}.`);
  return n;
}

module.exports = { validate, parseId };
