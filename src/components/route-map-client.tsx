'use client';

import * as React from 'react';
import { useApi } from '@/hooks/use-api';
import { useUser } from '@/hooks/use-user';
import type { ActionLog, Trip } from '@/lib/types';
import { Loader2, MapIcon, Navigation, AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

// ─── Map component (dynamically imported to avoid SSR issues with Leaflet) ───
const RouteMapView = dynamic(() => import('@/components/route-map-view'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full min-h-[400px] bg-muted/30 rounded-lg">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Завантаження мапи...</span>
      </div>
    </div>
  ),
});

const ACTION_LABELS: Record<string, string> = {
  'loading': 'Завантаження',
  'unloading': 'Розвантаження',
  'start-shift': 'Початок зміни',
  'end-shift': 'Кінець зміни',
  'trailer-change': 'Зміна причепа',
  'vehicle-change': 'Зміна тягача',
};

const ACTION_COLORS: Record<string, string> = {
  'loading': '#3b82f6',
  'unloading': '#22c55e',
};

interface RouteMapClientProps {
  cadenceId: string;
}

export default function RouteMapClient({ cadenceId }: RouteMapClientProps) {
  const { user } = useUser();
  const { data: actionLogs, isLoading: logsLoading } = useApi<ActionLog[]>(
    user ? `/api/action-logs?cadenceId=${cadenceId}&limit=500` : null,
  );
  const { data: trips, isLoading: tripsLoading } = useApi<Trip[]>(
    user ? `/api/trips?cadenceId=${cadenceId}` : null,
  );

  const isLoading = logsLoading || tripsLoading;

  // Filter logs that have valid coordinates, sort chronologically
  const routePoints = React.useMemo(() => {
    if (!actionLogs) return [];
    return actionLogs
      .filter(log => 
        typeof log.locationLatitude === 'number' && 
        typeof log.locationLongitude === 'number' &&
        (log.locationLatitude !== 0 || log.locationLongitude !== 0)
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [actionLogs]);

  // Trip lookup map
  const tripMap = React.useMemo(() => {
    const map = new Map<string, Trip>();
    trips?.forEach(t => map.set(t.id, t));
    return map;
  }, [trips]);

  // Group points by trip
  const tripsWithPoints = React.useMemo(() => {
    if (!trips || !routePoints.length) return { byTrip: [], untagged: [] };

    // Points without a tripId
    const untagged = routePoints.filter(p => !p.tripId);
    // Points with a tripId
    const byTrip: { trip: Trip; points: ActionLog[] }[] = [];

    const processedTripIds = new Set<string>();
    for (const point of routePoints) {
      if (!point.tripId) continue;
      const trip = tripMap.get(point.tripId);
      if (!trip) continue;
      if (!processedTripIds.has(point.tripId)) {
        processedTripIds.add(point.tripId);
        byTrip.push({ trip, points: [] });
      }
      const bucket = byTrip.find(b => b.trip.id === point.tripId)!;
      bucket.points.push(point);
    }

    return { byTrip, untagged };
  }, [routePoints, trips, tripMap]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Завантаження даних...</span>
        </div>
      </div>
    );
  }

  if (!routePoints.length) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] bg-muted/20 rounded-lg">
        <div className="flex flex-col items-center gap-3 text-muted-foreground text-center px-6">
          <MapIcon className="h-12 w-12 opacity-40" />
          <span className="text-sm">Немає точок з координатами для відображення на мапі.</span>
          <span className="text-xs opacity-60">Додайте дії з геолокацією, щоб побачити маршрут.</span>
        </div>
      </div>
    );
  }

  return (
    <RouteMapView 
      routePoints={routePoints}
      tripsWithPoints={tripsWithPoints}
      actionLabels={ACTION_LABELS}
      actionColors={ACTION_COLORS}
    />
  );
}
