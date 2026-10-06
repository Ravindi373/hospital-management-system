import { useState } from 'react';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Panel, Table } from '../components/UI';
import { fmtDateTime, ROLE_LABEL } from '../services/format';

const BAD = /FAILED|LOCKED|BLOCKED|ALLERGY|REVOKED/;

export default function AuditLog() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useLoad('/audit', { q, action, from, to, page });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = (fn) => (e) => { fn(e.target.value); setPage(1); };

  return (
    <>
      <div className="bar">
        <input className="input" style={{ flex: '1 1 220px' }} placeholder="Search user, action or details" value={q} onChange={reset(setQ)} aria-label="Search audit log" />
        <select className="input" value={action} onChange={reset(setAction)} aria-label="Action"><option value="">All actions</option>{(data ? data.actions : []).map((a) => <option key={a}>{a}</option>)}</select>
        <input className="input" type="date" value={from} onChange={reset(setFrom)} aria-label="From" />
        <input className="input" type="date" value={to} onChange={reset(setTo)} aria-label="To" />
      </div>
      <ErrorMsg error={error} />
      <Panel title={`Audit trail${data ? ` · ${data.total} entries` : ''}`}>
        <Table rows={data && data.rows} empty="No matching entries." columns={[
          { h: 'When', r: (a) => <span className="mono">{fmtDateTime(a.created_at)}</span> },
          { h: 'User', r: (a) => <><span className="mono">{a.username || '—'}</span>{a.role && <><br /><small className="muted">{ROLE_LABEL[a.role] || a.role}</small></>}</> },
          { h: 'Action', r: (a) => (BAD.test(a.action) ? <Chip tone="bad">{a.action}</Chip> : <b className="mono small">{a.action}</b>) },
          { h: 'Record', r: (a) => (a.entity ? <span className="mono small">{a.entity} {a.entity_id}</span> : '') },
          { h: 'Details', r: (a) => <small className="mono" style={{ wordBreak: 'break-word' }}>{a.details || ''}</small> },
          { h: 'IP', r: (a) => <small className="mono muted">{a.ip_address || ''}</small> },
        ]} />
        <div className="pager">
          <button className="btn sm" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted small">Page {page} of {pages}</span>
          <button className="btn sm" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </Panel>
    </>
  );
}
