// Loads data from the API and re-loads when dependencies change.
import { useCallback, useEffect, useState } from 'react';
import { get } from './api';

export function useLoad(path, query, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify([path, query]);

  const reload = useCallback(async () => {
    if (!path) { setData(null); setLoading(false); return; }
    setLoading(true);
    try { setData(await get(path, query)); setError(''); } catch (e) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}
