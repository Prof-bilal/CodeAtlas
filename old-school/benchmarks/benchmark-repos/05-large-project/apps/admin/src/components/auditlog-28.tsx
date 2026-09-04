import React, { useState, useEffect } from 'react';

interface WidgetProps28 { refreshInterval?: number; }

export function AuditLog28({ refreshInterval = 30000 }: WidgetProps28) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/admin/widgets/auditlog');
        if (response.ok) { const result = await response.json(); setData(result.data); }
      } finally { setLoading(false); }
    };
    fetchData();
    if (refreshInterval) { const interval = setInterval(fetchData, refreshInterval); return () => clearInterval(interval); }
  }, [refreshInterval]);

  if (loading) return <div>Loading AuditLog...</div>;
  return <div data-testid="auditlog-28">AuditLog Widget</div>;
}