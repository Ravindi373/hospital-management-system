// API client. Sends the session cookie (same origin), the anti-CSRF header, and turns errors into
// readable messages. Session problems are broadcast so the app can return to the sign-in page.
const listeners = new Set();
export const onAuthProblem = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export async function api(path, { method = 'GET', body, query, background = false } = {}) {
  let url = `/api${path}`;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if ([...qs].length) url += `?${qs}`;
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      // X-Background marks automatic checks (e.g. the bell) so they don't count as user activity.
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', ...(background ? { 'X-Background': '1' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new ApiError(res.status, (data && data.error) || `Request failed (${res.status}).`, data && data.code);
    if (res.status === 401 && !path.startsWith('/auth/login')) listeners.forEach((fn) => fn('expired', err));
    if (err.code === 'PASSWORD_CHANGE_REQUIRED') listeners.forEach((fn) => fn('password', err));
    throw err;
  }
  return data;
}

export const get = (path, query) => api(path, { query });
export const getBackground = (path, query) => api(path, { query, background: true });
export const post = (path, body) => api(path, { method: 'POST', body: body || {} });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
