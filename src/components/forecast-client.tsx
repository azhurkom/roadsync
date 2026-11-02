'use client';

import * as React from 'react';
import {
  Flag,
  Clock,
  Navigation,
  Route,
  CalendarCheck,
  TrendingUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Gauge,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useApi } from '@/hooks/use-api';
import { useUser } from '@/hooks/use-user';
import type { Cadence } from '@/lib/types';

interface ForecastResponse {
  base: {
    city: string;
    lat: number;
    lon: number;
  };
  currentStatus: {
    locationName: string;
    city: string;
    lastActionType: string | null;
    lastActionTime: string | null;
    roadDistToBaseKm: number;
    driveHoursToBase: number;
    activeTrip: {
      id: string;
      description: string;
      targetUnloadAddress: string | null;
      targetUnloadCity: string | null;
      roadDistFromTargetToBaseKm: number | null;
      driveHoursFromTargetToBase: number | null;
    } | null;
    shiftInfo: {
      startTimeBerlin: string;
      elapsedHours: number;
      limit13hBerlin: string;
      limit15hBerlin: string;
      remainingTo15h: number;
      canReachBaseInCurrentShift: boolean;
    } | null;
  };
  fridayForecast: {
    fridayProbability: number;
    weekendBaseProbability: number;
    medianArrivalTime: string;
    typicalWindowStart: string;
    typicalWindowEnd: string;
    directEtaIfNow: string;
    avgSpeedKmh: number;
    totalTripsAnalyzed: number;
    totalWeeksAnalyzed: number;
    counts: {
      fridayBaseCount: number;
      fridayReithCount: number;
      saturdayBaseCount: number;
    };
  };
  nextTripPredictions: {
    pivotCity: string;
    totalCasesFromPivot: number;
    predictions: {
      loadCity: string;
      unloadCity: string;
      sampleLoadAddress: string;
      sampleUnloadAddress: string;
      sampleDescription: string;
      count: number;
      probability: number;
      leadsTowardBase: boolean;
    }[];
    topThuFriRoutes: {
      route: string;
      count: number;
      sampleDescription: string;
    }[];
  };
  recentFridays: {
    weekKey: string;
    fridayStartCity?: string;
    fridayStartTime?: string;
    fridayEndCity?: string;
    fridayEndTime?: string;
    fridayKm?: number;
    fridayDriveTime?: string;
    satEndCity?: string;
    satEndTime?: string;
    outcome: 'friday_base' | 'friday_reith' | 'saturday_base' | 'away';
  }[];
}

