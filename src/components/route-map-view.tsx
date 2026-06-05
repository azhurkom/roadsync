'use client';

import * as React from 'react';
import type { ActionLog, Trip } from '@/lib/types';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

interface TripsWithPoints {
  byTrip: { trip: Trip; points: ActionLog[] }[];
  untagged: ActionLog[];
}

interface RouteMapViewProps {
  routePoints: ActionLog[];
  tripsWithPoints: TripsWithPoints;
  actionLabels: Record<string, string>;
  actionColors: Record<string, string>;
}

export default function RouteMapView({ routePoints, tripsWithPoints, actionLabels, actionColors }: RouteMapViewProps) {
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      const L = await import('leaflet');
      
      // Fix Leaflet icon paths (webpack/vite issue)
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Calculate bounds to fit all points
      const bounds = L.latLngBounds(
        routePoints.map(p => [p.locationLatitude, p.locationLongitude] as [number, number])
      );

      const map = L.map(mapContainerRef.current!, {
        zoomControl: true,
        attributionControl: true,
      }).fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Custom icon factory
      const createIcon = (color: string) => L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width: 16px; height: 16px; 
          background: ${color}; 
          border: 2px solid white; 
          border-radius: 50%; 
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          transition: transform 0.15s;
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10],
      });

      const getColor = (type: string) => actionColors[type] || '#6b7280';

      // Draw polylines per trip, then a line for untagged
      const allLines: [number, number][][] = [];

      for (const { trip, points } of tripsWithPoints.byTrip) {
        if (points.length < 2) continue;
        const coords = points.map(p => [p.locationLatitude, p.locationLongitude] as [number, number]);
        allLines.push(coords);

        const polyline = L.polyline(coords, {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.7,
          dashArray: trip.isClosed ? undefined : '8, 6',
        });
        polyline.bindPopup(`<strong>Рейс: ${trip.referenceNumber || trip.description}</strong><br/>${trip.isClosed ? '✅ Завершено' : '🔄 Активний'}`);
        polyline.addTo(map);
      }

      // Untagged points line
      if (tripsWithPoints.untagged.length >= 2) {
        const coords = tripsWithPoints.untagged.map(p => [p.locationLatitude, p.locationLongitude] as [number, number]);
        allLines.push(coords);
        L.polyline(coords, {
          color: '#6b7280',
          weight: 2,
          opacity: 0.4,
          dashArray: '4, 4',
        }).addTo(map);
      }

      // Add markers
      const addMarker = (point: ActionLog) => {
        const color = getColor(point.actionType);
        const marker = L.marker([point.locationLatitude, point.locationLongitude], {
          icon: createIcon(color),
        });

        const formattedDate = format(new Date(point.timestamp), 'dd.MM.yyyy HH:mm', { locale: uk });
        const label = actionLabels[point.actionType] || point.actionType;
        
        marker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; line-height: 1.5; min-width: 200px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;"></span>
              ${label}
            </div>
            <div style="font-size: 13px; color: #555; margin-bottom: 2px;">
              📍 ${point.locationName || 'Невідома адреса'}
            </div>
            <div style="font-size: 12px; color: #888;">
              📅 ${formattedDate}
              ${point.odometer ? ` · 🚛 ${Math.round(point.odometer).toLocaleString('uk')} км` : ''}
            </div>
            ${point.notes ? `<div style="font-size: 12px; color: #666; margin-top: 4px; border-top: 1px solid #eee; padding-top: 4px;">📝 ${point.notes}</div>` : ''}
          </div>
        `, { minWidth: 200, maxWidth: 300 });

        marker.addTo(map);
      };

      routePoints.forEach(addMarker);

      // Add start and end labels for first and last point
      const first = routePoints[0];
      const last = routePoints[routePoints.length - 1];
      
      const startIcon = L.divIcon({
        className: 'route-start-end',
        html: '<div style="background:#22c55e;color:white;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);white-space:nowrap;">СТАРТ</div>',
        iconSize: [0, 0],
        iconAnchor: [24, 12],
      });
      L.marker([first.locationLatitude, first.locationLongitude], { icon: startIcon, zIndexOffset: 1000 }).addTo(map);

      if (first !== last) {
        const endIcon = L.divIcon({
          className: 'route-start-end',
          html: '<div style="background:#ef4444;color:white;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);white-space:nowrap;">ФІНІШ</div>',
          iconSize: [0, 0],
          iconAnchor: [24, 12],
        });
        L.marker([last.locationLatitude, last.locationLongitude], { icon: endIcon, zIndexOffset: 1000 }).addTo(map);
      }

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [routePoints, tripsWithPoints, actionLabels, actionColors]);

  // Stats
  const totalKm = React.useMemo(() => {
    if (routePoints.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < routePoints.length; i++) {
      const prev = routePoints[i - 1];
      const curr = routePoints[i];
      if (prev.odometer != null && curr.odometer != null) {
        const diff = curr.odometer - prev.odometer;
        if (diff > 0 && diff < 5000) total += diff;
      }
    }
    return total;
  }, [routePoints]);

  const loadingPoints = routePoints.filter(p => p.actionType === 'loading').length;
  const unloadingPoints = routePoints.filter(p => p.actionType === 'unloading').length;
  const statsPoints = routePoints.length;

  return (
    <div className="space-y-2">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2 text-center border border-blue-200 dark:border-blue-800">
          <div className="font-bold text-blue-600 dark:text-blue-400 text-lg">{statsPoints}</div>
          <div className="text-muted-foreground">Точок на маршруті</div>
        </div>
        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2 text-center border border-green-200 dark:border-green-800">
          <div className="font-bold text-green-600 dark:text-green-400 text-lg">{totalKm.toLocaleString('uk')}</div>
          <div className="text-muted-foreground">Пробіг, км</div>
        </div>
        <div className="flex flex-col gap-0.5 px-2 justify-center">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shrink-0" />
            <span className="text-muted-foreground">Завант.: {loadingPoints}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block shrink-0" />
            <span className="text-muted-foreground">Розвант.: {unloadingPoints}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block shrink-0" />
            <span className="text-muted-foreground">Інше: {statsPoints - loadingPoints - unloadingPoints}</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div 
        ref={mapContainerRef} 
        className="w-full h-[450px] sm:h-[550px] rounded-lg border overflow-hidden z-0"
        style={{ position: 'relative' }}
      />

      {/* Legend */}
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 px-1">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-blue-500 inline-block" /> — Маршрут рейсу
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-gray-400 inline-block" style={{borderTop: '2px dashed #9ca3af', height: 0}} /> — Інші точки
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> — Завантаження
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> — Розвантаження
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" /> — Інше
        </span>
      </div>
    </div>
  );
}
