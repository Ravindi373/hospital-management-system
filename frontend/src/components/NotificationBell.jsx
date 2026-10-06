// Bell icon in the top bar: unread count, and a list of the user's notifications.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, getBackground, post } from '../services/api';
import { useToast } from './UI';
import { timeAgo } from '../services/format';

export default function NotificationBell() {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const nav = useNavigate();

  const toast = useToast();
  const newest = useRef(null);
  const load = useCallback(() => get('/notifications').then(setData).catch(() => {}), []);
  // Automatic check every 30 s. It is a "background" request, so it does not keep an idle session alive.
  const poll = useCallback(() => getBackground('/notifications').then((d) => {
    const top = d.items[0];
    if (newest.current !== null && top && top.id > newest.current && !top.is_read) toast(`New notification: ${top.title}`);
    newest.current = top ? top.id : 0;
    setData(d);
  }).catch(() => {}), [toast]);
  useEffect(() => { poll(); const t = setInterval(poll, 30000); return () => clearInterval(t); }, [poll]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  async function openItem(n) {
    if (!n.is_read) await post(`/notifications/${n.id}/read`).catch(() => {});
    setOpen(false); load();
    if (n.link) nav(n.link);
  }
  async function readAll() { await post('/notifications/read-all').catch(() => {}); load(); }

  return (
    <div className="bell" ref={box}>
      <button type="button" className="back-btn" onClick={() => { setOpen(!open); if (!open) load(); }}
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} aria-expanded={open}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {data.unread > 0 && <span className="bell-badge">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head"><b>Notifications</b>{data.unread > 0 && <button type="button" className="linkish" onClick={readAll}>Mark all as read</button>}</div>
          {data.items.length === 0 && <div className="empty">No notifications yet.</div>}
          {data.items.map((n) => (
            <button key={n.id} type="button" className={`bell-item ${n.is_read ? '' : 'unread'}`} onClick={() => openItem(n)}>
              <b>{n.title}</b>
              {n.body && <span>{n.body}</span>}
              <small>{timeAgo(n.created_at)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
