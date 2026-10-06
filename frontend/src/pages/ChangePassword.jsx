import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { Field, Panel, useForm, useToast } from '../components/UI';

// Used for the forced first-login change and from "My account".
export default function ChangePassword({ forced }) {
  const { refresh, signOut, user } = useAuth();
  const [f, set, setF] = useForm({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (f.next !== f.confirm) { setError('The two new passwords do not match.'); return; }
    setBusy(true);
    try {
      await post('/auth/change-password', { currentPassword: f.current, newPassword: f.next });
      setF({ current: '', next: '', confirm: '' });
      await refresh();
      toast('Password changed. Other devices have been signed out.');
      if (forced) nav('/', { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const form = (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
      {error && <p className="err" role="alert">{error}</p>}
      <Field label="Current password" id="cp0"><input id="cp0" className="input" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} /></Field>
      <Field label="New password" id="cp1" hint="At least 10 characters with upper and lower case letters, a number and a symbol. Must not contain your username.">
        <input id="cp1" className="input" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} />
      </Field>
      <Field label="Confirm new password" id="cp2"><input id="cp2" className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} /></Field>
      <div className="bar"><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        {forced && <button className="btn" type="button" onClick={() => signOut()}>Sign out</button>}</div>
    </form>
  );

  if (forced) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-head"><h1>Choose a new password</h1><p>Hello {user && user.fullName}. Your account has a temporary password. Choose your own before you continue.</p></div>
          {form}
        </div>
      </div>
    );
  }
  return <div style={{ maxWidth: 520 }}><Panel title="Change password" pad>{form}</Panel></div>;
}
