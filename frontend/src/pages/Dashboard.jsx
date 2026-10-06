import { Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { Panel, Status, Table, ErrorMsg } from '../components/UI';
import { fmtDate, fmtDateTime, money } from '../services/format';

const Kpi = ({ to, label, value, sub, alert }) => {
  const body = <><span className="l">{label}</span><span className="v">{value}</span>{sub && <span className="small muted">{sub}</span>}</>;
  return to ? <Link to={to} className={`kpi ${alert ? 'alert' : ''}`}>{body}</Link> : <div className={`kpi ${alert ? 'alert' : ''}`}>{body}</div>;
};

// Quick actions per role, matching each role's daily work.
const ACTIONS = {
  receptionist: [['/patients?new=1', 'Register patient'], ['/appointments?book=1', 'Book appointment']],
  nurse: [['/vitals', 'Nurse station'], ['/appointments', 'Appointments'], ['/patients', 'Patient history']],
  doctor: [['/appointments', 'My appointments'], ['/patients', 'Check patient history'], ['/records', 'Medical records'], ['/prescriptions', 'Prescriptions']],
  lab_staff: [['/lab?new=1', 'New test request'], ['/lab', 'Enter results']],
  pharmacist: [['/prescriptions', 'Check prescriptions'], ['/medicines', 'Manage stock']],
  accountant: [['/billing?new=1', 'Generate bill'], ['/billing', 'Record payments']],
  admin: [['/users', 'Manage users'], ['/staff', 'Doctors & staff'], ['/reports', 'Check reports'], ['/backups', 'Backups']],
};

export default function Dashboard() {
  const { user, can } = useAuth();
  const { data, error } = useLoad('/dashboard');
  const appts = useLoad(can('appointments:read') ? '/appointments' : null, { date: data && data.today });
  if (error) return <ErrorMsg error={error} />;
  if (!data) return <div className="empty">Loading…</div>;
  const c = data.cards;
  const mx = Math.max(1, ...(data.payments7d || []).map((d) => d.total));

  return (
    <>
      <div>
        <h2 style={{ fontSize: 20 }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user.fullName.split(' ')[user.fullName.startsWith('Dr') ? 1 : 0]}</h2>
        <p className="muted" style={{ margin: '2px 0 0' }}>{fmtDate(data.today)}</p>
      </div>

      {user.role === 'admin' && c.pending_users > 0 && (
        <div className="note warn bar"><span><b>{c.pending_users} account request{c.pending_users > 1 ? 's' : ''}</b> waiting for approval.</span>
          <Link className="btn sm primary grow" to="/users">Review</Link></div>
      )}

      <div className="kpis">
        {'patients' in c && <Kpi to="/patients" label="Total patients" value={c.patients} sub={`${c.new_today} registered today`} />}
        {'appts_today' in c && <Kpi to="/appointments" label="Appointments today" value={c.appts_today} sub={`${c.waiting} checked in, waiting`} />}
        {'my_appts_today' in c && <Kpi to="/appointments" label="My appointments today" value={c.my_appts_today} sub={`${c.waiting} waiting to be seen`} />}
        {'rx_pending' in c && <Kpi to="/prescriptions" label="My prescriptions not yet dispensed" value={c.rx_pending} />}
        {'lab_results_new' in c && <Kpi to="/lab" label="New lab results (2 days)" value={c.lab_results_new} />}
        {'vitals_due' in c && <Kpi to="/vitals" label="Vitals still to record" value={c.vitals_due} sub={`${c.vitals_today} recorded today`} alert={c.vitals_due > 0} />}
        {'lab_requested' in c && <Kpi to="/lab" label="Lab requests" value={c.lab_requested + c.lab_awaiting_result} sub={`${c.lab_urgent} urgent · ${c.lab_awaiting_result} awaiting result`} alert={c.lab_urgent > 0} />}
        {'rx_to_dispense' in c && <Kpi to="/prescriptions" label="Prescriptions to dispense" value={c.rx_to_dispense} />}
        {'low_stock' in c && <Kpi to="/medicines" label="Stock alerts" value={c.low_stock + c.expired + c.expiring} sub={`${c.low_stock} low · ${c.expired} expired · ${c.expiring} expiring`} alert={c.expired > 0} />}
        {'outstanding' in c && <Kpi to="/billing" label="Outstanding" value={money(c.outstanding)} sub={`${c.unpaid_invoices} unpaid invoices`} />}
        {'collected_month' in c && <Kpi to="/billing" label="Collected this month" value={money(c.collected_month)} sub={`${money(c.collected_today)} today`} />}
        {'failed_logins_24h' in c && <Kpi to="/audit" label="Failed sign-ins (24 h)" value={c.failed_logins_24h} alert={c.failed_logins_24h > 5} />}
      </div>

      <div className="bar">{(ACTIONS[user.role] || []).map(([to, l], i) => <Link key={to} className={`btn ${i === 0 ? 'primary' : ''}`} to={to}>{l}</Link>)}</div>

      <div className="grid2">
        {can('appointments:read') && (
          <Panel title={user.role === 'doctor' ? 'My appointments today' : "Today's appointments"} actions={<Link className="btn sm" to="/appointments">Open</Link>}>
            <Table rows={appts.data} empty="No appointments today." columns={[
              { h: 'Time', r: (a) => <span className="mono">{a.appointment_time}</span> },
              { h: 'Patient', r: (a) => <>{a.patient_name}<br /><small className="mono muted">{a.mrn}</small></> },
              ...(user.role === 'doctor' ? [] : [{ h: 'Doctor', r: (a) => a.doctor_name }]),
              { h: 'Status', r: (a) => <Status value={a.status} /> },
            ]} />
          </Panel>
        )}
        {data.payments7d && (
          <Panel title="Payments received · last 7 days" pad>
            <div className="bars">
              {data.payments7d.map((d, i) => (
                <div className="b" key={d.date}>
                  <span className="val">{d.total ? `${(d.total / 1000).toFixed(1)}k` : ''}</span>
                  <div className="col" style={{ height: `${(d.total / mx) * 100}%`, background: i === 6 ? 'var(--ink)' : undefined }} />
                  <span className="lab">{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
        {data.lastBackup !== undefined && (
          <Panel title="Last database backup" pad actions={<Link className="btn sm" to="/backups">Backups</Link>}>
            {data.lastBackup ? <p style={{ margin: 0 }}><span className="mono">{data.lastBackup.file}</span><br /><span className="muted">{fmtDateTime(data.lastBackup.createdAt)}</span></p>
              : <p className="note warn" style={{ margin: 0 }}>No backup has been taken yet. Open Backups and start one.</p>}
          </Panel>
        )}
      </div>
    </>
  );
}
