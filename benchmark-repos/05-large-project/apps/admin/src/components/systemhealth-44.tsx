import React, { useState, useEffect } from 'react';

interface WidgetProps44 { refreshInterval?: number; }

export function SystemHealth44({ refreshInterval = 30000 }: WidgetProps44) {
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
  return <div data-testid="systemhealth-44">SystemHealth Widget</div>;
}