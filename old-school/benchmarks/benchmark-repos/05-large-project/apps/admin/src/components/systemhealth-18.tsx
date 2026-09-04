import React, { useState, useEffect } from 'react';

interface WidgetProps18 { refreshInterval?: number; }

export function SystemHealth18({ refreshInterval = 30000 }: WidgetProps18) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/systemhealth');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading SystemHealth...</div>;
  return <div data-testid="systemhealth-18">SystemHealth Widget</div>;
}