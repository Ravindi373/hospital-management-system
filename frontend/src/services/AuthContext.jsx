// Holds the signed-in user, and signs the user out after the idle timeout.
// The server enforces the same timeout; this side shows a warning one minute before
// and keeps the session alive while the person is actively using the page.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { get, post, onAuthProblem } from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [warnSeconds, setWarnSeconds] = useState(0);
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());

  useEffect(() => {
    get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (username, password) => {
    const d = await post('/auth/login', { username, password });
    lastActivity.current = Date.now(); lastPing.current = Date.now();
    setNotice(''); setUser(d.user);
    return d.user;
  }, []);

  const signOut = useCallback(async (message = '') => {
    try { await post('/auth/logout'); } catch { /* session may already be gone */ }
    setUser(null); setWarnSeconds(0); setNotice(message);
  }, []);

  const refresh = useCallback(async () => { const d = await get('/auth/me'); setUser(d.user); }, []);

  // Server says the session ended or a password change is required.
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => onAuthProblem((kind) => {
    if (kind === 'expired') {
      // Only tell the person their session ended if they were actually signed in.
      if (userRef.current) setNotice('Your session ended. Please sign in again.');
      setUser(null); setWarnSeconds(0);
    }
    if (kind === 'password') setUser((u) => (u ? { ...u, mustChangePassword: true } : u));
  }), []);

  // Idle timer
  useEffect(() => {
    if (!user) return undefined;
    const idleMs = (user.idleMinutes || 15) * 60 * 1000;
    const mark = () => { lastActivity.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      const left = Math.ceil((idleMs - idle) / 1000);
      if (left <= 0) { signOut('You were signed out after a period of inactivity.'); return; }
      setWarnSeconds(left <= 60 ? left : 0);
      // Active in the last minute and no ping for 2 minutes: tell the server we are still here.
      if (idle < 60000 && Date.now() - lastPing.current > 120000) {
        lastPing.current = Date.now();
        post('/auth/ping').catch(() => {});
      }
    }, 1000);
    return () => { clearInterval(timer); events.forEach((e) => window.removeEventListener(e, mark)); };
  }, [user, signOut]);

  const stay = () => { lastActivity.current = Date.now(); lastPing.current = Date.now(); setWarnSeconds(0); post('/auth/ping').catch(() => {}); };
  const can = (perm) => !!user && user.permissions.includes(perm);

  return (
    <AuthCtx.Provider value={{ user, loading, notice, setNotice, signIn, signOut, refresh, can }}>
      {children}
      {warnSeconds > 0 && (
        <div className="modal" role="alertdialog" aria-labelledby="idleT">
          <div className="scrim" />
          <div className="dlg" style={{ maxWidth: 420 }}>
            <header><h2 id="idleT">Are you still there?</h2></header>
            <div className="dlg-body"><p style={{ margin: 0 }}>For patient privacy you will be signed out in <b>{warnSeconds} seconds</b>.</p></div>
            <footer>
              <button className="btn" type="button" onClick={() => signOut('You signed out.')}>Sign out</button>
              <button className="btn primary" type="button" onClick={stay}>Stay signed in</button>
            </footer>
          </div>
        </div>
      )}
    </AuthCtx.Provider>
  );
}
