// Shared building blocks: status chips, panels, tables, form fields, tabs, modal dialog and toast.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { label, TONE } from '../services/format';

export const Chip = ({ children, tone = '' }) => <span className={`chip ${tone}`}>{children}</span>;
export const Status = ({ value }) => <Chip tone={TONE[value] || ''}>{label(value)}</Chip>;

export function Panel({ title, actions, children, pad = false }) {
  return (
    <section className="panel">
      {title && <div className="panel-h"><h2>{title}</h2>{actions}</div>}
      {pad ? <div className="panel-b">{children}</div> : children}
    </section>
  );
}

// columns: [{ h: 'Header', r: (row) => node, num: true }]
export function Table({ columns, rows, empty = 'Nothing to show yet.', rowKey = (r) => r.id }) {
  if (!rows) return <div className="empty">Loading…</div>;
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="tbl-wrap">
      <table className="stack">
        <thead><tr>{columns.map((c, i) => <th key={i} className={c.num ? 'num' : ''}>{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r) ?? i}>{columns.map((c, j) => <td key={j} className={c.num ? 'num' : ''} data-label={typeof c.h === 'string' ? c.h : ''}><div className="cell">{c.r(r)}</div></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// With an `id` the field is a <label> tied to that input. Without one (pickers, slot grids) it is a
// plain <div>: a <label> around buttons would re-trigger the first button when anything inside is clicked.
export function Field({ label: text, required, hint, full, children, id }) {
  const inner = <><span>{text}{required && <i> *</i>}</span>{children}{hint && <small>{hint}</small>}</>;
  return id
    ? <label className={`fld ${full ? 'full' : ''}`} htmlFor={id}>{inner}</label>
    : <div className={`fld ${full ? 'full' : ''}`} role="group" aria-label={text}>{inner}</div>;
}

export function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const first = ref.current && ref.current.querySelector('input, select, textarea, button.primary');
    if (first) first.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal">
      <div className="scrim" onClick={onClose} />
      <div className={`dlg ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header><h2>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button></header>
        <div className="dlg-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export const ErrorMsg = ({ error }) => (error ? <p className="err" role="alert">{error}</p> : null);

// Toasts
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const timer = useRef(null);
  const show = useCallback((m) => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(''), 2800); }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}

// Form state helper: const [f, set, setF] = useForm({ name: '' }); <input value={f.name} onChange={set('name')} />
export function useForm(initial) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => {
    const v = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setF((p) => ({ ...p, [k]: v }));
  };
  return [f, set, setF];
}

// Copy to clipboard, falling back to a text box the user can copy from.
export async function copyText(text, toast) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Copy failed - select the text and press Ctrl+C'); }
}
