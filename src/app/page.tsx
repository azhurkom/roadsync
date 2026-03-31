'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/use-user';
import { useActiveCadence } from '@/hooks/use-active-cadence';
import { Loader2, Plus } from 'lucide-react';
import { type CarouselApi } from '@/components/ui/carousel';

import Header from '@/components/header';
import DashboardClient from '@/components/dashboard-client';
import AnalyticsClient from '@/components/analytics-client';
import TripsClient from '@/components/trips-client';
import CadenceManager from '@/components/cadence-manager';
import ActionDialog from '@/components/action-dialog';
import { ActivityRefetchProvider } from '@/hooks/use-activity-refetch';
import { Button } from '@/components/ui/button';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';

export default function Home() {
  const { user, isUserLoading } = useUser();
  const { activeCadence, isLoading: isCadenceLoading } = useActiveCadence();
  const cadenceRef = React.useRef(activeCadence);
  if (activeCadence?.id !== cadenceRef.current?.id) {
    cadenceRef.current = activeCadence;
  }
  const stableCadence = cadenceRef.current;
  const router = useRouter();
  const [api, setApi] = React.useState<CarouselApi>();
  const [activeSlide, setActiveSlide] = React.useState(0);
  const [isActionDialogOpen, setIsActionDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  React.useEffect(() => {
    if (!api) return;
    const handleSelect = () => setActiveSlide(api.selectedScrollSnap());
    api.on('select', handleSelect);
    handleSelect();
    return () => { api.off('select', handleSelect); };
  }, [api]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a, button, input, select, textarea, [role="button"], [role="menuitem"], [data-radix-collection-item], [data-radix-trigger]')) {
      return;
    }
    if (!api) return;
    const { clientX } = e;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    if (clientX - left > width / 2) api.scrollNext();
    else api.scrollPrev();
  };

  if (isUserLoading || !user || (isCadenceLoading && !activeCadence)) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ActivityRefetchProvider>
    <div className="flex flex-col h-dvh bg-background">
      <Header />
      <main className="flex-1 min-h-0 relative">
        {!activeCadence ? (
          <div className="h-full overflow-y-auto">
            <CadenceManager />
          </div>
        ) : (
          <>
            <div className="w-full h-full" onClick={handleContainerClick}>
              <Carousel
                setApi={setApi}
                opts={{ loop: true, watchDrag: false }}
                className="w-full h-full"
              >
                <CarouselContent className="-ml-0 h-full">
                  <CarouselItem className="pl-0 h-full overflow-y-auto pb-20">
                    <DashboardClient cadence={stableCadence!} />
                  </CarouselItem>
                  <CarouselItem className="pl-0 h-full overflow-y-auto">
                    <div className="p-2 sm:p-4">
                      <TripsClient cadence={activeCadence} />
                    </div>
                  </CarouselItem>
                  <CarouselItem className="pl-0 h-full overflow-y-auto">
                    <div className="p-2 sm:p-4">
                      <AnalyticsClient cadence={activeCadence} />
                    </div>
                  </CarouselItem>
                </CarouselContent>
              </Carousel>
            </div>

            <ActionDialog
                open={isActionDialogOpen}
                onOpenChange={setIsActionDialogOpen}
                cadence={stableCadence!}
              />
              <div className="fixed bottom-4 right-4 z-20">
                <Button
                  size="icon"
                  className="h-14 w-14 rounded-full shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, hsl(var(--accent)), hsl(var(--primary)))',
                    color: 'hsl(var(--accent-foreground))',
                  }}
                  onClick={() => setIsActionDialogOpen(true)}
                  aria-label="Додати нову дію"
                >
                  <Plus className="h-8 w-8" />
                </Button>
              </div>
          </>
        )}
      </main>
    </div>
    </ActivityRefetchProvider>
  );
}
