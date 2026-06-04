'use client';

import * as React from 'react';
import { WifiOff, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

declare global {
  interface ServiceWorkerRegistration {
    sync?: {
      register(tag: string): Promise<void>;
    };
  }
}

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = React.useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [pendingCount, setPendingCount] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      // Try to sync pending mutations
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg.sync) {
          await reg.sync.register('roadsync-sync');
        } else {
          // Fallback: send message to SW
          const sw = reg.active;
          if (sw) sw.postMessage({ type: 'SYNC_NOW' });
        }
      } catch {
        // SW not ready yet
      }
    };

    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for messages from SW
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'PENDING_COUNT') {
        setPendingCount(e.data.count);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    // Initial poll count
    const pollCount = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg.active) {
          const channel = new MessageChannel();
          channel.port1.onmessage = (e: MessageEvent) => {
            if (e.data?.type === 'PENDING_COUNT') {
              setPendingCount(e.data.count);
            }
          };
          reg.active.postMessage({ type: 'GET_PENDING_COUNT' }, [channel.port2]);
        }
      } catch {
        // SW not available
      }
    };

    if ('serviceWorker' in navigator) {
      // Delay initial poll to let SW activate
      setTimeout(pollCount, 2000);
      // Periodic poll
      const interval = setInterval(pollCount, 15000);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        navigator.serviceWorker?.removeEventListener('message', handleMessage);
        clearInterval(interval);
      };
    }
  }, []);

  // Enhanced SW registration with sync support
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (newSW) {
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'activated') {
              // Try to sync any leftover items
              if (reg.sync) {
                reg.sync.register('roadsync-sync').catch(() => {});
              }
            }
          });
        }
      });
    });
  }, []);

  if (dismissed && !isOffline && pendingCount === 0) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-all duration-300',
        isOffline
          ? 'bg-destructive text-destructive-foreground'
          : pendingCount > 0
            ? 'bg-amber-500 text-white'
            : 'bg-green-600 text-white'
      )}
    >
      {isOffline ? (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Ви офлайн</span>
          {pendingCount > 0 && (
            <span className="ml-1 flex items-center gap-1">
              <Upload className="h-3 w-3" />
              {pendingCount}
            </span>
          )}
        </>
      ) : pendingCount > 0 ? (
        <>
          <Upload className="h-4 w-4 animate-pulse" />
          <span>Синхронізація... {pendingCount}</span>
        </>
      ) : null}

      {!isOffline && pendingCount === 0 && (
        <button
          onClick={() => setDismissed(true)}
          className="ml-1 rounded-full p-0.5 hover:bg-white/20"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}