function formatHoursToHm(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} год ${String(m).padStart(2, '0')} хв`;
}

export default function ForecastClient({ cadence }: { cadence: Cadence }) {
  const { user } = useUser();
  const { data, isLoading, refetch } = useApi<ForecastResponse>(user ? '/api/forecast' : null);

  if (isLoading && !data) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Прогноз прибуття на базу</CardTitle>
          <CardDescription>Не вдалося завантажити дані для прогнозу.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { currentStatus, fridayForecast, nextTripPredictions, recentFridays } = data;
  const prob = fridayForecast.fridayProbability;
  const isHigh = prob >= 75;
  const isMedium = prob >= 50 && prob < 75;

  return (
    <div className="space-y-3 pb-20">
      {/* Header Card */}
      <Card>
        <CardHeader className="p-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Flag className="h-5 w-5 text-primary" />
                Прогноз на П&apos;ятницю (База {data.base.city})
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                На основі {fridayForecast.totalTripsAnalyzed} рейсів та {fridayForecast.totalWeeksAnalyzed} робочих тижнів з усієї бази даних
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} title="Оновити розрахунок">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">
          {/* Probability & Expected Arrival Window */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Ймовірність прибуття у П&apos;ятницю</span>
                <Badge variant={isHigh ? 'default' : isMedium ? 'secondary' : 'destructive'}>
                  {isHigh ? 'Висока' : isMedium ? 'Середня' : 'Ризик затримки'}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-primary">{prob}%</span>
                <span className="text-xs text-muted-foreground">
                  (до Сб ранку — {fridayForecast.weekendBaseProbability}%)
                </span>
              </div>
              <Progress value={prob} className="h-2" />
              <p className="text-[11px] text-muted-foreground">
                Історія {fridayForecast.totalWeeksAnalyzed} тижнів: {fridayForecast.counts.fridayBaseCount}× у Пт в Schweinfurt,{' '}
                {fridayForecast.counts.fridayReithCount}× у Пт в Reith (30 км), {fridayForecast.counts.saturdayBaseCount}× доїзд у Сб зранку.
              </p>
            </div>

            <div className="p-3 rounded-lg border bg-muted/30 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Очікуваний час фінішу на базі у Пт</span>
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {fridayForecast.typicalWindowStart} – {fridayForecast.typicalWindowEnd}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Медіанний час за історією: <span className="font-semibold text-foreground">{fridayForecast.medianArrivalTime}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t">
                <Gauge className="h-3.5 w-3.5" />
                <span>Ваша реальна середня швидкість по БД: {fridayForecast.avgSpeedKmh} км/год</span>
              </div>
            </div>
          </div>

          {/* Current Position & Distance to Base */}
          <div className="p-3 rounded-lg border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Поточна позиція: {currentStatus.locationName || currentStatus.city}</span>
              </div>
              <Badge variant="outline">~{currentStatus.roadDistToBaseKm} км до бази</Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              Час чистої їзди з поточної точки до бази {data.base.city}:{' '}
              <span className="font-medium text-foreground">{formatHoursToHm(currentStatus.driveHoursToBase)}</span>
            </p>

            {currentStatus.activeTrip && (
              <div className="mt-2 p-2.5 rounded-md bg-primary/5 border border-primary/20 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-primary">Активний рейс: {currentStatus.activeTrip.id}</span>
                  {currentStatus.activeTrip.roadDistFromTargetToBaseKm !== null && (
                    <span className="font-medium">
                      З точки розвантаження до бази: ~{currentStatus.activeTrip.roadDistFromTargetToBaseKm} км
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground truncate">{currentStatus.activeTrip.description}</p>
                {currentStatus.activeTrip.targetUnloadAddress && (
                  <p className="text-[11px] text-muted-foreground">
                    Ціль розвантаження: {currentStatus.activeTrip.targetUnloadAddress}
                    {currentStatus.activeTrip.driveHoursFromTargetToBase !== null &&
                      ` (~${formatHoursToHm(currentStatus.activeTrip.driveHoursFromTargetToBase)} їзди до Schweinfurt)`}
                  </p>
                )}
              </div>
            )}

            {currentStatus.shiftInfo && (
              <div className="mt-2 pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  {currentStatus.shiftInfo.canReachBaseInCurrentShift ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span>
                    Поточна зміна з <b>{currentStatus.shiftInfo.startTimeBerlin}</b> (ліміт 13г о{' '}
                    <b>{currentStatus.shiftInfo.limit13hBerlin}</b> / 15г о <b>{currentStatus.shiftInfo.limit15hBerlin}</b>)
                  </span>
                </div>
                <Badge variant={currentStatus.shiftInfo.canReachBaseInCurrentShift ? 'secondary' : 'destructive'}>
                  {currentStatus.shiftInfo.canReachBaseInCurrentShift
                    ? `Встигаєте на базу в цю зміну (ETA ~${fridayForecast.directEtaIfNow})`
                    : `Залишок зміни: ${currentStatus.shiftInfo.remainingTo15h} год`}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Predicted Next Trips Card */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Прогноз наступного рейсу з точки «{nextTripPredictions.pivotCity}»
          </CardTitle>
          <CardDescription className="text-xs">
            Ймовірні напрямки після завершення поточної дії за історією ваших маршрутів
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          {nextTripPredictions.predictions.length > 0 ? (
            <div className="space-y-2">
              {nextTripPredictions.predictions.map((pred, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border bg-muted/30 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{pred.loadCity}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-primary">{pred.unloadCity}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{pred.sampleDescription}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Розвантаження: {pred.sampleUnloadAddress}
                    </p>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <Badge variant={pred.leadsTowardBase ? 'default' : 'secondary'}>{pred.probability}%</Badge>
                    <span className="text-[11px] text-muted-foreground">{pred.count} раз(ів) у БД</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">
              Для точки «{nextTripPredictions.pivotCity}» ще мало прямих переходів. Нижче наведено найчастіші рейси четверга–п&apos;ятниці:
            </p>
          )}

          {nextTripPredictions.topThuFriRoutes.length > 0 && (
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Найчастіші маршрути Четверга / П&apos;ятниці за всю історію:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {nextTripPredictions.topThuFriRoutes.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
                    <span className="font-medium truncate pr-2">{r.route}</span>
                    <Badge variant="outline" className="shrink-0">
                      {r.count}×
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historical Fridays Log */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            Історія фінішів у П&apos;ятницю (останні 10 тижнів)
          </CardTitle>
          <CardDescription className="text-xs">
            О котрій годині та де реально завершувалась зміна наприкінці робочого тижня
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="space-y-2">
            {recentFridays.map((w) => {
              const badgeLabel =
                w.outcome === 'friday_base'
                  ? 'База у Пт'
                  : w.outcome === 'friday_reith'
                  ? 'Reith (30 км)'
                  : w.outcome === 'saturday_base'
                  ? `Доїзд у Сб (${w.satEndTime || ''})`
                  : 'Виїзд';
              const badgeVariant =
                w.outcome === 'friday_base'
                  ? 'default'
                  : w.outcome === 'friday_reith' || w.outcome === 'saturday_base'
                  ? 'secondary'
                  : 'outline';

              return (
                <div
                  key={w.weekKey}
                  className="flex items-center justify-between p-2 rounded-md border bg-muted/20 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold">
                      Пт {w.weekKey}: {w.fridayStartCity || '—'} → {w.fridayEndCity || w.satEndCity || '—'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Старт: {w.fridayStartTime || '—'} • Фініш Пт: <b>{w.fridayEndTime || '—'}</b>
                      {w.fridayKm !== undefined ? ` • ${w.fridayKm} км` : ''}
                      {w.fridayDriveTime ? ` • кермо ${w.fridayDriveTime}` : ''}
                    </div>
                  </div>
                  <Badge variant={badgeVariant} className="shrink-0">
                    {badgeLabel}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
