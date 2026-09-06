const BYTES_PER_MB = 1024 * 1024;

export function formatFps(value: number): string | null {
  return value > 0 ? value.toFixed(0) : null;
}

export function formatMs(value: number | undefined, decimals = 0): string | null {
  return value == null || value <= 0 ? null : `${value.toFixed(decimals)} ms`;
}

export function formatMb(bytes: number, decimals = 0): string | null {
  return bytes > 0 ? `${(bytes / BYTES_PER_MB).toFixed(decimals)} MB` : null;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}

export function formatPercent(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

export function formatRate(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}
