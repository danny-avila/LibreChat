import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Table,
  Button,
  TableRow,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRowHeader,
} from '@librechat/client';
import type { LoadProbePass, LoadProbeResult, LoadProbeVerdict, ScrollTarget } from '~/lib/perf';
import type { TranslationKeys } from '~/hooks';
import { formatCount, formatFps, formatMs } from '~/lib/perf/format';
import { findScrollTargets, runLoadProbe } from '~/lib/perf/probe';
import { perfMonitor } from '~/lib/perf/monitor';
import { toneForFps } from './MetricTile';
import { useLocalize } from '~/hooks';

const QUICK_PASSES = 1;
const FULL_PASSES = 6;

const TONE_CLASS = {
  neutral: 'text-text-primary',
  success: 'text-status-success',
  warning: 'text-status-warning',
  error: 'text-status-error',
} as const;

const GROWTH_ATTRIBUTION_RATIO = 1.05;

function verdictKey(verdict: LoadProbeVerdict, passCount: number): TranslationKeys {
  if (passCount < 2) {
    return verdict.degrades
      ? 'com_ui_perf_load_verdict_single_degrades'
      : 'com_ui_perf_load_verdict_single_stable';
  }
  if (!verdict.degrades) {
    return 'com_ui_perf_load_verdict_stable';
  }
  return verdict.elementsGrowthRatio >= GROWTH_ATTRIBUTION_RATIO
    ? 'com_ui_perf_load_verdict_degrades'
    : 'com_ui_perf_load_verdict_heavy';
}

interface LoadTestPanelProps {
  onResult: (result: LoadProbeResult | null) => void;
  result: LoadProbeResult | null;
  paused: boolean;
}

