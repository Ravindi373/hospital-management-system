// Database backups with mysqldump.
//  - Scheduled automatically (BACKUP_CRON, default every day at 02:00) when the server runs.
//  - Admins can start one from the Backups page.
//  - Run by hand:  npm run backup
// Files are gzip-compressed SQL dumps in BACKUP_DIR; files older than BACKUP_RETENTION_DAYS are deleted.
// The password is passed through the MYSQL_PWD environment variable, never on the command line.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');

const backupDir = () => path.resolve(__dirname, '..', process.env.BACKUP_DIR || '../backups');
const pad = (x) => String(x).padStart(2, '0');

function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function runBackup(kind = 'manual') {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `hms-${stamp()}-${kind}.sql.gz`);
  const args = [
    '--single-transaction', '--quick', '--no-tablespaces', '--triggers',
    '-h', process.env.DB_HOST || 'localhost', '-P', String(process.env.DB_PORT || 3306),
    '-u', process.env.BACKUP_DB_USER || process.env.DB_USER,
    process.env.DB_NAME || 'hospital_db',
  ];
  const child = spawn(process.env.MYSQLDUMP_PATH || 'mysqldump', args, {
    env: { ...process.env, MYSQL_PWD: process.env.BACKUP_DB_PASSWORD || process.env.DB_PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  const exited = new Promise((resolve, reject) => {
    child.on('error', (e) => reject(new Error(`Could not start mysqldump (${e.code}). Set MYSQLDUMP_PATH in .env.`)));
    child.on('close', resolve);
  });
  const out = fs.createWriteStream(file, { mode: 0o600 });
  try {
    await pipeline(child.stdout, zlib.createGzip(), out);
    const code = await exited;
    if (code !== 0) throw new Error(`mysqldump failed: ${stderr.trim().split('\n').pop()}`);
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
  pruneOld();
  const st = fs.statSync(file);
  return { file: path.basename(file), size: st.size, createdAt: st.mtime.toISOString(), kind };
}

function listBackups() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^hms-.*\.sql\.gz$/.test(f)).map((f) => {
    const st = fs.statSync(path.join(dir, f));
    return { file: f, size: st.size, createdAt: st.mtime.toISOString(), kind: f.replace(/^hms-\d{8}-\d{6}-|\.sql\.gz$/g, '') };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pruneOld() {
  const days = Number(process.env.BACKUP_RETENTION_DAYS || 30);
  const cutoff = Date.now() - days * 864e5;
  for (const b of listBackups()) {
    if (new Date(b.createdAt).getTime() < cutoff) fs.rmSync(path.join(backupDir(), b.file), { force: true });
  }
}

function schedule(onDone) {
  const cron = require('node-cron');
  const expr = process.env.BACKUP_CRON || '0 2 * * *';
  if (!cron.validate(expr)) { console.error(`Invalid BACKUP_CRON "${expr}" - automatic backups disabled.`); return; }
  cron.schedule(expr, async () => {
    try { const b = await runBackup('scheduled'); onDone && onDone(null, b); } catch (err) { onDone && onDone(err); }
  });
  console.log(`Automatic database backups scheduled (${expr}) into ${backupDir()}`);
}

// CLI:  node services/backupService.js --now
if (require.main === module && process.argv.includes('--now')) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  runBackup('manual')
    .then((b) => { console.log(`Backup written: ${b.file} (${(b.size / 1024).toFixed(1)} KB)`); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { runBackup, listBackups, schedule, backupDir };
