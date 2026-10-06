// Loads database/schema.sql and database/seed.sql into a MySQL server - for a hosted database
// (Railway, Aiven ...) where phpMyAdmin is not available.
//
//   node scripts/import-db.js "mysql://USER:PASSWORD@HOST:PORT"
//
// It creates the hospital_db database. WARNING: it DELETES any existing HMS tables in hospital_db first.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const url = process.argv[2];
if (!url || !/^mysql:\/\//.test(url)) {
  console.log('Give the database address, e.g. node scripts/import-db.js "mysql://root:PASSWORD@HOST:PORT"');
  process.exit(1);
}

(async () => {
  const u = new URL(url);
  const conn = await mysql.createConnection({
    host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    multipleStatements: true, connectTimeout: 20000,
    ssl: /aivencloud\.com$/.test(u.hostname) ? { rejectUnauthorized: false } : undefined,
  });
  for (const f of ['schema.sql', 'seed.sql']) {
    process.stdout.write(`Importing ${f} ... `);
    await conn.query(fs.readFileSync(path.resolve(__dirname, '../../database', f), 'utf8'));
    console.log('done');
  }
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM hospital_db.users');
  console.log(`Database ready: ${n} user accounts. Sign in as admin / ChangeMe@2026 and choose a new password.`);
  await conn.end();
})().catch((e) => { console.log('ERROR:', e.message); process.exit(1); });
