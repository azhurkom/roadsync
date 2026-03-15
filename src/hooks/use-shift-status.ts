'use client';

import { useMemo } from 'react';
import { useApi } from './use-api';
import { useUser } from './use-user';
import type { ActionLog } from '@/lib/types';

export function useShiftStatus(cadenceId: string | undefined) {
  const { user } = useUser();

  const { data: recentActionLogs, isLoading } = useApi<ActionLog[]>(
    user && cadenceId ? `/api/action-logs?cadenceId=${cadenceId}&limit=50` : null,
    { refreshInterval: 8000 }
  );

  const shiftStatus = useMemo(() => {
    if (isLoading || !recentActionLogs) {
      return { isActive: false, startTime: null, lastShiftEndTime: null, isLoading: true };
    }

    const startLog = recentActionLogs.find(log => log.actionType === 'start-shift');
    const endLog = recentActionLogs.find(log => log.actionType === 'end-shift');

    let isActive = false;
    let startTime: Date | null = null;
    let lastShiftEndTime: Date | null = null;

    const startMillis = startLog ? new Date(startLog.timestamp).getTime() : 0;
    const endMillis = endLog ? new Date(endLog.timestamp).getTime() : 0;

    if (startMillis >= endMillis && startLog) {
      isActive = true;
      startTime = new Date(startLog.timestamp);
    } else if (endLog) {
      lastShiftEndTime = new Date(endLog.timestamp);
    }

    return { isActive, startTime, lastShiftEndTime, isLoading: false };
  }, [recentActionLogs, isLoading]);

  return shiftStatus;
}
