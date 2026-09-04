import React, { useState, useEffect } from 'react';

interface WidgetProps11 { refreshInterval?: number; }

export function PermissionMatrix11({ refreshInterval = 30000 }: WidgetProps11) {
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
  return <div data-testid="permissionmatrix-11">PermissionMatrix Widget</div>;
}