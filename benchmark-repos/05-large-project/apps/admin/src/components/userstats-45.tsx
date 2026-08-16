import React, { useState, useEffect } from 'react';

interface WidgetProps45 { refreshInterval?: number; }

export function UserStats45({ refreshInterval = 30000 }: WidgetProps45) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/userstats');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading UserStats...</div>;
  return <div data-testid="userstats-45">UserStats Widget</div>;
}