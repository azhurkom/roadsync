'use client';

import * as React from 'react';
import DashboardCarousel from '@/components/dashboard-carousel';
import ActivityFeed from '@/components/activity-feed';
import type { Cadence } from '@/lib/types';

interface DashboardClientProps {
  cadence: Cadence;
}

export default function DashboardClient({ cadence }: DashboardClientProps) {
  return (
    <div className="p-2 sm:p-4 space-y-2">
      <DashboardCarousel cadence={cadence} />
      <ActivityFeed cadenceId={cadence.id} />
    </div>
  );
}
