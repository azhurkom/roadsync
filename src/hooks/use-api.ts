'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useApi<T>(
  url: string | null,
  options?: { refreshInterval?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!url) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();

    if (options?.refreshInterval) {
      intervalRef.current = setInterval(fetchData, options.refreshInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, options?.refreshInterval]);

  return { data, isLoading, error, refetch: fetchData };
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
