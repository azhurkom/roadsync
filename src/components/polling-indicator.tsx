'use client';

import * as React from 'react';
import { Wifi, WifiOff, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useTabVisibility, useNetworkStatus } from '@/hooks/use-smart-polling';
import { cn } from '@/lib/utils';

interface PollingIndicatorProps {
  isPolling?: boolean;
  currentInterval?: number;
  consecutiveErrors?: number;
  className?: string;
  showDetails?: boolean;
}

export function PollingIndicator({ 
  isPolling = false, 
  currentInterval, 
  consecutiveErrors = 0,
  className,
  showDetails = false 
}: PollingIndicatorProps) {
  const isVisible = useTabVisibility();
  const isOnline = useNetworkStatus();

  const getStatusColor = () => {
    if (!isOnline) return 'text-red-500';
    if (consecutiveErrors > 0) return 'text-orange-500';
    if (isPolling) return 'text-green-500';
    return 'text-gray-500';
  };

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff className="h-4 w-4" />;
    if (consecutiveErrors > 0) return <AlertCircle className="h-4 w-4" />;
    if (isPolling) return <Loader2 className="h-4 w-4 animate-spin" />;
    return <Wifi className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (consecutiveErrors > 0) return `Error (${consecutiveErrors})`;
    if (isPolling) return 'Syncing';
    return 'Idle';
  };

  const formatInterval = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  };

  return (
    <div className={cn(
      'flex items-center gap-2 text-xs text-muted-foreground',
      className
    )}>
      <div className={cn('flex items-center gap-1', getStatusColor())}>
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </div>
      
      {showDetails && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            <span className={cn(isVisible ? 'text-green-500' : 'text-gray-500')}>
              {isVisible ? 'Visible' : 'Hidden'}
            </span>
          </div>
          
          {currentInterval && isPolling && (
            <div className="flex items-center gap-1">
              <span className="text-blue-500">
                Every {formatInterval(currentInterval)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Small compact version for headers
export function CompactPollingStatus({ 
  isPolling = false, 
  className 
}: { 
  isPolling?: boolean; 
  className?: string; 
}) {
  const isOnline = useNetworkStatus();
  const isVisible = useTabVisibility();

  return (
    <div className={cn(
      'flex items-center gap-1',
      className
    )}>
      <div className={cn(
        'w-2 h-2 rounded-full',
        !isOnline ? 'bg-red-500' :
        !isVisible ? 'bg-orange-500' :
        isPolling ? 'bg-green-500' : 'bg-gray-500'
      )} />
    </div>
  );
}

// Hook for getting polling status from useApi
export function usePollingStatus(apiHook: any) {
  return {
    isPolling: apiHook.isPolling || false,
    currentInterval: apiHook.currentInterval,
    consecutiveErrors: apiHook.consecutiveErrors || 0,
    isLoading: apiHook.isLoading || false,
    error: apiHook.error || null
  };
}
