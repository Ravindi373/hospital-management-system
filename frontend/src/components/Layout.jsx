// App shell: top bar (HMS + menu button, back button, theme switch, bell, user) and
// the side menu (only the modules the user's role may open).
// Computer: menu shown by default; the menu button hides / shows it.
// Phone: menu hidden by default; the menu button slides it in and clicking it again closes it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { initials, ROLE_LABEL } from '../services/format';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

const SMALL = '(max-width: 860px)';
const isSmall = () => window.matchMedia(SMALL).matches;

const I = {
  dash: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z',
  pat: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  rec: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6',
  rx: 'M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7',
  lab: 'M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L14 9V3M7 15h10',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  bill: 'M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2zM8 8h8M8 12h8M8 16h5',
  rep: 'M3 3v18h18M7 16v-5M12 16V7M17 16v-8',
  users: 'M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2',
  staff: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  audit: 'M12 8v4l3 3M3.05 11a9 9 0 1 1 .5 4M3 4v7h7',
  backup: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  sms: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 9h8M8 13h5',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  heart: 'M22 12h-4l-3 9L9 3l-3 9H2',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};

export const NAV = [
  ['Overview', [['/', 'Dashboard', null, I.dash]]],
  ['Front desk', [['/patients', 'Patients', 'patients:read', I.pat], ['/appointments', 'Appointments', 'appointments:read', I.cal],
    ['/vitals', 'Nurse station', 'nurse', I.heart]]],
  ['Clinical', [['/records', 'Medical records', 'records:read', I.rec], ['/prescriptions', 'Prescriptions', 'prescriptions:read', I.rx],
    ['/lab', 'Laboratory', 'lab:read', I.lab], ['/medicines', 'Medicine stock', 'medicines:write', I.box]]],
  ['Finance', [['/billing', 'Billing & payments', 'billing:read', I.bill], ['/reports', 'Reports', ['reports:read', 'reports:revenue'], I.rep]]],
  ['Administration', [['/users', 'Users & roles', 'users:manage', I.users], ['/staff', 'Doctors & staff', 'staff:manage', I.staff],
    ['/audit', 'Audit log', 'audit:read', I.audit], ['/backups', 'Backups', 'backup:manage', I.backup],
    ['/sms', 'Patient SMS', 'sms:manage', I.sms]]],
  ['Account', [['/account', 'Change password', null, I.key]]],
];

// Patients get their own, much smaller menu.
export const PATIENT_NAV = [
  ['My health', [['/', 'My dashboard', null, I.dash], ['/my/appointments', 'My appointments', null, I.cal],
    ['/my/records', 'Diagnoses & prescriptions', null, I.rec], ['/my/lab', 'Lab results', null, I.lab], ['/my/bills', 'Bills & payments', null, I.bill]]],
  ['Account', [['/my/profile', 'My details', null, I.user], ['/account', 'Change password', null, I.key]]],
];

const TITLES = Object.fromEntries([...NAV, ...PATIENT_NAV].flatMap(([, items]) => items.map(([p, l]) => [p, l])));
TITLES['/my'] = 'My health';

const Cross = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
);

const MenuIcon = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
  </svg>
);

export default function Layout() {
  const { user, signOut, can } = useAuth();
  const [small, setSmall] = useState(isSmall);
  const [open, setOpen] = useState(() => !isSmall());
  const nav = useNavigate();
  const loc = useLocation();
  const shell = useRef(null);
  const top = useRef(null);

  // Switching between phone and computer size resets the menu to that size's default.
  useEffect(() => {
    const mq = window.matchMedia(SMALL);
    const onChange = (e) => { setSmall(e.matches); setOpen(!e.matches); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // The menu sits just under the top bar, whose height changes on phones.
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => shell.current && shell.current.style.setProperty('--top-h', `${top.current.offsetHeight}px`));
    ro.observe(top.current);
    return () => ro.disconnect();
  }, []);
  // On a phone, Esc closes the menu and the page behind it does not scroll.
  useEffect(() => {
    if (!(small && open)) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [small, open]);

  // perm can be a permission, a list of permissions (any), or a role name such as 'nurse'.
  const allowed = (perm) => !perm || (Array.isArray(perm) ? perm.some(can) : perm === user.role || can(perm));
  const patient = user.role === 'patient';
  const menu = patient ? PATIENT_NAV : NAV;
  const parts = loc.pathname.split('/');
  const base = parts[1] === 'my' ? `/my/${parts[2] || ''}` : `/${parts[1]}`;
  const title = (base === '/' ? (patient ? 'My dashboard' : 'Dashboard') : TITLES[base]) || 'Hospital Management System';
  const canGoBack = (window.history.state && window.history.state.idx > 0);
  const afterNav = () => { if (small) setOpen(false); };

  return (
    <div ref={shell} className={`shell ${open ? 'nav-open' : 'nav-closed'}`}>
      <header className="top" ref={top}>
        <div className="top-left">
          <Link to="/" className="brand" onClick={afterNav}>
            <div className="brand-mark"><Cross /></div><div><b>HMS</b><small>City General Hospital</small></div>
          </Link>
          <button className="menu-btn" type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="main-menu"
            aria-label={open ? 'Close menu' : 'Open menu'} title={open ? 'Close menu' : 'Open menu'}>
            <MenuIcon open={open} />
          </button>
        </div>
        <div className="page-title">
          <button className="back-btn" type="button" onClick={() => nav(-1)} disabled={!canGoBack} aria-label="Back to previous page" title="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <h1>{title}</h1>
        </div>
        <div className="top-right">
          <ThemeToggle />
          <NotificationBell />
          <div className="who">
            <div className="av" title={`${user.fullName} · ${ROLE_LABEL[user.role]}`}>{initials(user.fullName)}</div>
            <div><b>{user.fullName}</b><small>{ROLE_LABEL[user.role]}</small></div>
          </div>
          <button className="btn sm" type="button" onClick={() => signOut('You signed out.')} aria-label="Sign out" title="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            <span className="signout-text">Sign out</span>
          </button>
        </div>
      </header>
      <div className="frame">
        <aside className="side" id="main-menu" aria-hidden={small && !open ? true : undefined} inert={small && !open ? '' : undefined}>
          <nav className="nav" aria-label="Main menu">
            {menu.map(([group, items]) => {
              const vis = items.filter(([, , perm]) => allowed(perm));
              if (!vis.length) return null;
              return (
                <div key={group}>
                  <div className="nav-g">{group}</div>
                  {vis.map(([path, l, , icon]) => (
                    <NavLink key={path} to={path} end={path === '/'} onClick={afterNav}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>{l}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="side-foot">{patient ? 'For your privacy you are signed out' : 'Signed-in sessions end'} after {user.idleMinutes} minutes without activity.</div>
        </aside>
        <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
        <main className="main-col"><Outlet /></main>
      </div>
    </div>
  );
}
