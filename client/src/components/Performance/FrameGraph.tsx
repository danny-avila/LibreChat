import { useEffect, useRef } from 'react';
import type { PerfSnapshot } from '~/lib/perf';
import { jankThresholdMs, perfMonitor, readFrameTrace, SEVERE_FRAME_MS } from '~/lib/perf';
import { useLocalize } from '~/hooks';

const MAX_BARS = 320;
const MAX_SCALE_MS = 150;
const MIN_BAR_PX = 3;

interface FrameGraphProps {
  snapshot: PerfSnapshot;
  className?: string;
}

export function FrameGraph({ snapshot, className = '' }: FrameGraphProps) {
  const localize = useLocalize();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const traceRef = useRef<Float64Array>(new Float64Array(MAX_BARS));

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth < MIN_BAR_PX || cssHeight < MIN_BAR_PX) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(cssWidth * ratio);
    const height = Math.round(cssHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const styles = getComputedStyle(canvas);
    const token = (name: string): string => {
      const value = styles.getPropertyValue(name).trim();
      return value ? `rgb(${value})` : styles.color;
    };

    const barCount = readFrameTrace(
      perfMonitor.frameBuffer,
      Math.min(MAX_BARS, Math.floor(cssWidth / MIN_BAR_PX)),
      traceRef.current,
    );

    context.clearRect(0, 0, width, height);
    if (barCount === 0) {
      return;
    }

    const trace = traceRef.current;
    const budgetMs = snapshot.window.budgetMs;
    const jankLimit = jankThresholdMs(budgetMs);
    let peak = budgetMs * 3;
    for (let i = 0; i < barCount; i++) {
      if (trace[i] > peak) {
        peak = trace[i];
      }
    }
    const scale = Math.min(peak, MAX_SCALE_MS);

    context.fillStyle = token('--border-medium');
    const budgetY = height - (budgetMs / scale) * height;
    context.fillRect(0, budgetY, width, Math.max(1, ratio));

    const barWidth = width / barCount;
    const drawWidth = Math.max(1, barWidth - ratio);
    const baseColor = token('--border-heavy');
    const warningColor = token('--status-warning');
    const errorColor = token('--status-error');

    for (let i = 0; i < barCount; i++) {
      const value = Math.min(trace[i], scale);
      const barHeight = Math.max(ratio, (value / scale) * height);
      let fill = baseColor;
      if (trace[i] >= SEVERE_FRAME_MS) {
        fill = errorColor;
      } else if (trace[i] >= jankLimit) {
        fill = warningColor;
      }
      context.fillStyle = fill;
      context.fillRect(i * barWidth, height - barHeight, drawWidth, barHeight);
    }
  }, [snapshot]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={localize('com_ui_perf_graph_label', {
        fps: Math.round(snapshot.live.fps),
        budget: snapshot.window.budgetMs.toFixed(1),
      })}
      className={`h-14 w-full rounded-md bg-surface-tertiary ${className}`}
    />
  );
}
