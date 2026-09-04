import React, { useState, useEffect } from 'react';

interface WidgetProps1 { refreshInterval?: number; }

export function UsageMetrics1({ refreshInterval = 30000 }: WidgetProps1) {
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
  return <div data-testid="usagemetrics-1">UsageMetrics Widget</div>;
}