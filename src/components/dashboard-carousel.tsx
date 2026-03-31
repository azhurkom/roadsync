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
import { Clock, Truck, BedDouble, Loader2, Route } from 'lucide-react';
import { TrailerIcon } from '@/components/icons';
import { useShiftStatus } from '@/hooks/use-shift-status';
import { useLatestTrip } from '@/hooks/use-trips';
import { cn } from '@/lib/utils';


interface DashboardCarouselProps {
    cadence: Cadence;
}

export default function DashboardCarousel({ cadence }: DashboardCarouselProps) {
    const { isActive: isShiftActive, startTime: activeShiftStartTime, lastShiftEndTime, isLoading: isShiftStatusLoading } = useShiftStatus(cadence?.id);
    const { latestTrip, isLoading: isTripLoading } = useLatestTrip(cadence?.id);
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

    if (isShiftStatusLoading) {
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

    if (latestTrip) {
        carouselItems.push({
            id: 'latest-trip',
            icon: Route,
            title: 'Поточний рейс',
            value: latestTrip.id,
            description: latestTrip.description,
        });
    }
    
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
          {carouselItems.map((item) => {
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
