import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  getFilesProcessedCount,
  incrementFilesProcessedCount as doIncrement,
} from '../core/stats/files-processed';

const FilesProcessedContext = createContext<{
  count: number;
  increment: () => void;
} | null>(null);

export function FilesProcessedProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(getFilesProcessedCount);
  const increment = useCallback(() => {
    const next = doIncrement();
    setCount(next);
    return next;
  }, []);
  const value = useMemo(() => ({ count, increment }), [count, increment]);
  return (
    <FilesProcessedContext.Provider value={value}>{children}</FilesProcessedContext.Provider>
  );
}

export function useFilesProcessed() {
  const ctx = useContext(FilesProcessedContext);
  return ctx ?? { count: 0, increment: () => 0 };
}
