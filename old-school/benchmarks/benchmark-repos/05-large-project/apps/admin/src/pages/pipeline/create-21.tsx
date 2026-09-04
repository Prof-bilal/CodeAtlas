import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface PageProps21 { title?: string; }

export function PipelineCreatePage21({ title }: PageProps21) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, unknown>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'pipeline', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters as any);
      const response = await fetch('/api/admin/pipeline?' + params.toString());
      if (!response.ok) throw new Error('Failed');
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/admin/pipeline/' + id, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'pipeline'] }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{title ?? 'Admin Pipeline'}</h1>
      <div>Admin panel for Pipeline management</div>
    </div>
  );
}