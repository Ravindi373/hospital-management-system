import { useState } from 'react';
import { post } from '../services/api';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Panel, Table, useToast } from '../components/UI';
import { fmtDateTime } from '../services/format';

export default function Backups() {
  const toast = useToast();
  const { data, error, reload } = useLoad('/backups');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function run() {
    setBusy(true); setErr('');
    try { const b = await post('/backups'); toast(`Backup ${b.file} created`); reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <ErrorMsg error={error || err} />
      <div className="grid2">
        <Panel title="Database backups" actions={<button className="btn sm primary" type="button" onClick={run} disabled={busy}>{busy ? 'Backing up…' : 'Back up now'}</button>}>
          <Table rows={data && data.backups} rowKey={(b) => b.file} empty="No backups yet." columns={[
            { h: 'File', r: (b) => <span className="mono small">{b.file}</span> },
            { h: 'Type', r: (b) => <Chip tone={b.kind === 'manual' ? '' : 'acc'}>{b.kind}</Chip> },
            { h: 'Taken', r: (b) => fmtDateTime(b.createdAt) },
            { h: 'Size', r: (b) => `${(b.size / 1024).toFixed(1)} KB`, num: true },
          ]} />
        </Panel>
        <Panel title="Backup policy" pad>
          <dl className="dl">
            <dt>Automatic</dt><dd>Schedule <span className="mono">{data ? data.schedule : ''}</span> (cron format; default every day at 02:00)</dd>
            <dt>Kept for</dt><dd>{data ? data.retentionDays : ''} days, then deleted automatically</dd>
            <dt>Format</dt><dd>Compressed SQL dump (<span className="mono">.sql.gz</span>) made with mysqldump in a single consistent transaction</dd>
            <dt>Stored</dt><dd>On the server only, readable by the server account. Backups are not downloadable through the website.</dd>
          </dl>
        </Panel>
        <Panel title="Restoring a backup" pad>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Stop the HMS server so no one is writing data.</li>
            <li>On the server run: <span className="mono small">gunzip -c backups/FILE.sql.gz | mysql -u root -p hospital_db</span></li>
            <li>Start the server again and check the record counts on the dashboard.</li>
            <li>Note the restore in the audit log and tell staff what time the data was restored to.</li>
          </ol>
          <p className="note warn" style={{ margin: '12px 0 0' }}>Copy backups to a second location (another disk or encrypted cloud storage) at least weekly, and test a restore once a month.</p>
        </Panel>
      </div>
    </>
  );
}
