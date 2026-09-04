import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface PageProps8 { title?: string; }

export function ReleaseDetailPage8({ title }: PageProps8) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, unknown>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'release', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters as any);
      const response = await fetch('/api/admin/release?' + params.toString());
      if (!response.ok) throw new Error('Failed');
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/admin/release/' + id, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'release'] }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{title ?? 'Admin Release'}</h1>
      <div>Admin panel for Release management</div>
    </div>
  );
}