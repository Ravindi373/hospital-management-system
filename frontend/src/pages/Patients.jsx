import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { post, patch } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useLoad } from '../services/useLoad';
import { Chip, ErrorMsg, Field, Modal, Panel, Table, useForm, useToast } from '../components/UI';
import { fmtDate, label, isoDate } from '../services/format';

const EMPTY = { firstName: '', lastName: '', gender: '', dateOfBirth: '', nic: '', bloodGroup: '', phone: '', email: '',
  address: '', allergies: '', emergencyContactName: '', emergencyContactPhone: '', smsConsent: true };

export function PatientForm({ patient, onClose, onSaved }) {
  const toast = useToast();
  const [f, set] = useForm(patient ? {
    firstName: patient.first_name, lastName: patient.last_name, gender: patient.gender, dateOfBirth: patient.date_of_birth,
    nic: patient.nic || '', bloodGroup: patient.blood_group || '', phone: patient.phone, email: patient.email || '',
    address: patient.address || '', allergies: patient.allergies || '', emergencyContactName: patient.emergency_contact_name || '',
    emergencyContactPhone: patient.emergency_contact_phone || '', smsConsent: !!patient.sms_consent } : EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError('');
    try {
      const p = patient ? await patch(`/patients/${patient.id}`, f) : await post('/patients', f);
      toast(patient ? 'Patient details saved' : `Registered ${p.full_name} as ${p.mrn}`);
      onSaved(p);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={patient ? `Update ${patient.full_name} · ${patient.mrn}` : 'Register patient'} onClose={onClose} wide
      footer={<><button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : patient ? 'Save changes' : 'Register patient'}</button></>}>
      <ErrorMsg error={error} />
      <div className="fgrid three">
        <Field label="First name" required id="p_fn"><input id="p_fn" className="input" value={f.firstName} onChange={set('firstName')} /></Field>
        <Field label="Last name" required id="p_ln"><input id="p_ln" className="input" value={f.lastName} onChange={set('lastName')} /></Field>
        <Field label="Sex" required id="p_g"><select id="p_g" className="input" value={f.gender} onChange={set('gender')}>
          <option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></Field>
        <Field label="Date of birth" required id="p_dob"><input id="p_dob" className="input" type="date" max={isoDate()} value={f.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
        <Field label="NIC number" id="p_nic" hint="123456789V or 200012345678"><input id="p_nic" className="input" value={f.nic} onChange={set('nic')} /></Field>
        <Field label="Blood group" id="p_bg"><select id="p_bg" className="input" value={f.bloodGroup} onChange={set('bloodGroup')}>
          <option value="">Unknown</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Phone" required id="p_ph"><input id="p_ph" className="input" type="tel" placeholder="0771234567" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email" id="p_em"><input id="p_em" className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Known allergies" id="p_al" hint="Leave blank if none"><input id="p_al" className="input" value={f.allergies} onChange={set('allergies')} /></Field>
        <Field label="Address" full id="p_ad"><input id="p_ad" className="input" value={f.address} onChange={set('address')} /></Field>
        <Field label="Emergency contact" id="p_ecn"><input id="p_ecn" className="input" value={f.emergencyContactName} onChange={set('emergencyContactName')} /></Field>
        <Field label="Emergency contact phone" id="p_ecp"><input id="p_ecp" className="input" type="tel" value={f.emergencyContactPhone} onChange={set('emergencyContactPhone')} /></Field>
        <label className="fld full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} htmlFor="p_sms">
          <input id="p_sms" type="checkbox" checked={f.smsConsent} onChange={set('smsConsent')} /> Patient agrees to SMS (appointment confirmations, reminders, lab report ready)
        </label>
      </div>
    </Modal>
  );
}

export default function Patients() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [form, setForm] = useState(params.get('new') === '1' ? 'new' : null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data, error, reload } = useLoad('/patients', { q: debounced });

  const close = () => { setForm(null); if (params.get('new')) setParams({}, { replace: true }); };

  return (
    <>
      <div className="bar">
        <input className="input" style={{ flex: '1 1 280px' }} placeholder="Search name, MRN, phone or NIC" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
        {can('patients:write') && <button className="btn primary grow" type="button" onClick={() => setForm('new')}>+ Register patient</button>}
      </div>
      <ErrorMsg error={error} />
      <Panel title={debounced ? `Search results for “${debounced}”` : 'Recently registered patients'}>
        <Table rows={data} empty="No patients match this search." columns={[
          { h: 'MRN', r: (p) => <span className="mono">{p.mrn}</span> },
          { h: 'Name', r: (p) => <><b>{p.full_name}</b>{p.allergies && <><br /><Chip tone="bad">Allergy: {p.allergies}</Chip></>}</> },
          { h: 'Age / sex', r: (p) => `${p.age} y · ${label(p.gender)}` },
          { h: 'Phone', r: (p) => <span className="mono">{p.phone}</span> },
          { h: 'Registered', r: (p) => fmtDate(p.created_at) },
          { h: '', r: (p) => <div className="acts">
            <Link className="btn sm" to={`/patients/${p.id}`}>{can('patients:history') ? 'History' : 'View'}</Link>
            {can('patients:write') && <button className="btn sm" type="button" onClick={() => setForm(p)}>Edit</button>}
            {can('appointments:write') && <Link className="btn sm" to={`/appointments?book=1&patient=${p.id}`}>Book</Link>}
          </div> },
        ]} />
      </Panel>
      {form && <PatientForm patient={form === 'new' ? null : form} onClose={close} onSaved={() => { close(); reload(); }} />}
    </>
  );
}
