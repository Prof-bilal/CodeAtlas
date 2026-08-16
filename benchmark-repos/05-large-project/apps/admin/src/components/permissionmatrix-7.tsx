import React, { useState, useEffect } from 'react';

interface WidgetProps7 { refreshInterval?: number; }

export function PermissionMatrix7({ refreshInterval = 30000 }: WidgetProps7) {
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
  return <div data-testid="permissionmatrix-7">PermissionMatrix Widget</div>;
}