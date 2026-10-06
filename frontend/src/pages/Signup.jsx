import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../services/api';
import { Field, useForm } from '../components/UI';
import HospitalArt from '../components/HospitalArt';
import { isoDate } from '../services/format';

// Who is signing up. Patients get access straight away; staff wait for an administrator.
const CATEGORIES = [
  ['patient', 'Patient', 'Book appointments, see your results, prescriptions and bills. Ready to use immediately.'],
  ['doctor', 'Doctor', 'Appointments, patient history, diagnosis and prescriptions.'],
  ['nurse', 'Nurse', 'Patient check-in, vital signs and the day’s clinic list.'],
  ['receptionist', 'Receptionist', 'Register patients and book appointments.'],
  ['lab_staff', 'Lab Staff', 'Test requests and results.'],
  ['pharmacist', 'Pharmacist', 'Prescriptions, dispensing and stock.'],
  ['accountant', 'Accountant', 'Bills and payments.'],
];

const BackLink = () => (
  <Link to="/login" className="back-btn" aria-label="Back to sign in" style={{ position: 'absolute', top: 16, left: 16, color: 'inherit' }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
  </Link>
);

export default function Signup() {
  const [role, setRole] = useState('');
  const [f, set] = useForm({ fullName: '', firstName: '', lastName: '', gender: '', dateOfBirth: '', nic: '', address: '',
    email: '', phone: '', username: '', password: '', confirm: '', agree: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const nav = useNavigate();
  const patient = role === 'patient';
  const roleName = (CATEGORIES.find((c) => c[0] === role) || [])[1];

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!role) { setError('Choose who you are first.'); return; }
    if (f.password !== f.confirm) { setError('The two passwords do not match.'); return; }
    if (!f.agree) { setError(patient ? 'Tick the privacy agreement to continue.' : 'Tick the confidentiality agreement to continue.'); return; }
    setBusy(true);
    try {
      const common = { role, email: f.email, phone: f.phone, username: f.username, password: f.password };
      const body = patient
        ? { ...common, firstName: f.firstName, lastName: f.lastName, gender: f.gender, dateOfBirth: f.dateOfBirth, nic: f.nic, address: f.address }
        : { ...common, fullName: f.fullName };
      const r = await post('/auth/register', body);
      if (r.active) nav('/login', { replace: true, state: { signedUp: r.message } });
      else setSent(r.message);
    } catch (err) { setError(err.message); window.scrollTo(0, 0); } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <div className="auth">
        <div className="auth-card">
          <BackLink />
          <HospitalArt small />
          <div className="auth-head"><h1>Request sent</h1><p>{roleName} account for <b>{f.username}</b></p></div>
          <p className="okmsg" role="status">{sent}</p>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
            <li>The administrator has been notified.</li>
            <li>You will get an email at <b>{f.email}</b> when your request is approved or declined.</li>
            <li>After approval, sign in with your username and password.</li>
          </ol>
          <Link className="btn-block" to="/login" style={{ textAlign: 'center', textDecoration: 'none' }}>Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <form className="auth-card wide" onSubmit={submit} noValidate>
        <BackLink />
        <HospitalArt small />
        <div className="auth-head"><h1>Create an account</h1><p>First, tell us who you are.</p></div>
        {error && <p className="err" role="alert">{error}</p>}

        <Field label="I am a" required id="su_role" hint={role ? CATEGORIES.find((c) => c[0] === role)[2] : 'Choose Patient, or your job at the hospital.'}>
          <select id="su_role" className="input" value={role} onChange={(e) => { setRole(e.target.value); setError(''); }}>
            <option value="">Select…</option>
            <option value="patient">Patient</option>
            <optgroup label="Hospital staff">
              {CATEGORIES.filter(([v]) => v !== 'patient').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </optgroup>
          </select>
        </Field>

        {role && (
          <>
            <p className={patient ? 'note ok' : 'note warn'} style={{ margin: 0 }}>
              {patient
                ? 'Your account will be ready to use as soon as you sign up. If you are already a patient here, use the same NIC, date of birth and phone number the hospital has, and we will link your records.'
                : `Staff accounts need administrator approval. The administrator will be notified, and you will get an email when your ${roleName} account is approved or declined.`}
            </p>
            <div className="fgrid">
              {patient ? <>
                <Field label="First name" required id="su_fn"><input id="su_fn" className="input" value={f.firstName} onChange={set('firstName')} autoComplete="given-name" /></Field>
                <Field label="Last name" required id="su_ln"><input id="su_ln" className="input" value={f.lastName} onChange={set('lastName')} autoComplete="family-name" /></Field>
                <Field label="Sex" required id="su_g"><select id="su_g" className="input" value={f.gender} onChange={set('gender')}>
                  <option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></Field>
                <Field label="Date of birth" required id="su_dob"><input id="su_dob" className="input" type="date" max={isoDate()} value={f.dateOfBirth} onChange={set('dateOfBirth')} autoComplete="bday" /></Field>
                <Field label="NIC number" id="su_nic" hint="Needed to link an existing hospital record"><input id="su_nic" className="input" placeholder="200012345678" value={f.nic} onChange={set('nic')} /></Field>
                <Field label="Address" id="su_ad"><input id="su_ad" className="input" value={f.address} onChange={set('address')} autoComplete="street-address" /></Field>
              </> : (
                <Field label="Full name" required full id="su_name"><input id="su_name" className="input" value={f.fullName} onChange={set('fullName')} autoComplete="name" placeholder={role === 'doctor' ? 'Dr. ' : ''} /></Field>
              )}
              <Field label={patient ? 'Email' : 'Work email'} required id="su_email"><input id="su_email" className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
              <Field label="Phone" required id="su_phone"><input id="su_phone" className="input" type="tel" placeholder="0771234567" value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
              <Field label="User name" required full id="su_user" hint="3-50 lowercase letters, numbers, dots or dashes">
                <input id="su_user" className="input" value={f.username} onChange={set('username')} autoComplete="username" />
              </Field>
              <Field label="Password" required id="su_pw" hint="10+ characters with upper and lower case, a number and a symbol">
                <input id="su_pw" className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" />
              </Field>
              <Field label="Confirm password" required id="su_pw2"><input id="su_pw2" className="input" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }} htmlFor="su_ok">
              <input id="su_ok" type="checkbox" checked={f.agree} onChange={set('agree')} style={{ marginTop: 3 }} />
              {patient
                ? 'I agree that the hospital may store my details and show me my medical information through this website.'
                : 'I will keep patient information confidential and use this system only for my work at the hospital.'}
            </label>
            <button className="btn-block" type="submit" disabled={busy}>{busy ? 'Sending…' : patient ? 'Create my account' : 'Send request for approval'}</button>
          </>
        )}
        <p className="center" style={{ margin: 0, fontSize: 13.5 }}>Already have an account? <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link></p>
      </form>
    </div>
  );
}
