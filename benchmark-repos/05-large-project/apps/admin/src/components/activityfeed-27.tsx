import React, { useState, useEffect } from 'react';

interface WidgetProps27 { refreshInterval?: number; }

export function ActivityFeed27({ refreshInterval = 30000 }: WidgetProps27) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/activityfeed');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading ActivityFeed...</div>;
  return <div data-testid="activityfeed-27">ActivityFeed Widget</div>;
}