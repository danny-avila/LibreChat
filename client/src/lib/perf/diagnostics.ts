import type {
  DomStats,
  PerfIssue,
  FrameStats,
  MemoryStats,
  VitalsSnapshot,
  ReactCommitStats,
  PerfIssueSeverity,
} from './types';
import { SEVERE_FRAME_MS } from './frames';

export const PERF_THRESHOLDS = {
  minSamples: 30,
  /**
   * Smoothness is judged on how long frames actually take, not on the fraction
   * of the display's refresh they reach. A 240 Hz panel has a 4.2 ms budget, so
   * a ratio rule calls 117 FPS with a 16.6 ms p95 and zero janky frames an
   * error while the jank metric beside it reads 0.0%. Rendering content at the
   * refresh rate of a high-rate display is not a reasonable expectation; taking
   * longer than a frame at 60 Hz is where a reader starts to feel it.
   */
  frameP95WarningMs: 25,
  frameP95ErrorMs: 50,
  jankRatioWarning: 0.05,
  jankRatioError: 0.15,
  longTaskMsPerMinWarning: 500,
  longTaskMsPerMinError: 2000,
  longTaskWarningMs: 100,
  longTaskErrorMs: 250,
  inputLatencyWarningMs: 100,
  inputLatencyErrorMs: 250,
  inpWarningMs: 200,
  inpErrorMs: 500,
  clsWarning: 0.1,
  clsError: 0.25,
  lcpWarningMs: 2500,
  lcpErrorMs: 4000,
  heapGrowthWarningMbPerMin: 8,
  heapGrowthErrorMbPerMin: 25,
  domElementsWarning: 6000,
  domElementsError: 15000,
  domGrowthWarningPerMin: 1500,
  domGrowthErrorPerMin: 5000,
  commitsPerSecWarning: 12,
  commitsPerSecError: 30,
  commitWorstWarningMs: 32,
  commitWorstErrorMs: 80,
} as const;

export interface DiagnosticsInput {
  window: FrameStats;
  scroll: FrameStats;
  longTaskMsPerMin: number;
  worstLongTaskMs: number;
  worstLongTaskSource: string;
  inputLatencyP95Ms: number;
  vitals: VitalsSnapshot;
  memory: MemoryStats;
  dom: DomStats;
  react: ReactCommitStats;
}

const SEVERITY_RANK: Record<PerfIssueSeverity, number> = { error: 0, warning: 1, info: 2 };
const BYTES_PER_MB = 1024 * 1024;

function highestSeverity(
  first: PerfIssueSeverity | undefined,
  second: PerfIssueSeverity | undefined,
): PerfIssueSeverity | undefined {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  return SEVERITY_RANK[first] <= SEVERITY_RANK[second] ? first : second;
}

