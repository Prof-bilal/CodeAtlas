import React, { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

interface PageProps0 { title?: string; description?: string; }

export function PipelineDashboardPage0({ title, description }: PageProps0) {
  const navigate = useNavigate();
  const params = useParams();
  const [isProcessing, setIsProcessing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['pipeline', params.id],
    queryFn: async () => {
      const response = await fetch('/api/v1/pipeline/' + (params.id ?? ''));
      if (!response.ok) throw new Error('Failed');
      return response.json();
    },
    staleTime: 30000,
    retry: 3,
  });

  const handleAction = useCallback(async (action: string) => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/v1/pipeline/' + action, { method: 'POST' });
      if (!response.ok) throw new Error('Failed');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {(error as Error).message}</div>;

  return (
    <div className="dashboard-page">
      <header><h1>{title ?? 'Pipeline Dashboard'}</h1>{description && <p>{description}</p>}</header>
      <main>{data ? <div>Data loaded</div> : <div>No data</div>}</main>
    </div>
  );
}

export default PipelineDashboardPage0;