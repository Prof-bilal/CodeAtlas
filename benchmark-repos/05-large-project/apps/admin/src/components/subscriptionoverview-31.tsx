import React, { useState, useEffect } from 'react';

interface WidgetProps31 { refreshInterval?: number; }

export function SubscriptionOverview31({ refreshInterval = 30000 }: WidgetProps31) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/subscriptionoverview');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading SubscriptionOverview...</div>;
  return <div data-testid="subscriptionoverview-31">SubscriptionOverview Widget</div>;
}