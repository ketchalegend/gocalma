const STORAGE_KEY = 'gocalma_files_processed';

export function getFilesProcessedCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

export function incrementFilesProcessedCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const next = getFilesProcessedCount() + 1;
    localStorage.setItem(STORAGE_KEY, String(next));
    return next;
  } catch {
    return getFilesProcessedCount();
  }
}
