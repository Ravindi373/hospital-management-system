import { useState } from 'react';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { ErrorMsg, Panel, Table, Tabs, copyText, useToast } from '../components/UI';
import { addDays, isoDate, label, money } from '../services/format';

const TYPES = [['patients', 'Patient report'], ['appointments', 'Appointment report'], ['revenue', 'Revenue report'],
  ['pharmacy', 'Pharmacy report'], ['laboratory', 'Laboratory report'], ['staff', 'Staff report']];
const MONEY_COLS = new Set(['total', 'amount_paid', 'unit_price']);

export default function Reports() {
  const { can } = useAuth();
  const toast = useToast();
  const types = TYPES.filter(([t]) => (t === 'revenue' ? can('reports:revenue') : can('reports:read')));
  const [type, setType] = useState(types[0][0]);
  const [to, setTo] = useState(isoDate());
  const [from, setFrom] = useState(addDays(isoDate(), -29));
  const { data: r, error, loading } = useLoad(`/reports/${type}`, { from, to });

  const range = (days) => { setTo(isoDate()); setFrom(addDays(isoDate(), -(days - 1))); };
  const cell = (k, v) => (v == null ? '' : MONEY_COLS.has(k) ? money(v) : ['status', 'gender', 'role', 'priority'].includes(k) ? label(v) : String(v));
  function csv() {
    const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [r.columns.map(([, h]) => q(h)).join(','), ...r.rows.map((row) => r.columns.map(([k]) => q(row[k])).join(','))];
    copyText(lines.join('\n'), toast);
  }

  return (
    <>
      <Tabs value={type} onChange={setType} items={types} />
      <div className="bar">
        <label className="muted" htmlFor="r_from">From</label><input id="r_from" className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <label className="muted" htmlFor="r_to">To</label><input id="r_to" className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        <button className="btn sm" type="button" onClick={() => range(7)}>Last 7 days</button>
        <button className="btn sm" type="button" onClick={() => range(30)}>Last 30 days</button>
        <button className="btn sm" type="button" onClick={() => { setTo(isoDate()); setFrom(`${isoDate().slice(0, 8)}01`); }}>This month</button>
        {r && <button className="btn grow" type="button" onClick={csv}>Copy as CSV</button>}
      </div>
      <ErrorMsg error={error} />
      {r && !loading && (
        <>
          <div className="kpis">{r.kpis.map((k) => <div className="kpi" key={k.label}><span className="l">{k.label}</span><span className="v">{k.value}</span></div>)}</div>
          <div className="grid2">
            {r.breakdowns.map((b) => {
              const mx = Math.max(1, ...b.rows.map((x) => Number(x.value)));
              return (
                <Panel key={b.title} title={b.title} pad>
                  {b.rows.length ? b.rows.map((x) => (
                    <div className="hbar" key={x.label}><span>{label(x.label)}</span>
                      <div className="track"><div className="fill" style={{ width: `${(Number(x.value) / mx) * 100}%` }} /></div>
                      <span className="num">{x.display || x.value}</span></div>
                  )) : <p className="muted" style={{ margin: 0 }}>No data in this period.</p>}
                </Panel>
              );
            })}
          </div>
          <Panel title={`${r.title} · ${r.rows.length} row(s)`}>
            <Table rows={r.rows} rowKey={(row) => JSON.stringify(row)} empty="No records in this period."
              columns={r.columns.map(([k, h]) => ({ h, num: MONEY_COLS.has(k), r: (row) => (k === 'result_flag' && row[k] ? <span className={`flag ${row[k]}`}>{row[k]}</span> : cell(k, row[k])) }))} />
          </Panel>
        </>
      )}
      {loading && <div className="empty">Loading report…</div>}
    </>
  );
}
