'use client';

import { useMemo } from 'react';
import { useApi } from './use-api';
import { useUser } from './use-user';
import type { Cadence } from '@/lib/types';

export function useActiveCadence() {
  const { user, isUserLoading } = useUser();

  const { data, isLoading, error, refetch } = useApi<Cadence[]>(
    user ? '/api/cadences?active=true' : null
  );

  const activeCadence = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data[0];
  }, [data]);

  return {
    activeCadence,
    isLoading: isUserLoading || isLoading,
    error,
    refetch,
  };
}
