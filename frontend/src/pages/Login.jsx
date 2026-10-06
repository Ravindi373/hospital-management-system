import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import HospitalArt from '../components/HospitalArt';

export default function Login() {
  const { user, signIn, notice, setNotice } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : '/'} replace />;

  async function submit(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (!username.trim() || !password) { setError('Enter your username and password.'); return; }
    setBusy(true);
    try {
      const u = await signIn(username.trim(), password);
      setPassword('');
      nav(u.mustChangePassword ? '/change-password' : (loc.state && loc.state.from) || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <HospitalArt />
        <div className="auth-head"><h1>City General Hospital</h1><p>Hospital Management System</p></div>
        {notice && <p className="okmsg" role="status">{notice}</p>}
        {(loc.state && loc.state.signedUp) && <p className="okmsg" role="status">{loc.state.signedUp}</p>}
        {error && <p className="err" role="alert">{error}</p>}
        <label className="sr-only" htmlFor="username">User name</label>
        <input id="username" className="pill" placeholder="User name" autoComplete="username" value={username}
          onChange={(e) => setUsername(e.target.value)} autoFocus maxLength={50} />
        <div className="pw-wrap">
          <label className="sr-only" htmlFor="password">Password</label>
          <input id="password" className="pill" type={show ? 'text' : 'password'} placeholder="Password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} maxLength={200} />
          <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <button className="btn-block" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="center" style={{ margin: 0, fontSize: 13.5 }}>Don't have an account? <Link to="/signup" style={{ fontWeight: 600 }}>Sign up</Link></p>
      </form>
    </div>
  );
}
