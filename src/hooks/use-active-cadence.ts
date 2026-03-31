'use client';

import { useMemo } from 'react';
import { useApi } from './use-api';
import { useUser } from './use-user';
import { useTabVisibility, useNetworkStatus } from './use-smart-polling';
import type { Cadence } from '@/lib/types';

export function useActiveCadence() {
  const { user, isUserLoading } = useUser();
  const isVisible = useTabVisibility();
  const isOnline = useNetworkStatus();

  // Adaptive polling based on tab visibility and network status
  const refreshInterval = useMemo(() => {
    if (!isOnline) return 0;
    return isVisible ? 15000 : 60000;
  }, [isVisible, isOnline]);

  const { data, isLoading, error, refetch, invalidateCache } = useApi<Cadence[]>(
    user ? '/api/cadences?active=true' : null,
    { 
      refreshInterval,
      cacheKey: 'active-cadence',
      staleTime: 30000, // 30 seconds
      retryCount: 2,
      retryDelay: 1000
    }
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
    invalidateCache,
  };
}
