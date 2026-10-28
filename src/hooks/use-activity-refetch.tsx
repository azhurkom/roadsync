'use client';

import * as React from 'react';

interface ActivityRefetchContextValue {
  refetch: () => void;
  register: (fn: () => void) => () => void;
}

const ActivityRefetchContext = React.createContext<ActivityRefetchContextValue>({
  refetch: () => {},
  register: () => () => {},
});

export function ActivityRefetchProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = React.useRef<Set<() => void>>(new Set());

  const register = React.useCallback((fn: () => void) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  const refetch = React.useCallback(() => {
    listenersRef.current.forEach(fn => {
      try {
        fn();
      } catch (err) {
        console.error('Error during refetch callback:', err);
      }
    });
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