export function LoadTestPanel({ onResult, result, paused }: LoadTestPanelProps) {
  const localize = useLocalize();
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const [targets, setTargets] = useState<ScrollTarget[]>([]);
  const [targetIndex, setTargetIndex] = useState(0);
  const [passes, setPasses] = useState<LoadProbePass[]>([]);
  const [running, setRunning] = useState(false);

  /** Discovery walks every element on the page, which is ~380 ms on a long
   *  thread. Run it after the panel has painted so opening the tab stays
   *  responsive instead of the measuring tool being the slowest interaction. */
  useEffect(() => {
    const timer = window.setTimeout(() => setTargets(findScrollTargets()), 0);
    return () => {
      window.clearTimeout(timer);
      runIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!paused) {
      return;
    }
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setPasses([]);
    onResult(null);
  }, [onResult, paused]);

  const target = targets[targetIndex];

  const run = useCallback(
    async (maxPasses: number) => {
      if (paused) {
        return;
      }
      const scrollTargets = findScrollTargets();
      setTargets(scrollTargets);
      const selected = scrollTargets[targetIndex] ?? scrollTargets[0];
      if (!selected) {
        return;
      }

      const runId = ++runIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setPasses([]);
      onResult(null);
      setRunning(true);

      const probeResult = await runLoadProbe({
        target: selected.element,
        label: selected.label,
        monitor: perfMonitor,
        passes: maxPasses,
        signal: controller.signal,
        onPass: (pass) => {
          if (runIdRef.current === runId && !controller.signal.aborted) {
            setPasses((current) => [...current, pass]);
          }
        },
      });

      if (runIdRef.current !== runId || controller.signal.aborted) {
        return;
      }
      setRunning(false);
      abortRef.current = null;
      onResult(probeResult);
    },
    [onResult, paused, targetIndex],
  );

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    onResult(null);
  }, [onResult]);

  const rows = result ? result.passes : passes;
  const verdict =
    result &&
    !result.aborted &&
    rows.length > 0 &&
    rows.every((pass) => pass.frames.sampleCount > 0)
      ? result.verdict
      : undefined;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-snug text-text-secondary">
        {localize('com_ui_perf_load_explainer')}
      </p>

      {targets.length === 0 ? (
        <p className="rounded-md bg-surface-tertiary px-2 py-2 text-[11px] text-text-secondary">
          {localize('com_ui_perf_load_no_targets')}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <span
            aria-live="polite"
            className="min-w-0 flex-1 truncate text-[11px] text-text-secondary"
          >
            {localize('com_ui_perf_load_target', {
              label: target?.label ?? '',
              index: targetIndex + 1,
              total: targets.length,
            })}
          </span>
          <Button
            variant="section-action"
            size="sm"
            disabled={running || targets.length < 2}
            onClick={() => setTargetIndex((current) => (current + 1) % targets.length)}
          >
            {localize('com_ui_perf_load_next_target')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="submit"
          size="sm"
          disabled={running || paused || !target}
          onClick={() => run(FULL_PASSES)}
        >
          {localize('com_ui_perf_load_run')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={running || paused || !target}
          onClick={() => run(QUICK_PASSES)}
        >
          {localize('com_ui_perf_load_run_quick')}
        </Button>
        {running ? (
          <Button variant="destructive" size="sm" onClick={cancel}>
            {localize('com_ui_stop')}
          </Button>
        ) : null}
        {running ? (
          <span role="status" className="text-[11px] text-text-secondary">
            {localize('com_ui_perf_load_running', { pass: passes.length + 1 })}
          </span>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <Table unwrapped className="text-[11px]">
          <TableHeader>
            <TableRow className="border-border-light">
              <TableHead className="h-6 px-1 text-text-tertiary">
                {localize('com_ui_perf_load_pass')}
              </TableHead>
              <TableHead className="h-6 px-1 text-text-tertiary">
                {localize('com_ui_perf_dom_elements')}
              </TableHead>
              <TableHead className="h-6 px-1 text-text-tertiary">
                {localize('com_ui_perf_fps')}
              </TableHead>
              <TableHead className="h-6 px-1 text-text-tertiary">
                {localize('com_ui_perf_frame_p95')}
              </TableHead>
              <TableHead className="h-6 px-1 text-text-tertiary">
                {localize('com_ui_perf_dropped')}
              </TableHead>
              <TableHead className="h-6 px-1 text-text-tertiary">
                {localize('com_ui_perf_long_tasks')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((pass) => (
              <TableRow key={pass.pass} className="border-border-light">
                <TableRowHeader className="px-1 py-1 font-normal text-text-secondary">
                  {pass.pass}
                </TableRowHeader>
                <TableCell className="px-1 py-1 tabular-nums text-text-primary">
                  {formatCount(pass.elements)}
                </TableCell>
                <TableCell
                  className={`px-1 py-1 tabular-nums ${TONE_CLASS[toneForFps(pass.frames.fps, pass.frames.refreshHz)]}`}
                >
                  {formatFps(pass.frames.fps) ?? localize('com_ui_perf_not_available')}
                </TableCell>
                <TableCell className="px-1 py-1 tabular-nums text-text-primary">
                  {formatMs(pass.frames.frameP95Ms, 1) ?? localize('com_ui_perf_not_available')}
                </TableCell>
                <TableCell className="px-1 py-1 tabular-nums text-text-primary">
                  {pass.frames.droppedFrames}
                </TableCell>
                <TableCell className="px-1 py-1 tabular-nums text-text-primary">
                  {localize('com_ui_perf_ms_value', { value: pass.longTaskMs })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {verdict ? (
        <div
          role="status"
          className="rounded-md border border-border-light bg-surface-tertiary px-2 py-2 text-[11px] leading-snug text-text-secondary"
        >
          <p className={verdict.degrades ? TONE_CLASS.error : TONE_CLASS.success}>
            {localize(verdictKey(verdict, rows.length), {
              drop: Math.round(verdict.fpsDropRatio * 100),
              first: Math.round(verdict.fpsFirst),
              last: Math.round(verdict.fpsLast),
              ratio: verdict.elementsGrowthRatio.toFixed(2),
              elements: formatCount(verdict.elementsLast),
            })}
          </p>
          {verdict.recycles ? <p>{localize('com_ui_perf_load_verdict_recycles')}</p> : null}
          <p>
            {localize('com_ui_perf_load_verdict_frames', {
              worst: Math.round(verdict.worstFrameMs),
              dropped: verdict.droppedFrames,
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
