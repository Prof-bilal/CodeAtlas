import React, { useState, useEffect } from 'react';

interface WidgetProps21 { refreshInterval?: number; }

export function PerformanceGraph21({ refreshInterval = 30000 }: WidgetProps21) {
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
  return <div data-testid="performancegraph-21">PerformanceGraph Widget</div>;
}