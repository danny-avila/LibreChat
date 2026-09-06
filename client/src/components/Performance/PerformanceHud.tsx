import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, ChevronDown, ChevronUp, Copy, GripHorizontal, Pause, Play, X } from 'lucide-react';
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToastContext,
} from '@librechat/client';
import type { LoadProbeResult, PerfIssueSeverity } from '~/lib/perf';
import {
  formatCount,
  formatFps,
  formatMb,
  formatMs,
  formatPercent,
  formatRate,
} from '~/lib/perf/format';
import { PERF_HUD_ATTRIBUTE, perfMonitor } from '~/lib/perf/monitor';
import { MetricTile, toneForFps, toneForValue } from './MetricTile';
import { PERF_THRESHOLDS } from '~/lib/perf/diagnostics';
import { formatPerfReport } from '~/lib/perf/report';
import { usePerfSnapshot } from './usePerfSnapshot';
import { useHudPosition } from './useHudPosition';
import { LoadTestPanel } from './LoadTestPanel';
import { FrameGraph } from './FrameGraph';
import { IssuePanel } from './IssuePanel';
import { useLocalize } from '~/hooks';

const BYTES_PER_MB = 1024 * 1024;
const LIST_LIMIT = 4;

const SEVERITY_CLASS: Record<PerfIssueSeverity, string> = {
  error: 'text-status-error',
  warning: 'text-status-warning',
  info: 'text-status-info',
};

interface PerformanceHudProps {
  onClose: () => void;
}

