export const PERF_MONITOR_STORAGE_KEY = 'lc-perf-hud';

export function isPerfMonitorEnabled(isDevelopment: boolean = import.meta.env.DEV): boolean {
  if (isDevelopment) {
    return true;
  }
  try {
    return localStorage.getItem(PERF_MONITOR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
