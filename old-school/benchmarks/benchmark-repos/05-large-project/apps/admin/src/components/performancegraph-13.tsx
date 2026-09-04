import React, { useState, useEffect } from 'react';

interface WidgetProps13 { refreshInterval?: number; }

export function PerformanceGraph13({ refreshInterval = 30000 }: WidgetProps13) {
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
  return <div data-testid="performancegraph-13">PerformanceGraph Widget</div>;
}