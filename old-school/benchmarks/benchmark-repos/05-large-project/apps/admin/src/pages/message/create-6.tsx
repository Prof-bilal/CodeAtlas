import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface PageProps6 { title?: string; }

export function MessageCreatePage6({ title }: PageProps6) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, unknown>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'message', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters as any);
      const response = await fetch('/api/admin/message?' + params.toString());
      if (!response.ok) throw new Error('Failed');
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/admin/message/' + id, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'message'] }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{title ?? 'Admin Message'}</h1>
      <div>Admin panel for Message management</div>
    </div>
  );
}