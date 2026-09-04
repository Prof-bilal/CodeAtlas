import React, { useState, useEffect } from 'react';

interface WidgetProps47 { refreshInterval?: number; }

export function ActivityFeed47({ refreshInterval = 30000 }: WidgetProps47) {
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
  return <div data-testid="activityfeed-47">ActivityFeed Widget</div>;
}