import type { FrameStats, PerfIssueId } from './types';
import type { DiagnosticsInput } from './diagnostics';
import { collectPerfIssues, PERF_THRESHOLDS } from './diagnostics';
import { emptyFrameStats } from './frames';

function frames(overrides: Partial<FrameStats> = {}): FrameStats {
  return { ...emptyFrameStats(60), sampleCount: 300, fps: 60, ...overrides };
}

function input(overrides: Partial<DiagnosticsInput> = {}): DiagnosticsInput {
  return {
    window: frames(),
    scroll: frames(),
    longTaskMsPerMin: 0,
    worstLongTaskMs: 0,
    worstLongTaskSource: '',
    inputLatencyP95Ms: 0,
    vitals: {},
    memory: {
      supported: true,
      usedBytes: 100 * 1024 * 1024,
      limitBytes: 4096 * 1024 * 1024,
      peakBytes: 100 * 1024 * 1024,
      growthBytesPerMin: 0,
    },
    dom: {
      elements: 1200,
      peakElements: 1200,
      growthPerMin: 0,
      messageRows: 20,
      codeBlocks: 2,
      images: 1,
    },
    react: {
      commits: 0,
      commitsPerSec: 0,
      totalMs: 0,
      worstMs: 0,
      worstId: '',
      instrumented: true,
    },
    ...overrides,
  };
}

function ids(overrides: Partial<DiagnosticsInput> = {}): PerfIssueId[] {
  return collectPerfIssues(input(overrides)).map((issue) => issue.id);
}

describe('collectPerfIssues', () => {
  it('reports nothing for a healthy session', () => {
    expect(collectPerfIssues(input())).toEqual([]);
  });

  it('ignores frame metrics until enough frames were sampled', () => {
    expect(ids({ window: frames({ sampleCount: 5, fps: 10 }) })).toEqual([]);
  });

  it('escalates on how long frames take, not on the share of refresh reached', () => {
    const warning = collectPerfIssues(input({ window: frames({ fps: 40, frameP95Ms: 30 }) }));
    const error = collectPerfIssues(input({ window: frames({ fps: 18, frameP95Ms: 60 }) }));

    expect(warning[0]).toMatchObject({ id: 'lowFps', severity: 'warning' });
    expect(error[0]).toMatchObject({ id: 'lowFps', severity: 'error' });
    expect(error[0].values).toMatchObject({ fps: 18, refresh: 60 });
  });

  /* A 240 Hz panel has a 4.2 ms budget, so judging smoothness as a fraction of
     refresh called 117 FPS with a 16.6 ms p95 and zero janky frames an error,
     directly contradicting the jank metric beside it. */
  it('calls a high-refresh display smooth when frames are inside a 60 Hz budget', () => {
    const highRefresh = frames({
      refreshHz: 240,
      budgetMs: 1000 / 240,
      fps: 117,
      fpsLow1: 60,
      frameP50Ms: 8.3,
      frameP95Ms: 16.6,
      frameMaxMs: 20.9,
      jankFrames: 0,
      jankRatio: 0,
      sampleCount: 346,
    });

    expect(collectPerfIssues(input({ window: highRefresh, scroll: highRefresh }))).toEqual([]);
  });

  it('flags a frozen frame as critical', () => {
    const issues = collectPerfIssues(
      input({ window: frames({ severeFrames: 2, frameMaxMs: 420 }) }),
    );

    expect(issues.some((issue) => issue.id === 'freeze' && issue.severity === 'error')).toBe(true);
  });

  it('separates scroll jank from overall frame rate', () => {
    expect(ids({ scroll: frames({ fps: 28, frameP95Ms: 55 }) })).toContain('scrollJank');
  });

  it('attributes the worst long task', () => {
    const issues = collectPerfIssues(
      input({
        worstLongTaskMs: 320,
        longTaskMsPerMin: 900,
        worstLongTaskSource: 'renderMarkdown',
      }),
    );
    const longTasks = issues.find((issue) => issue.id === 'longTasks');

    expect(longTasks).toMatchObject({ severity: 'error' });
    expect(longTasks?.values.source).toBe('renderMarkdown');
  });

  it('keeps the aggregate long-task error when the worst task is only a warning', () => {
    const issues = collectPerfIssues(
      input({
        worstLongTaskMs: PERF_THRESHOLDS.longTaskWarningMs,
        longTaskMsPerMin: PERF_THRESHOLDS.longTaskMsPerMinError,
      }),
    );

    expect(issues.find((issue) => issue.id === 'longTasks')).toMatchObject({ severity: 'error' });
  });

  it('keeps the aggregate React error when the worst commit is only a warning', () => {
    const issues = collectPerfIssues(
      input({
        react: {
          commits: 200,
          commitsPerSec: PERF_THRESHOLDS.commitsPerSecError,
          totalMs: 900,
          worstMs: PERF_THRESHOLDS.commitWorstWarningMs,
          worstId: 'app',
          instrumented: true,
        },
      }),
    );

    expect(issues.find((issue) => issue.id === 'reactChurn')).toMatchObject({ severity: 'error' });
  });

  it('prefers the measured INP when reporting slow interactions', () => {
    const issues = collectPerfIssues(
      input({ vitals: { inpMs: 640, inpTarget: 'button.send' }, inputLatencyP95Ms: 20 }),
    );

    expect(issues.find((issue) => issue.id === 'slowInput')).toMatchObject({
      severity: 'error',
      values: { inp: 640, target: 'button.send' },
    });
  });

  it('detects an unbounded list from element count and growth together', () => {
    const issues = ids({
      dom: {
        elements: PERF_THRESHOLDS.domElementsError + 1,
        peakElements: 20000,
        growthPerMin: PERF_THRESHOLDS.domGrowthErrorPerMin + 1,
        messageRows: 400,
        codeBlocks: 60,
        images: 12,
      },
    });

    expect(issues).toContain('domBloat');
    expect(issues).toContain('domGrowth');
  });

  it('only reports heap growth when the browser exposes memory', () => {
    const growing = {
      supported: true,
      usedBytes: 800 * 1024 * 1024,
      limitBytes: 4096 * 1024 * 1024,
      peakBytes: 800 * 1024 * 1024,
      growthBytesPerMin: 40 * 1024 * 1024,
    };

    expect(ids({ memory: growing })).toContain('heapGrowth');
    expect(ids({ memory: { ...growing, supported: false } })).not.toContain('heapGrowth');
  });

  it('only reports React churn when the profiler is wired up', () => {
    const react = {
      commits: 200,
      commitsPerSec: 40,
      totalMs: 900,
      worstMs: 120,
      worstId: 'app',
      instrumented: true,
    };

    expect(ids({ react })).toContain('reactChurn');
    expect(ids({ react: { ...react, instrumented: false } })).not.toContain('reactChurn');
  });

  it('sorts critical findings ahead of warnings', () => {
    const issues = collectPerfIssues(
      input({
        window: frames({ fps: 52, jankRatio: 0.2, jankFrames: 60 }),
        vitals: { clsValue: 0.15 },
      }),
    );

    expect(issues.length).toBeGreaterThan(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[issues.length - 1].severity).toBe('warning');
  });
});
