'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SmartPollingOptions {
  url: string;
  baseInterval?: number;
  maxInterval?: number;
  backoffFactor?: number;
  errorThreshold?: number;
  activePolling?: boolean;
  onData?: (data: any) => void;
  onError?: (error: Error) => void;
}

export function useSmartPolling<T = unknown>({
  url,
  baseInterval = 10000, // 10 seconds default
  maxInterval = 60000, // 1 minute max
  backoffFactor = 1.5,
  errorThreshold = 3,
  activePolling = true,
  onData,
  onError
}: SmartPollingOptions) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentInterval, setCurrentInterval] = useState(baseInterval);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const adjustInterval = useCallback((hadError: boolean) => {
    setCurrentInterval(prev => {
      if (hadError) {
        // Increase interval on error (backoff)
        return Math.min(prev * backoffFactor, maxInterval);
      } else if (consecutiveErrors > 0) {
        // Decrease interval when recovering from errors
        return Math.max(baseInterval, prev / backoffFactor);
      }
      return prev;
    });
  }, [backoffFactor, maxInterval, baseInterval, consecutiveErrors]);

  const fetchData = useCallback(async () => {
    if (!url || !activePolling || !isMountedRef.current) return;

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (isMountedRef.current) {
        setData(result);
        setConsecutiveErrors(0);
        adjustInterval(false);
        onData?.(result);
      }
    } catch (err) {
      const error = err as Error;
      
      // Don't handle aborted requests as errors
      if (error.name === 'AbortError' || !isMountedRef.current) {
        return;
      }

      if (isMountedRef.current) {
        setError(error);
        setConsecutiveErrors(prev => prev + 1);
        adjustInterval(true);
        onError?.(error);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [url, activePolling, adjustInterval, onData, onError]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Initial fetch
    fetchData();

    // Set up polling interval
    if (activePolling) {
      intervalRef.current = setInterval(() => {
        fetchData();
      }, currentInterval);
    }
  }, [fetchData, currentInterval, activePolling]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const refetch = useCallback(() => {
    setConsecutiveErrors(0);
    setCurrentInterval(baseInterval);
    fetchData();
  }, [fetchData, baseInterval]);

  // Restart polling when interval changes
  useEffect(() => {
    if (activePolling && intervalRef.current) {
      stopPolling();
      startPolling();
    }
  }, [currentInterval, activePolling, startPolling, stopPolling]);

  // Start polling on mount and when dependencies change
  useEffect(() => {
    if (activePolling) {
      startPolling();
    }

    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [activePolling, startPolling, stopPolling]);

  // Auto-disable polling after too many consecutive errors
  useEffect(() => {
    if (consecutiveErrors >= errorThreshold && intervalRef.current) {
      console.warn(`Disabling polling after ${consecutiveErrors} consecutive errors`);
      stopPolling();
    }
  }, [consecutiveErrors, errorThreshold, stopPolling]);

  return {
    data,
    isLoading,
    error,
    currentInterval,
    consecutiveErrors,
    isPolling: !!intervalRef.current,
    refetch,
    startPolling,
    stopPolling
  };
}

// Hook for tab visibility - reduces polling when tab is not active
export function useTabVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

// Hook for network status - reduces polling when offline
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