export default function PerformanceHud({ onClose }: PerformanceHudProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const { onHandlePointerDown, onHandleKeyDown } = useHudPosition(panelRef);

  const [collapsed, setCollapsed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState('live');
  const [recording, setRecording] = useState(() => perfMonitor.isRecording);
  const [probeResult, setProbeResult] = useState<LoadProbeResult | null>(null);

  const snapshot = usePerfSnapshot(!paused);
  useEffect(() => {
    setRecording(perfMonitor.isRecording);
  }, [paused, snapshot]);
  const { live, window: windowStats, scroll, dom, memory, react, vitals } = snapshot;
  const hasFrames = windowStats.sampleCount > 0;
  const hasScroll = scroll.sampleCount >= PERF_THRESHOLDS.minSamples;
  const worstSeverity = snapshot.issues[0]?.severity;

  const toggleRecording = useCallback(() => {
    if (perfMonitor.isRecording) {
      perfMonitor.stopRecording();
      setRecording(false);
      return;
    }
    perfMonitor.startRecording();
    setRecording(true);
  }, []);

  const copyReport = useCallback(async () => {
    const markdown = formatPerfReport(perfMonitor.buildReport(probeResult ?? undefined));
    try {
      await navigator.clipboard.writeText(markdown);
      showToast({ message: localize('com_ui_copied_to_clipboard'), status: 'success' });
    } catch {
      console.info(markdown);
      showToast({ message: localize('com_ui_perf_copy_fallback'), status: 'warning' });
    }
  }, [localize, probeResult, showToast]);

  const statusClass = worstSeverity ? SEVERITY_CLASS[worstSeverity] : 'text-status-success';

  return (
    <div
      ref={panelRef}
      role="complementary"
      {...{ [PERF_HUD_ATTRIBUTE]: '' }}
      aria-label={localize('com_ui_perf_title')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
      className="fixed z-[9990] flex w-[21rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-border-medium bg-surface-primary shadow-lg"
    >
      <div className="flex items-center gap-1 border-b border-border-light px-1.5 py-1">
        <button
          type="button"
          aria-label={localize('com_ui_perf_move')}
          onPointerDown={onHandlePointerDown}
          onKeyDown={onHandleKeyDown}
          className="cursor-grab rounded p-1 text-text-tertiary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
        >
          <GripHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <Circle className={`h-2 w-2 fill-current ${statusClass}`} aria-hidden="true" />
        <span className="text-xs font-semibold text-text-primary">
          {localize('com_ui_perf_title')}
        </span>
        <span className="ml-auto flex items-baseline gap-1">
          <span
            className={`text-sm font-semibold tabular-nums ${
              hasFrames ? statusClass : 'text-text-tertiary'
            }`}
          >
            {formatFps(live.fps) ?? localize('com_ui_perf_not_available')}
          </span>
          <span className="text-[11px] text-text-tertiary">{localize('com_ui_perf_fps')}</span>
        </span>
        <Button
          variant="section-action"
          size="icon-xs"
          aria-label={paused ? localize('com_ui_perf_resume') : localize('com_ui_perf_pause')}
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="section-action"
          size="icon-xs"
          aria-expanded={!collapsed}
          aria-label={collapsed ? localize('com_ui_perf_expand') : localize('com_ui_perf_collapse')}
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="section-action"
          size="icon-xs"
          aria-label={localize('com_ui_close')}
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      {collapsed ? null : (
        <>
          <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
            <FrameGraph snapshot={snapshot} />
            <p className="text-[11px] text-text-tertiary">
              {localize('com_ui_perf_display_summary', {
                refresh: windowStats.refreshHz,
                budget: windowStats.budgetMs.toFixed(1),
              })}
            </p>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-3 gap-0.5 bg-surface-tertiary p-0.5">
                <TabsTrigger value="live" className="min-w-0 py-1 text-[11px]">
                  {localize('com_ui_perf_tab_live')}
                </TabsTrigger>
                <TabsTrigger value="findings" className="min-w-0 py-1 text-[11px]">
                  {localize('com_ui_perf_tab_findings', { count: snapshot.issues.length })}
                </TabsTrigger>
                <TabsTrigger value="load" className="min-w-0 py-1 text-[11px]">
                  {localize('com_ui_perf_tab_load')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="live" className="mt-2 flex flex-col gap-2 p-0">
                <div className="grid grid-cols-3 gap-1.5">
                  <MetricTile
                    label={localize('com_ui_perf_fps_average')}
                    value={formatFps(windowStats.fps)}
                    hint={localize('com_ui_perf_of_refresh', { refresh: windowStats.refreshHz })}
                    tone={
                      hasFrames ? toneForFps(windowStats.fps, windowStats.refreshHz) : 'neutral'
                    }
                  />
                  <MetricTile
                    label={localize('com_ui_perf_fps_low')}
                    value={formatFps(windowStats.fpsLow1)}
                    tone={
                      hasFrames ? toneForFps(windowStats.fpsLow1, windowStats.refreshHz) : 'neutral'
                    }
                  />
                  <MetricTile
                    label={localize('com_ui_perf_frame_p95')}
                    value={formatMs(windowStats.frameP95Ms, 1)}
                    hint={localize('com_ui_perf_worst_frame_hint', {
                      worst: Math.round(windowStats.frameMaxMs),
                    })}
                    tone={
                      hasFrames
                        ? toneForValue(
                            windowStats.frameP95Ms,
                            windowStats.budgetMs * 1.5,
                            windowStats.budgetMs * 3,
                          )
                        : 'neutral'
                    }
                  />
                  <MetricTile
                    label={localize('com_ui_perf_jank')}
                    value={hasFrames ? formatPercent(windowStats.jankRatio) : null}
                    hint={localize('com_ui_perf_dropped_hint', {
                      dropped: windowStats.droppedFrames,
                    })}
                    tone={
                      hasFrames
                        ? toneForValue(
                            windowStats.jankRatio,
                            PERF_THRESHOLDS.jankRatioWarning,
                            PERF_THRESHOLDS.jankRatioError,
                          )
                        : 'neutral'
                    }
                  />
                  <MetricTile
                    label={localize('com_ui_perf_scroll_fps')}
                    value={hasScroll ? formatFps(scroll.fps) : null}
                    hint={localize('com_ui_perf_samples', { count: scroll.sampleCount })}
                    tone={hasScroll ? toneForFps(scroll.fps, scroll.refreshHz) : 'neutral'}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_long_tasks')}
                    value={formatMs(snapshot.longTaskMsPerMin)}
                    hint={localize('com_ui_perf_per_minute')}
                    tone={toneForValue(
                      snapshot.longTaskMsPerMin,
                      PERF_THRESHOLDS.longTaskMsPerMinWarning,
                      PERF_THRESHOLDS.longTaskMsPerMinError,
                    )}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_input_latency')}
                    value={formatMs(snapshot.inputLatencyP95Ms)}
                    tone={toneForValue(
                      snapshot.inputLatencyP95Ms,
                      PERF_THRESHOLDS.inputLatencyWarningMs,
                      PERF_THRESHOLDS.inputLatencyErrorMs,
                    )}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_inp')}
                    value={formatMs(vitals.inpMs)}
                    hint={vitals.inpType}
                    tone={toneForValue(
                      vitals.inpMs ?? 0,
                      PERF_THRESHOLDS.inpWarningMs,
                      PERF_THRESHOLDS.inpErrorMs,
                    )}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_cls')}
                    value={vitals.clsValue != null ? vitals.clsValue.toFixed(3) : null}
                    tone={toneForValue(
                      vitals.clsValue ?? 0,
                      PERF_THRESHOLDS.clsWarning,
                      PERF_THRESHOLDS.clsError,
                    )}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_dom_elements')}
                    value={dom.elements > 0 ? formatCount(dom.elements) : null}
                    hint={localize('com_ui_perf_growth_hint', {
                      growth: Math.round(dom.growthPerMin),
                    })}
                    tone={toneForValue(
                      dom.elements,
                      PERF_THRESHOLDS.domElementsWarning,
                      PERF_THRESHOLDS.domElementsError,
                    )}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_message_rows')}
                    value={formatCount(dom.messageRows)}
                    hint={localize('com_ui_perf_code_blocks_hint', { count: dom.codeBlocks })}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_heap')}
                    value={memory.supported ? formatMb(memory.usedBytes) : null}
                    hint={
                      memory.supported
                        ? localize('com_ui_perf_growth_mb_hint', {
                            growth: (memory.growthBytesPerMin / BYTES_PER_MB).toFixed(1),
                          })
                        : undefined
                    }
                    tone={toneForValue(
                      memory.growthBytesPerMin / BYTES_PER_MB,
                      PERF_THRESHOLDS.heapGrowthWarningMbPerMin,
                      PERF_THRESHOLDS.heapGrowthErrorMbPerMin,
                    )}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_react_commits')}
                    value={react.instrumented ? formatRate(react.commitsPerSec) : null}
                    hint={
                      react.instrumented
                        ? localize('com_ui_perf_worst_commit_hint', {
                            worst: react.worstMs.toFixed(1),
                          })
                        : undefined
                    }
                    tone={toneForValue(
                      react.worstMs,
                      PERF_THRESHOLDS.commitWorstWarningMs,
                      PERF_THRESHOLDS.commitWorstErrorMs,
                    )}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_lcp')}
                    value={formatMs(vitals.lcpMs)}
                    tone={toneForValue(
                      vitals.lcpMs ?? 0,
                      PERF_THRESHOLDS.lcpWarningMs,
                      PERF_THRESHOLDS.lcpErrorMs,
                    )}
                  />
                  <MetricTile
                    label={localize('com_ui_perf_frames_sampled')}
                    value={formatCount(windowStats.sampleCount)}
                    hint={snapshot.scrolling ? localize('com_ui_perf_scrolling') : undefined}
                  />
                </div>

                {snapshot.longTasks.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <h3 className="text-[11px] uppercase tracking-wide text-text-tertiary">
                      {localize('com_ui_perf_recent_long_tasks')}
                    </h3>
                    <ul className="flex flex-col gap-1">
                      {snapshot.longTasks.slice(0, LIST_LIMIT).map((task, index) => (
                        <li
                          key={`${task.startTime}-${index}`}
                          className="flex items-center justify-between gap-2 rounded bg-surface-tertiary px-2 py-1 text-[11px]"
                        >
                          <span className="truncate text-text-secondary">
                            {task.source || localize('com_ui_perf_unattributed')}
                          </span>
                          <span className="shrink-0 tabular-nums text-text-primary">
                            {formatMs(task.durationMs)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="findings" className="mt-2 flex flex-col gap-2 p-0">
                <IssuePanel issues={snapshot.issues} />
                {snapshot.shifts.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <h3 className="text-[11px] uppercase tracking-wide text-text-tertiary">
                      {localize('com_ui_perf_recent_shifts')}
                    </h3>
                    <ul className="flex flex-col gap-1">
                      {snapshot.shifts.slice(0, LIST_LIMIT).map((shift, index) => (
                        <li
                          key={`${shift.startTime}-${index}`}
                          className="flex items-center justify-between gap-2 rounded bg-surface-tertiary px-2 py-1 text-[11px]"
                        >
                          <span className="truncate text-text-secondary">
                            {shift.source || localize('com_ui_perf_unattributed')}
                          </span>
                          <span className="shrink-0 tabular-nums text-text-primary">
                            {shift.value.toFixed(4)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="load" className="mt-2 p-0">
                <LoadTestPanel paused={paused} result={probeResult} onResult={setProbeResult} />
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex items-center gap-1.5 border-t border-border-light p-2">
            <Button
              variant={recording ? 'destructive' : 'outline'}
              size="sm"
              disabled={paused}
              onClick={toggleRecording}
            >
              {recording
                ? localize('com_ui_perf_record_stop', {
                    seconds: Math.round(snapshot.recordingMs / 1000),
                  })
                : localize('com_ui_perf_record_start')}
            </Button>
            <Button variant="outline" size="sm" onClick={copyReport}>
              <Copy className="mr-1 h-3 w-3" aria-hidden="true" />
              {localize('com_ui_perf_copy_report')}
            </Button>
            <Button
              variant="section-action"
              size="sm"
              className="ml-auto"
              onClick={() => perfMonitor.reset()}
            >
              {localize('com_ui_reset')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
