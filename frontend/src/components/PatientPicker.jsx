// Type-ahead patient search (name, MRN, phone or NIC).
import { useEffect, useState } from 'react';
import { get } from '../services/api';

export default function PatientPicker({ value, onChange, id = 'patientPicker', autoFocus }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return undefined; }
    const t = setTimeout(() => get('/patients', { q: q.trim() }).then(setHits).catch(() => setHits([])), 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (value) {
    return (
      <div className="bar" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px' }}>
        <span><b>{value.full_name}</b> <span className="mono muted">{value.mrn}</span>
          {value.allergies && <span className="chip bad" style={{ marginLeft: 6 }}>Allergy: {value.allergies}</span>}</span>
        <button type="button" className="btn sm grow" onClick={() => { onChange(null); setQ(''); }}>Change</button>
      </div>
    );
  }
  return (
    <div className="picker">
      <input id={id} className="input" placeholder="Search name, MRN, phone or NIC" value={q} autoFocus={autoFocus} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && hits.length > 0 && (
        <div className="picker-list">
          {hits.map((p) => (
            <button type="button" key={p.id} onClick={() => { onChange(p); setOpen(false); }}>
              <b>{p.full_name}</b> <span className="mono muted">{p.mrn}</span><br />
              <small className="muted">{p.age} y · {p.gender} · {p.phone}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
