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
  MapPin,
  Download,
  Upload,
  Coffee,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useApi } from '@/hooks/use-api';
import { useUser } from '@/hooks/use-user';
import type { Cadence } from '@/lib/types';

interface TimelineStep {
  stepNumber: number;
  tripId: string;
  type: 'load' | 'unload' | 'return-base' | 'tachograph-break';
  label: string;
  address: string;
  city: string;
  roadKm: number;
  driveHours: number;
  workHours: number;
  arrivalTimeBerlin: string;
  departureTimeBerlin: string;
  arrivalTimestampMs: number;
  departureTimestampMs: number;
  exceeds13hLimit: boolean;
  exceeds15hLimit: boolean;
  exceedsDriveLimit: boolean;
}

interface QueuedTrip {
  queuePosition: number;
  id: string;
  description: string;
  loadAddresses: string[];
  unloadAddresses: string[];
  targetUnloadAddress: string | null;
  targetUnloadCity: string | null;
  roadDistFromTargetToBaseKm: number | null;
}

interface ForecastResponse {
  base: {
    city: string;
    lat: number;
    lon: number;
  };
  currentStatus: {
    isLiveGps: boolean;
    locationName: string;
    city: string;
    lastLoggedLocationName: string | null;
    lastActionType: string | null;
    lastActionTime: string | null;
    roadDistToBaseKm: number;
    driveHoursToBase: number;
    openTripsQueue: QueuedTrip[];
    timelineSteps: TimelineStep[];
    totalRemainingRoadKm: number;
    finalArrivalAtBaseBerlin: string;
    shiftInfo: {
      startTimeBerlin: string;
      elapsedHours: number;
      limit13hBerlin: string;
      limit15hBerlin: string;
      remainingTo13h: number;
      remainingTo15h: number;
      alreadyDrivenKm: number;
      totalPlannedDriveHours: number;
      canCompleteAllAndReachBaseBefore15h: boolean;
      canCompleteAllAndReachBaseBefore13h: boolean;
      canFinishQueuedUnloadsBefore15h: boolean;
      lastUnloadDepartureBerlin: string | null;
      lastUnloadCity: string | null;
    } | null;
  };
  fridayForecast: {
    fridayProbability: number;
    weekendBaseProbability: number;
    medianArrivalTime: string;
    maxShiftEndTimeBerlin: string;
    normalShiftEndTimeBerlin: string;
    calculatedBaseEtaBerlin: string;
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
  const [gpsCoords, setGpsCoords] = React.useState<{ lat: number; lon: number } | null>(null);
  const [gpsLoading, setGpsLoading] = React.useState(false);

  const requestLiveGps = React.useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  React.useEffect(() => {
    requestLiveGps();
  }, [requestLiveGps]);

  const apiUrl = React.useMemo(() => {
    if (!user) return null;
    if (gpsCoords) {
      return `/api/forecast?lat=${gpsCoords.lat.toFixed(5)}&lon=${gpsCoords.lon.toFixed(5)}`;
    }
    return '/api/forecast';
  }, [user, gpsCoords]);

  const { data, isLoading, refetch } = useApi<ForecastResponse>(apiUrl);

  const handleRefresh = () => {
    requestLiveGps();
    refetch();
  };

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
  const shiftInfo = currentStatus.shiftInfo;

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
                На основі {fridayForecast.totalTripsAnalyzed} рейсів, поточної черги завдань та ліміту зміни (1 год на завант./розвант.)
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={gpsLoading}
              title="Оновити GPS та розрахунок"
            >
              <RefreshCw className={`h-4 w-4 ${gpsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">
          {/* Probability & Expected Arrival Window */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Ймовірність фінішу на базі у П&apos;ятницю</span>
                <Badge variant={isHigh ? 'default' : isMedium ? 'secondary' : 'destructive'}>
                  {isHigh ? 'Висока' : isMedium ? 'Середня' : 'Не встигаєте до кінця зміни'}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-primary">{prob}%</span>
                <span className="text-xs text-muted-foreground">
                  (з доїздом у Сб зранку — {fridayForecast.weekendBaseProbability}%)
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
                <span className="text-xs font-medium text-muted-foreground">
                  Розрахунок часу фінішу vs Ліміт зміни
                </span>
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Розрахунковий ETA на базі:</div>
                    <div
                      className={`text-2xl font-bold ${
                        shiftInfo && !shiftInfo.canCompleteAllAndReachBaseBefore15h ? 'text-destructive' : 'text-foreground'
                      }`}
                    >
                      ~{fridayForecast.calculatedBaseEtaBerlin}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Макс. кінець зміни (15г):</div>
                    <div className="text-2xl font-bold text-primary">{fridayForecast.maxShiftEndTimeBerlin}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  13-годинна зміна до: <span className="font-semibold text-foreground">{fridayForecast.normalShiftEndTimeBerlin}</span>
                  {' • '}Історична медіана Пт: <span className="font-semibold text-foreground">{fridayForecast.medianArrivalTime}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t">
                <Gauge className="h-3.5 w-3.5" />
                <span>Середня швидкість по БД: {fridayForecast.avgSpeedKmh} км/год • На рампі: 1 год</span>
              </div>
            </div>
          </div>

          {/* Current Position & Active Trips Queue */}
          <div className="p-3 rounded-lg border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  Поточна позиція: {currentStatus.locationName || currentStatus.city}
                </span>
                <Badge variant={currentStatus.isLiveGps ? 'default' : 'secondary'} className="text-[10px] h-5">
                  {currentStatus.isLiveGps
                    ? 'GPS наживо'
                    : `За записом о ${currentStatus.lastActionTime || '—'}`}
                </Badge>
              </div>
              <Badge variant="outline">~{currentStatus.roadDistToBaseKm} км прямо до бази</Badge>
            </div>

            {!currentStatus.isLiveGps && currentStatus.lastLoggedLocationName && (
              <p className="text-[11px] text-muted-foreground">
                Координати взято з останньої дії в БД ({currentStatus.lastLoggedLocationName}). Натисніть ↻ зверху та дозвольте доступ до геолокації для точної живої позиції.
              </p>
            )}

            {/* Open Trips Queue */}
            {currentStatus.openTripsQueue.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">
                  Відкриті рейси у черзі ({currentStatus.openTripsQueue.length}):
                </div>
                {currentStatus.openTripsQueue.map((t, idx) => (
                  <div
                    key={t.id}
                    className={`p-2.5 rounded-md border space-y-1 ${
                      idx === 0 ? 'bg-primary/5 border-primary/30' : 'bg-muted/20 border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={idx === 0 ? 'default' : 'outline'} className="text-[10px] h-5">
                          {idx === 0 ? 'Виконується зараз (#1)' : `Наступний у черзі (#${idx + 1})`}
                        </Badge>
                        <span className="font-bold">{t.id}</span>
                      </div>
                      {t.roadDistFromTargetToBaseKm !== null && (
                        <span className="text-[11px] text-muted-foreground">
                          З точки розвант. до бази: ~{t.roadDistFromTargetToBaseKm} км
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-foreground">{t.description}</p>
                    <div className="text-[11px] text-muted-foreground flex flex-col gap-0.5">
                      {t.loadAddresses.length > 0 && (
                        <span>Завантаження: {t.loadAddresses.join(' → ')}</span>
                      )}
                      {t.unloadAddresses.length > 0 && (
                        <span>Розвантаження: {t.unloadAddresses.join(' → ')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Step-by-Step Timeline */}
            {currentStatus.timelineSteps.length > 0 && (
              <div className="pt-2 border-t space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    Покроковий графік маршруту до бази (залишилось ~{currentStatus.totalRemainingRoadKm} км):
                  </span>
                  {shiftInfo && (
                    <span className="text-muted-foreground">
                      Всього керма за зміну: <b>{formatHoursToHm(shiftInfo.totalPlannedDriveHours)}</b>
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {currentStatus.timelineSteps.map((step) => {
                    const StepIcon =
                      step.type === 'load'
                        ? Download
                        : step.type === 'unload'
                        ? Upload
                        : step.type === 'tachograph-break'
                        ? Coffee
                        : Flag;

                    return (
                      <div
                        key={step.stepNumber}
                        className={`flex items-center justify-between p-2 rounded-md border text-xs gap-2 ${
                          step.exceeds15hLimit
                            ? 'border-destructive/50 bg-destructive/5'
                            : step.exceeds13hLimit
                            ? 'border-amber-500/40 bg-amber-500/5'
                            : 'bg-muted/20'
                        }`}
                      >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <StepIcon className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold truncate">{step.label}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{step.address}</div>
                            {step.roadKm > 0 && (
                              <div className="text-[11px] text-muted-foreground">
                                Переїзд: ~{step.roadKm} км ({formatHoursToHm(step.driveHours)})
                                {step.workHours > 0 ? ` + ${step.workHours} год на рампі` : ''}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-bold">
                            {step.type === 'return-base'
                              ? `о ${step.arrivalTimeBerlin}`
                              : `${step.arrivalTimeBerlin} – ${step.departureTimeBerlin}`}
                          </div>
                          {step.exceeds15hLimit ? (
                            <span className="text-[10px] text-destructive font-semibold">
                              Поза лімітом {shiftInfo?.limit15hBerlin}!
                            </span>
                          ) : step.exceeds13hLimit ? (
                            <span className="text-[10px] text-amber-500 font-semibold">
                              У межах 15г зміни
                            </span>
                          ) : (
                            <span className="text-[10px] text-green-600 dark:text-green-400">Встигаєте</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Shift Verdict Banner */}
            {shiftInfo && (
              <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  {shiftInfo.canCompleteAllAndReachBaseBefore15h ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <span>
                    Зміна з <b>{shiftInfo.startTimeBerlin}</b> (13г о <b>{shiftInfo.limit13hBerlin}</b> / макс. 15г о{' '}
                    <b>{shiftInfo.limit15hBerlin}</b>)
                  </span>
                </div>
                <Badge
                  variant={shiftInfo.canCompleteAllAndReachBaseBefore15h ? 'secondary' : 'destructive'}
                >
                  {shiftInfo.canCompleteAllAndReachBaseBefore15h
                    ? `Встигаєте на базу до ${shiftInfo.limit15hBerlin} (ETA ~${fridayForecast.calculatedBaseEtaBerlin})`
                    : shiftInfo.canFinishQueuedUnloadsBefore15h && shiftInfo.lastUnloadCity
                    ? `Фініш розвантаження в ${shiftInfo.lastUnloadCity} о ~${shiftInfo.lastUnloadDepartureBerlin} (на базу в Сб)`
                    : `Перевищення ліміту зміни ${shiftInfo.limit15hBerlin}`}
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
            Прогноз наступного рейсу після «{nextTripPredictions.pivotCity}»
          </CardTitle>
          <CardDescription className="text-xs">
            Ймовірні напрямки після виконання поточної черги рейсів за історією ваших маршрутів
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
