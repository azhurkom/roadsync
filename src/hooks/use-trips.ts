'use client';

import { useMemo } from 'react';
import { useApi } from './use-api';
import { useUser } from './use-user';
import { useTabVisibility, useNetworkStatus } from './use-smart-polling';
import type { Trip } from '@/lib/types';

// Returns all trips (used in TripsClient for full list)
export function useAllTrips(cadenceId: string | undefined) {
  const { user } = useUser();
  const isVisible = useTabVisibility();
  const isOnline = useNetworkStatus();

  const refreshInterval = useMemo(() => {
    if (!isVisible || !isOnline) return 0;
    return 20000; // 20 seconds for trips list
  }, [isVisible, isOnline]);

  const { data, isLoading, error, refetch, invalidateCache } = useApi<Trip[]>(
    user && cadenceId ? `/api/trips?cadenceId=${cadenceId}` : null,
    { 
      refreshInterval,
      cacheKey: `trips-${cadenceId}`,
      staleTime: 45000,
      retryCount: 2
    }
  );

  return { trips: data, isLoading, error, refetch, invalidateCache };
}

// Returns only open trips sorted oldest-first (used in ActionDialog)
export function useTrips(cadenceId: string | undefined) {
  const { user } = useUser();
  const isVisible = useTabVisibility();
  const isOnline = useNetworkStatus();

  const refreshInterval = useMemo(() => {
    if (!isVisible || !isOnline) return 0;
    return 12000; // 12 seconds for active trips (more frequent)
  }, [isVisible, isOnline]);

  const { data, isLoading, error, refetch, invalidateCache } = useApi<Trip[]>(
    user && cadenceId ? `/api/trips?cadenceId=${cadenceId}&closed=false` : null,
    { 
      refreshInterval,
      cacheKey: `active-trips-${cadenceId}`,
      staleTime: 20000, // Shorter stale time for active trips
      retryCount: 3,
      retryDelay: 500
    }
  );

  const activeTrips = useMemo(() => {
    if (!data) return null;
    return data
      .filter(t => t.isClosed !== true)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [data]);

  return { trips: activeTrips, isLoading, error, refetch, invalidateCache };
}

// Returns the latest trip regardless of status
export function useLatestTrip(cadenceId: string | undefined) {
  const { user } = useUser();
  const isVisible = useTabVisibility();
  const isOnline = useNetworkStatus();

  const refreshInterval = useMemo(() => {
    if (!isVisible || !isOnline) return 0;
    return 15000; // 15 seconds for latest trip
  }, [isVisible, isOnline]);

  const { data, isLoading, error } = useApi<Trip[]>(
    user && cadenceId ? `/api/trips?cadenceId=${cadenceId}` : null,
    { 
      refreshInterval,
      cacheKey: `latest-trip-${cadenceId}`,
      staleTime: 30000,
      retryCount: 2
    }
  );

  const latestTrip = useMemo(() => {
    if (!data || data.length === 0) return null;
    return [...data].sort((a, b) => b.id.localeCompare(a.id))[0];
  }, [data]);

  return { latestTrip, isLoading, error };
}
