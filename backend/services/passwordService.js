// Password hashing (bcrypt, salted, cost 12 by default) and password policy.
const bcrypt = require('bcryptjs');

const ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
// Used to spend the same time on unknown usernames as on real ones (prevents user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', ROUNDS);

function policyError(password, username = '') {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be at most 72 bytes.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Password needs both upper- and lower-case letters.';
  if (!/\d/.test(password)) return 'Password needs at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password needs at least one symbol, such as ! @ # or $.';
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'Password must not contain your username.';
  return null;
}

const hash = (password) => bcrypt.hash(password, ROUNDS);
const verify = (password, passwordHash) => bcrypt.compare(password, passwordHash);
const verifyDummy = (password) => bcrypt.compare(String(password || ''), DUMMY_HASH);

module.exports = { policyError, hash, verify, verifyDummy };
