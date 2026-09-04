import React, { useState, useEffect } from 'react';

interface WidgetProps29 { refreshInterval?: number; }

export function UsageMetrics29({ refreshInterval = 30000 }: WidgetProps29) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/usagemetrics');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading UsageMetrics...</div>;
  return <div data-testid="usagemetrics-29">UsageMetrics Widget</div>;
}