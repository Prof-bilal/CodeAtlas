import React, { useState, useEffect } from 'react';

interface WidgetProps20 { refreshInterval?: number; }

export function RevenueChart20({ refreshInterval = 30000 }: WidgetProps20) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/revenuechart');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading RevenueChart...</div>;
  return <div data-testid="revenuechart-20">RevenueChart Widget</div>;
}