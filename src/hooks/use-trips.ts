'use client';

import { useMemo } from 'react';
import { useApi } from './use-api';
import { useUser } from './use-user';
import type { Trip } from '@/lib/types';

// Returns all trips (used in TripsClient for full list)
export function useAllTrips(cadenceId: string | undefined) {
  const { user } = useUser();

  const { data, isLoading, error, refetch } = useApi<Trip[]>(
    user && cadenceId ? `/api/trips?cadenceId=${cadenceId}` : null,
    { refreshInterval: 10000 }
  );

  return { trips: data, isLoading, error, refetch };
}

// Returns only open trips sorted oldest-first (used in ActionDialog)
export function useTrips(cadenceId: string | undefined) {
  const { user } = useUser();

  const { data, isLoading, error, refetch } = useApi<Trip[]>(
    user && cadenceId ? `/api/trips?cadenceId=${cadenceId}` : null,
    { refreshInterval: 10000 }
  );

  const activeTrips = useMemo(() => {
    if (!data) return null;
    return data
      .filter(t => t.isClosed !== true)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [data]);

  return { trips: activeTrips, isLoading, error, refetch };
}

// Returns the latest trip regardless of status
export function useLatestTrip(cadenceId: string | undefined) {
  const { user } = useUser();

  const { data, isLoading, error } = useApi<Trip[]>(
    user && cadenceId ? `/api/trips?cadenceId=${cadenceId}` : null,
    { refreshInterval: 10000 }
  );

  const latestTrip = useMemo(() => {
    if (!data || data.length === 0) return null;
    return [...data].sort((a, b) => b.id.localeCompare(a.id))[0];
  }, [data]);

  return { latestTrip, isLoading, error };
}
