import React, { useState, useEffect } from 'react';

interface WidgetProps12 { refreshInterval?: number; }

export function UserStats12({ refreshInterval = 30000 }: WidgetProps12) {
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
  return <div data-testid="userstats-12">UserStats Widget</div>;
}