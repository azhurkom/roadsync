'use client';

import { useMemo } from 'react';
import { useApi } from './use-api';
import { useUser } from './use-user';
import type { ActionLog } from '@/lib/types';

const HOUR_MS = 60 * 60 * 1000;
const WEEKLY_REST_MS = 45 * HOUR_MS;  // щотижневий відпочинок ≥ 45 год
const FULL_REST_MS   = 11 * HOUR_MS;  // повний щоденний відпочинок
const NORMAL_SHIFT_MS = 13 * HOUR_MS; // стандартна зміна

export function useShiftStatus(cadenceId: string | undefined) {
  const { user } = useUser();

  const { data: recentActionLogs, isLoading } = useApi<ActionLog[]>(
    user && cadenceId ? `/api/action-logs?cadenceId=${cadenceId}&limit=200` : null,
    { refreshInterval: 8000, cacheKey: `shift-status-${cadenceId}`, staleTime: 15000 }
  );

  const shiftStatus = useMemo(() => {
    if (!recentActionLogs) {
      return { isActive: false, startTime: null, lastShiftEndTime: null, shortRestCount: 0, isLoading: true };
    }

    // Беремо тільки start/end-shift, сортуємо від найстарішого до найновішого
    const shiftLogs = recentActionLogs
      .filter(log => log.actionType === 'start-shift' || log.actionType === 'end-shift')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Визначаємо поточний статус зміни
    const lastStart = [...shiftLogs].reverse().find(l => l.actionType === 'start-shift');
    const lastEnd   = [...shiftLogs].reverse().find(l => l.actionType === 'end-shift');

    let isActive = false;
    let startTime: Date | null = null;
    let lastShiftEndTime: Date | null = null;

    const startMillis = lastStart ? new Date(lastStart.timestamp).getTime() : 0;
    const endMillis   = lastEnd   ? new Date(lastEnd.timestamp).getTime()   : 0;

    if (startMillis >= endMillis && lastStart) {
      isActive = true;
      startTime = new Date(lastStart.timestamp);
    } else if (lastEnd) {
      lastShiftEndTime = new Date(lastEnd.timestamp);
    }

    // ── Підрахунок shortRestCount ────────────────────────────────────────────
    // Будуємо масив завершених циклів: { shiftDuration, restDuration }
    // Цикл = start-shift → end-shift → наступний start-shift

    // Знаходимо початок поточного робочого тижня —
    // момент після останнього відпочинку ≥ 45 год
    let weekStart: number = 0;
    for (let i = 1; i < shiftLogs.length; i++) {
      const prev = shiftLogs[i - 1];
      const curr = shiftLogs[i];
      if (prev.actionType === 'end-shift' && curr.actionType === 'start-shift') {
        const gap = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
        if (gap >= WEEKLY_REST_MS) {
          weekStart = new Date(curr.timestamp).getTime();
        }
      }
    }

    // Формуємо цикли після weekStart
    let shortRestCount = 0;
    for (let i = 0; i < shiftLogs.length; i++) {
      const log = shiftLogs[i];
      if (log.actionType !== 'start-shift') continue;

      const shiftStart = new Date(log.timestamp).getTime();
      if (shiftStart < weekStart) continue;

      // Шукаємо відповідний end-shift
      const endLog = shiftLogs[i + 1];
      if (!endLog || endLog.actionType !== 'end-shift') continue;

      const shiftEnd = new Date(endLog.timestamp).getTime();
      const shiftDuration = shiftEnd - shiftStart;

      // Шукаємо наступний start-shift для тривалості відпочинку
      const nextStartLog = shiftLogs[i + 2];
      const restDuration = nextStartLog && nextStartLog.actionType === 'start-shift'
        ? new Date(nextStartLog.timestamp).getTime() - shiftEnd
        : null;

      // Цикл вважається "скороченим" якщо зміна > 13 год АБО відпочинок < 11 год
      const longShift   = shiftDuration > NORMAL_SHIFT_MS;
      const shortRest   = restDuration !== null && restDuration < FULL_REST_MS;

      if (longShift || shortRest) {
        shortRestCount++;
      }
    }

    return { isActive, startTime, lastShiftEndTime, shortRestCount, isLoading: false };
  }, [recentActionLogs, isLoading]);

  return shiftStatus;
}
