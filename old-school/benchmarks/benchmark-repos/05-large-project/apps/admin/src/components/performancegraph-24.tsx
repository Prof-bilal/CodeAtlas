import React, { useState, useEffect } from 'react';

interface WidgetProps24 { refreshInterval?: number; }

export function PerformanceGraph24({ refreshInterval = 30000 }: WidgetProps24) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/performancegraph');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading PerformanceGraph...</div>;
  return <div data-testid="performancegraph-24">PerformanceGraph Widget</div>;
}