function severityFor(
  value: number,
  warningAt: number,
  errorAt: number,
): PerfIssueSeverity | undefined {
  if (value >= errorAt) {
    return 'error';
  }
  if (value >= warningAt) {
    return 'warning';
  }
  return undefined;
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function collectPerfIssues(input: DiagnosticsInput): PerfIssue[] {
  const issues: PerfIssue[] = [];
  const { window: frames, scroll, dom, memory, react, vitals } = input;
  const hasFrames = frames.sampleCount >= PERF_THRESHOLDS.minSamples;

  if (hasFrames) {
    const fpsSeverity = severityFor(
      frames.frameP95Ms,
      PERF_THRESHOLDS.frameP95WarningMs,
      PERF_THRESHOLDS.frameP95ErrorMs,
    );
    if (fpsSeverity) {
      issues.push({
        id: 'lowFps',
        severity: fpsSeverity,
        values: {
          fps: round(frames.fps),
          refresh: frames.refreshHz,
          low: round(frames.fpsLow1),
        },
      });
    }

    const jankSeverity = severityFor(
      frames.jankRatio,
      PERF_THRESHOLDS.jankRatioWarning,
      PERF_THRESHOLDS.jankRatioError,
    );
    if (jankSeverity) {
      issues.push({
        id: 'frameSpikes',
        severity: jankSeverity,
        values: {
          percent: round(frames.jankRatio * 100, 1),
          p95: round(frames.frameP95Ms, 1),
          dropped: frames.droppedFrames,
        },
      });
    }

    if (frames.severeFrames > 0) {
      issues.push({
        id: 'freeze',
        severity: 'error',
        values: {
          count: frames.severeFrames,
          worst: round(frames.frameMaxMs),
          threshold: SEVERE_FRAME_MS,
        },
      });
    }
  }

  if (scroll.sampleCount >= PERF_THRESHOLDS.minSamples) {
    const scrollSeverity = severityFor(
      scroll.frameP95Ms,
      PERF_THRESHOLDS.frameP95WarningMs,
      PERF_THRESHOLDS.frameP95ErrorMs,
    );
    if (scrollSeverity) {
      issues.push({
        id: 'scrollJank',
        severity: scrollSeverity,
        values: {
          fps: round(scroll.fps),
          refresh: scroll.refreshHz,
          p95: round(scroll.frameP95Ms, 1),
        },
      });
    }
  }

  const longTaskSeverity = highestSeverity(
    severityFor(
      input.worstLongTaskMs,
      PERF_THRESHOLDS.longTaskWarningMs,
      PERF_THRESHOLDS.longTaskErrorMs,
    ),
    severityFor(
      input.longTaskMsPerMin,
      PERF_THRESHOLDS.longTaskMsPerMinWarning,
      PERF_THRESHOLDS.longTaskMsPerMinError,
    ),
  );
  if (longTaskSeverity) {
    issues.push({
      id: 'longTasks',
      severity: longTaskSeverity,
      values: {
        worst: round(input.worstLongTaskMs),
        perMinute: round(input.longTaskMsPerMin),
        source: input.worstLongTaskSource,
      },
    });
  }

  const inpSeverity = vitals.inpMs
    ? severityFor(vitals.inpMs, PERF_THRESHOLDS.inpWarningMs, PERF_THRESHOLDS.inpErrorMs)
    : undefined;
  const inputSeverity =
    inpSeverity ??
    severityFor(
      input.inputLatencyP95Ms,
      PERF_THRESHOLDS.inputLatencyWarningMs,
      PERF_THRESHOLDS.inputLatencyErrorMs,
    );
  if (inputSeverity) {
    issues.push({
      id: 'slowInput',
      severity: inputSeverity,
      values: {
        inp: vitals.inpMs ? round(vitals.inpMs) : 0,
        latency: round(input.inputLatencyP95Ms),
        target: vitals.inpTarget ?? vitals.inpType ?? '',
      },
    });
  }

  const clsSeverity = vitals.clsValue
    ? severityFor(vitals.clsValue, PERF_THRESHOLDS.clsWarning, PERF_THRESHOLDS.clsError)
    : undefined;
  if (clsSeverity) {
    issues.push({
      id: 'layoutShift',
      severity: clsSeverity,
      values: {
        cls: round(vitals.clsValue ?? 0, 3),
        target: vitals.clsTarget ?? '',
      },
    });
  }

  const lcpSeverity = vitals.lcpMs
    ? severityFor(vitals.lcpMs, PERF_THRESHOLDS.lcpWarningMs, PERF_THRESHOLDS.lcpErrorMs)
    : undefined;
  if (lcpSeverity) {
    issues.push({
      id: 'slowLcp',
      severity: lcpSeverity,
      values: {
        lcp: round((vitals.lcpMs ?? 0) / 1000, 2),
        element: vitals.lcpElement ?? '',
      },
    });
  }

  if (memory.supported) {
    const growthMbPerMin = memory.growthBytesPerMin / BYTES_PER_MB;
    const heapSeverity = severityFor(
      growthMbPerMin,
      PERF_THRESHOLDS.heapGrowthWarningMbPerMin,
      PERF_THRESHOLDS.heapGrowthErrorMbPerMin,
    );
    if (heapSeverity) {
      issues.push({
        id: 'heapGrowth',
        severity: heapSeverity,
        values: {
          growth: round(growthMbPerMin, 1),
          used: round(memory.usedBytes / BYTES_PER_MB),
          peak: round(memory.peakBytes / BYTES_PER_MB),
        },
      });
    }
  }

  const domSeverity = severityFor(
    dom.elements,
    PERF_THRESHOLDS.domElementsWarning,
    PERF_THRESHOLDS.domElementsError,
  );
  if (domSeverity) {
    issues.push({
      id: 'domBloat',
      severity: domSeverity,
      values: {
        elements: dom.elements,
        rows: dom.messageRows,
        code: dom.codeBlocks,
      },
    });
  }

  const domGrowthSeverity = severityFor(
    dom.growthPerMin,
    PERF_THRESHOLDS.domGrowthWarningPerMin,
    PERF_THRESHOLDS.domGrowthErrorPerMin,
  );
  if (domGrowthSeverity) {
    issues.push({
      id: 'domGrowth',
      severity: domGrowthSeverity,
      values: {
        growth: round(dom.growthPerMin),
        elements: dom.elements,
      },
    });
  }

  if (react.instrumented) {
    const reactSeverity = highestSeverity(
      severityFor(
        react.worstMs,
        PERF_THRESHOLDS.commitWorstWarningMs,
        PERF_THRESHOLDS.commitWorstErrorMs,
      ),
      severityFor(
        react.commitsPerSec,
        PERF_THRESHOLDS.commitsPerSecWarning,
        PERF_THRESHOLDS.commitsPerSecError,
      ),
    );
    if (reactSeverity) {
      issues.push({
        id: 'reactChurn',
        severity: reactSeverity,
        values: {
          rate: round(react.commitsPerSec, 1),
          worst: round(react.worstMs, 1),
          id: react.worstId,
        },
      });
    }
  }

  issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return issues;
}
