'use client';

import * as React from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import type { Cadence, CarouselItemData } from '@/lib/types';
import { Clock, Truck, BedDouble, Loader2, AlarmClock } from 'lucide-react';
import { TrailerIcon } from '@/components/icons';
import { useShiftStatus } from '@/hooks/use-shift-status';
import { cn } from '@/lib/utils';


interface DashboardCarouselProps {
    cadence: Cadence;
}

export default function DashboardCarousel({ cadence }: DashboardCarouselProps) {
    const { isActive: isShiftActive, startTime: activeShiftStartTime, lastShiftEndTime, shortRestCount, isLoading: isShiftStatusLoading } = useShiftStatus(cadence?.id);
    const [duration, setDuration] = React.useState('00:00:00');
    const [api, setApi] = React.useState<CarouselApi>()
    
    React.useEffect(() => {
        const timerStartTime = isShiftActive ? activeShiftStartTime : lastShiftEndTime;

        if (timerStartTime) {
            const updateTimer = () => {
                const now = new Date();
                const diff = now.getTime() - timerStartTime.getTime();

                if (diff < 0) {
                    setDuration('00:00:00');
                    return;
                }

                const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, '0');
                const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
                const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, '0');
                
                setDuration(`${hours}:${minutes}:${seconds}`);
            };

            updateTimer();
            const intervalId = setInterval(updateTimer, 1000);
            return () => clearInterval(intervalId);
        } else {
            setDuration('00:00:00');
        }
    }, [isShiftActive, activeShiftStartTime, lastShiftEndTime]);
    
    let shiftOrRestItem: CarouselItemData & { iconClassName?: string; icon: any };

    if (isShiftStatusLoading && !activeShiftStartTime && !lastShiftEndTime) {
        shiftOrRestItem = {
            id: 'duration-loading',
            icon: Loader2,
            iconClassName: 'animate-spin',
            title: 'Завантаження...',
            value: '00:00:00',
            description: 'Очікуйте...',
        }
    } else if (isShiftActive) {
      shiftOrRestItem = {
          id: 'shift-duration',
          icon: Clock,
          title: 'Тривалість зміни',
          value: duration,
          description: activeShiftStartTime ? `Початок: ${activeShiftStartTime.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : 'Зміна не розпочата',
        }
    } else {
      shiftOrRestItem = {
          id: 'rest-duration',
          icon: BedDouble,
          title: 'Тривалість відпочинку',
          value: duration,
          description: lastShiftEndTime ? `Кінець останньої зміни: ${lastShiftEndTime.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : 'Зміна ще не починалась',
      };
    }

    const carouselItems = [
      shiftOrRestItem,
      {
        id: 'vehicle',
        icon: Truck,
        title: 'Транспортний засіб',
        value: cadence.vehicleNumber,
        description: cadence.firmName,
      },
      {
        id: 'trailer',
        icon: TrailerIcon,
        title: 'Причіп',
        value: cadence.trailerNumber,
        description: 'Поточний причіп',
      },
    ];

    // Хелпер для додавання годин до дати
    const addHours = (date: Date, hours: number): string => {
      const result = new Date(date.getTime() + hours * 60 * 60 * 1000);
      return result.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    };

    const remaining = 3 - shortRestCount;
    const timeLimitSlide = {
      id: 'time-limits',
      icon: AlarmClock,
      isCustom: true,
      isShiftActive,
      activeShiftStartTime,
      lastShiftEndTime,
      remaining,
      addHours,
    };
    carouselItems.push(timeLimitSlide as any);
    
    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
      // Stop the event from bubbling up to the parent carousel in page.tsx
      e.stopPropagation();

      // Check if the click target or any of its parents is an interactive element.
      if ((e.target as HTMLElement).closest('a, button, input, select, textarea, [role="button"]')) {
          return; // Don't do anything if it's an interactive element.
      }
      
      if (!api) return;

      const { clientX } = e;
      const { left, width } = e.currentTarget.getBoundingClientRect();
      const clickPositionX = clientX - left;

      if (clickPositionX > width / 2) {
        api.scrollNext();
      } else {
        api.scrollPrev();
      }
    }

  return (
    <div onClick={handleContainerClick}>
      <Carousel 
        setApi={setApi}
        opts={{ 
            loop: true
        }} 
        className="w-full"
      >
        <CarouselContent>
          {carouselItems.map((item: any) => {
            if (item.isCustom) {
              const timeRef = item.isShiftActive ? item.activeShiftStartTime : item.lastShiftEndTime;
              const title = item.isShiftActive
                ? \`Зміна закінчується (\${item.remaining} з 3)\`
                : \`Початок зміни (\${item.remaining} з 3)\`;
              const t1label = item.isShiftActive ? 'через 13 год:' : 'через 9 год:';
              const t2label = item.isShiftActive ? 'через 15 год:' : 'через 11 год:';
              const t1hours = item.isShiftActive ? 13 : 9;
              const t2hours = item.isShiftActive ? 15 : 11;
              const t1warn = !item.isShiftActive;
              const t2warn = item.isShiftActive;
              return (
                <CarouselItem key={item.id}>
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-row items-center p-4 space-x-3">
                        <AlarmClock className="w-8 h-8 text-primary shrink-0" />
                        <div className="flex flex-col text-left overflow-hidden w-full">
                          <p className="text-sm text-muted-foreground">{title}</p>
                          {timeRef ? (
                            <div className="flex flex-col gap-0.5 mt-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-24">{t1label}</span>
                                <span className={cn("text-xl font-bold font-headline tabular-nums", t1warn ? "text-yellow-500" : "text-foreground")}>
                                  {item.addHours(timeRef, t1hours)}
                                </span>
                                {t1warn && <span className="text-yellow-500">⚠️</span>}
                                {!t1warn && <span className="text-green-500">✅</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-24">{t2label}</span>
                                <span className={cn("text-xl font-bold font-headline tabular-nums", t2warn ? "text-yellow-500" : "text-foreground")}>
                                  {item.addHours(timeRef, t2hours)}
                                </span>
                                {t2warn && <span className="text-yellow-500">⚠️</span>}
                                {!t2warn && <span className="text-green-500">✅</span>}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Зміна ще не починалась</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
              );
            }
            const Icon = item.icon;
            return (
              <CarouselItem key={item.id}>
                <div className="p-1">
                  <Card>
                    <CardContent className="flex flex-row items-center p-4 space-x-3">
                      <Icon className={cn("w-8 h-8 text-primary shrink-0", item.iconClassName)} />
                      <div className="flex flex-col text-left overflow-hidden">
                          <p className="text-sm text-muted-foreground">{item.title}</p>
                          <p className="text-xl lg:text-2xl font-bold font-headline tabular-nums leading-tight truncate">
                            {item.value}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.description}
                          </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
