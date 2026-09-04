import React, { useState, useEffect } from 'react';

interface WidgetProps41 { refreshInterval?: number; }

export function UsageMetrics41({ refreshInterval = 30000 }: WidgetProps41) {
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
  return <div data-testid="usagemetrics-41">UsageMetrics Widget</div>;
}