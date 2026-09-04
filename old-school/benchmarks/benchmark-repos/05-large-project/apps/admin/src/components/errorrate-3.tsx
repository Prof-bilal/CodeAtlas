import React, { useState, useEffect } from 'react';

interface WidgetProps3 { refreshInterval?: number; }

export function ErrorRate3({ refreshInterval = 30000 }: WidgetProps3) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/errorrate');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading ErrorRate...</div>;
  return <div data-testid="errorrate-3">ErrorRate Widget</div>;
}