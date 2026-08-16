import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface PageProps30 { title?: string; }

export function ActivityEditPage30({ title }: PageProps30) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, unknown>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'activity', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters as any);
      const response = await fetch('/api/admin/activity?' + params.toString());
      if (!response.ok) throw new Error('Failed');
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/admin/activity/' + id, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'activity'] }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{title ?? 'Admin Activity'}</h1>
      <div>Admin panel for Activity management</div>
    </div>
  );
}