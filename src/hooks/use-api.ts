'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiOptions {
  refreshInterval?: number;
  retryCount?: number;
  retryDelay?: number;
  cacheKey?: string;
  staleTime?: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  isStale: boolean;
}

// Simple in-memory cache with TTL
const cache = new Map<string, CacheEntry<any>>();

function getCacheEntry<T>(key: string, staleTime: number): CacheEntry<T> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const now = Date.now();
  const isStale = now - entry.timestamp > staleTime;
  
  if (isStale && entry.isStale) {
    cache.delete(key);
    return null;
  }
  
  return { ...entry, isStale };
}

function setCacheEntry<T>(key: string, data: T): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    isStale: false
  });
}

export function useApi<T>(
  url: string | null,
  options: UseApiOptions = {}
) {
  const {
    refreshInterval = 0,
    retryCount = 3,
    retryDelay = 1000,
    cacheKey,
    staleTime = 30000 // 30 seconds default stale time
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRetryCount = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (isRetry = false) => {
    if (!url) {
      setIsLoading(false);
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    // Check cache first
    if (cacheKey && !isRetry) {
      const cachedEntry = getCacheEntry<T>(cacheKey, staleTime);
      if (cachedEntry) {
        setData(cachedEntry.data);
        setError(null);
        setIsLoading(false);
        
        // If data is stale, fetch fresh data in background
        if (cachedEntry.isStale) {
          fetchData(true);
        }
        return;
      }
    }

    try {
      if (!data) setIsLoading(true);
      const res = await fetch(url, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const json = await res.json();
      
      // Cache successful response
      if (cacheKey) {
        setCacheEntry(cacheKey, json);
      }
      
      setData(json);
      setError(null);
      currentRetryCount.current = 0; // Reset retry count on success
    } catch (e) {
      const err = e as Error;
      
      // Don't retry if request was aborted
      if (err.name === 'AbortError') {
        return;
      }
      
      setError(err);
      
      // Retry logic
      if (currentRetryCount.current < retryCount && isRetry) {
        currentRetryCount.current++;
        retryTimeoutRef.current = setTimeout(() => {
          fetchData(true);
        }, retryDelay * Math.pow(2, currentRetryCount.current - 1)); // Exponential backoff
      }
    } finally {
      setIsLoading(false);
    }
  }, [url, cacheKey, staleTime, retryCount, retryDelay]);

  useEffect(() => {
    fetchData();

    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        fetchData(true);
      }, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData, refreshInterval]);

  const refetch = useCallback(() => {
    currentRetryCount.current = 0;
    fetchData(true);
  }, [fetchData]);

  const invalidateCache = useCallback(() => {
    if (cacheKey) {
      cache.delete(cacheKey);
    }
  }, [cacheKey]);

  return { 
    data, 
    isLoading, 
    error, 
    refetch, 
    invalidateCache,
    isStale: cacheKey ? getCacheEntry(cacheKey, staleTime)?.isStale ?? false : false
  };
}

// Mutate helper — POST/PATCH/DELETE and then refetch
export async function apiMutate(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: object
) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json().catch(() => null);
}
