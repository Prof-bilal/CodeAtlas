import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface Options17 { enabled?: boolean; refetchInterval?: number; retry?: number; staleTime?: number; }

export function useNotification17<T>(key: string, options?: Options17) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (options?.enabled === false) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/' + key);
      if (!response.ok) throw new Error('Failed');
      const result = await response.json();
      if (mountedRef.current) setData(result.data);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [key, options?.enabled]);

  useEffect(() => { mountedRef.current = true; fetchData(); return () => { mountedRef.current = false; }; }, [fetchData]);

  useEffect(() => {
    if (!options?.refetchInterval) return;
    const interval = setInterval(fetchData, options.refetchInterval);
    return () => clearInterval(interval);
  }, [fetchData, options?.refetchInterval]);

  return useMemo(() => ({ data, loading, error, refetch: fetchData }), [data, loading, error, fetchData]);
}