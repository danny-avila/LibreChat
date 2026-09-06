import { useLocalize } from '~/hooks';

export type MetricTone = 'neutral' | 'success' | 'warning' | 'error';

const TONE_CLASS: Record<MetricTone, string> = {
  neutral: 'text-text-primary',
  success: 'text-status-success',
  warning: 'text-status-warning',
  error: 'text-status-error',
};

export function toneForValue(value: number, warnAt: number, errorAt: number): MetricTone {
  if (value >= errorAt) {
    return 'error';
  }
  if (value >= warnAt) {
    return 'warning';
  }
  return 'success';
}

export function toneForFps(fps: number, refreshHz: number): MetricTone {
  if (fps <= 0) {
    return 'neutral';
  }
  const ratio = fps / refreshHz;
  if (ratio <= 0.6) {
    return 'error';
  }
  if (ratio <= 0.85) {
    return 'warning';
  }
  return 'success';
}

interface MetricTileProps {
  label: string;
  value: string | null;
  hint?: string;
  tone?: MetricTone;
}

export function MetricTile({ label, value, hint, tone = 'neutral' }: MetricTileProps) {
  const localize = useLocalize();

  return (
    <div className="min-w-0 rounded-md bg-surface-tertiary px-2 py-1.5">
      <div className="truncate text-[11px] uppercase tracking-wide text-text-tertiary">{label}</div>
      <div className={`truncate text-sm font-semibold tabular-nums ${TONE_CLASS[tone]}`}>
        {value ?? localize('com_ui_perf_not_available')}
      </div>
      {hint ? <div className="truncate text-[11px] text-text-tertiary">{hint}</div> : null}
    </div>
  );
}
