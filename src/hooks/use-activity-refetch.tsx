'use client';

import * as React from 'react';

interface ActivityRefetchContextValue {
  refetch: () => void;
  register: (fn: () => void) => void;
}

const ActivityRefetchContext = React.createContext<ActivityRefetchContextValue>({
  refetch: () => {},
  register: () => {},
});

export function ActivityRefetchProvider({ children }: { children: React.ReactNode }) {
  const refetchRef = React.useRef<() => void>(() => {});

  const register = React.useCallback((fn: () => void) => {
    refetchRef.current = fn;
  }, []);

  const refetch = React.useCallback(() => {
    refetchRef.current();
  }, []);

  return (
    <ActivityRefetchContext.Provider value={{ refetch, register }}>
      {children}
    </ActivityRefetchContext.Provider>
  );
}

export function useActivityRefetch() {
  return React.useContext(ActivityRefetchContext);
}
