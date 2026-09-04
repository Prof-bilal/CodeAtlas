import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface PageProps18 { title?: string; }

export function BacklogListPage18({ title }: PageProps18) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, unknown>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'backlog', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters as any);
      const response = await fetch('/api/admin/backlog?' + params.toString());
      if (!response.ok) throw new Error('Failed');
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/admin/backlog/' + id, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'backlog'] }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{title ?? 'Admin Backlog'}</h1>
      <div>Admin panel for Backlog management</div>
    </div>
  );
}