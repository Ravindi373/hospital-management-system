// MySQL connection pool and helpers.
// Every query in the app goes through query()/withTransaction() with "?" placeholders,
// so user input is always escaped by the driver (no SQL injection through string building).
const mysql = require('mysql2/promise');

// Hosted databases (Aiven, PlanetScale ...) need an encrypted connection: set DB_SSL=true.
// Put the provider's CA certificate (PEM text) in DB_SSL_CA to also verify the server.
function sslOptions() {
  if (process.env.DB_SSL !== 'true') return undefined;
  const ca = process.env.DB_SSL_CA;
  return ca ? { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true } : { rejectUnauthorized: false };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'hospital_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  dateStrings: true,        // return DATE/DATETIME as strings, no time-zone shifting
  decimalNumbers: true,     // DECIMAL -> JS number (amounts are rounded to cents in code)
  multipleStatements: false,
  charset: 'utf8mb4',
  ssl: sslOptions(),
});

// Make MySQL's NOW()/CURDATE() use the same time zone as the Node process (TZ in .env, e.g. Asia/Colombo),
// so "today", appointment times and receipt times agree everywhere.
function utcOffset() {
  const m = -new Date().getTimezoneOffset();
  const sign = m >= 0 ? '+' : '-';
  const a = Math.abs(m);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
pool.on('connection', (conn) => { conn.query('SET time_zone = ?', [utcOffset()]); });

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Runs fn(q) inside a transaction. q(sql, params) has the same shape as query().
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params = []) => (await conn.query(sql, params))[0];
    const result = await fn(q);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, withTransaction };
