import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface Props12 {
  entityId?: string;
  organizationId?: string;
  onAction?: (action: string, data: unknown) => void;
  onError?: (error: Error) => void;
  onSuccess?: (data: unknown) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function OrderForm12({ entityId, organizationId, onAction, onError, onSuccess, className, style, children }: Props12) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [localState, setLocalState] = useState<Record<string, unknown>>({});

  const fetchData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/order/' + entityId);
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result.data);
      onSuccess?.(result.data);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
    } finally {
      setLoading(false);
    }
  }, [entityId, onSuccess, onError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = useCallback(async (action: string, payload?: unknown) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/order/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, ...payload as object }),
      });
      if (!response.ok) throw new Error('Action failed');
      const result = await response.json();
      onAction?.(action, result.data);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [entityId, onAction, onError]);

  const memoizedData = useMemo(() => data, [data]);

  if (loading) return <div className={className} style={style}>Loading...</div>;
  if (error) return <div className={className} style={style}>Error: {error.message}</div>;

  return (
    <div className={className} style={style} data-testid="order-form-12">
      {children}
      {memoizedData ? <div>Order Form</div> : <div>No data</div>}
    </div>
  );
}

export default OrderForm12;