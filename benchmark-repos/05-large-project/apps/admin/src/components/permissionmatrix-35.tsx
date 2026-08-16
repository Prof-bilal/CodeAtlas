import React, { useState, useEffect } from 'react';

interface WidgetProps35 { refreshInterval?: number; }

export function PermissionMatrix35({ refreshInterval = 30000 }: WidgetProps35) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/permissionmatrix');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading PermissionMatrix...</div>;
  return <div data-testid="permissionmatrix-35">PermissionMatrix Widget</div>;
}