import type { PerfReport, PerfSnapshot } from './types';
import { formatPerfReport } from './report';
import { emptyFrameStats } from './frames';

function snapshot(): PerfSnapshot {
  return {
    time: 12000,
    running: true,
    scrolling: false,
    live: { ...emptyFrameStats(60), sampleCount: 60, fps: 42 },
    window: { ...emptyFrameStats(60), sampleCount: 300, fps: 38, frameP95Ms: 41, frameMaxMs: 180 },
    scroll: { ...emptyFrameStats(60), sampleCount: 120, fps: 27, frameP95Ms: 52 },
    vitals: {
      lcpMs: 3100,
      clsValue: 0.24,
      clsTarget: 'div.message',
      inpMs: 260,
      inpType: 'keydown',
    },
    memory: {
      supported: true,
      usedBytes: 512 * 1024 * 1024,
      limitBytes: 4096 * 1024 * 1024,
      peakBytes: 600 * 1024 * 1024,
      growthBytesPerMin: 30 * 1024 * 1024,
    },
    dom: {
      elements: 18400,
      peakElements: 18400,
      growthPerMin: 5200,
      messageRows: 412,
      codeBlocks: 61,
      images: 9,
    },
    react: {
      commits: 120,
      commitsPerSec: 24,
      totalMs: 640,
      worstMs: 96,
      worstId: 'app',
      instrumented: true,
    },
    longTasks: [
      {
        startTime: 900,
        durationMs: 240,
        blockingMs: 190,
        styleAndLayoutMs: 60,
        source: 'highlightAuto',
        kind: 'long-animation-frame',
      },
    ],
    inputs: [{ startTime: 1000, type: 'keydown', latencyMs: 180, target: 'textarea' }],
    shifts: [{ startTime: 800, value: 0.21, source: 'div.message' }],
    longTaskMsPerMin: 2400,
    inputLatencyP95Ms: 180,
    issues: [
      { id: 'lowFps', severity: 'error', values: { fps: 38, refresh: 60, low: 12 } },
      { id: 'domBloat', severity: 'warning', values: { elements: 18400, rows: 412, code: 61 } },
    ],
    recordingMs: 12000,
    loafSupported: true,
  };
}

function report(): PerfReport {
  return {
    createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    durationMs: 12000,
    userAgent: 'jest',
    route: '/c/abc',
    viewport: '1512x982',
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    snapshot: snapshot(),
    timeline: [
      {
        time: 0,
        fps: 58,
        frameP95Ms: 18,
        jankFrames: 0,
        droppedFrames: 0,
        elements: 3000,
        heapBytes: 1024,
        commitMs: 4,
      },
      {
        time: 500,
        fps: 31,
        frameP95Ms: 48,
        jankFrames: 9,
        droppedFrames: 14,
        elements: 12000,
        heapBytes: 2048,
        commitMs: 41,
      },
    ],
    worstFrames: [{ startTime: 900, durationMs: 240, scrolling: true, source: 'highlightAuto' }],
    probe: {
      targetLabel: 'div.messages',
      aborted: false,
      passes: [
        {
          pass: 1,
          label: 'div.messages',
          elements: 3000,
          items: 2800,
          scrolledPx: 4000,
          longTaskMs: 120,
          frames: { ...emptyFrameStats(60), sampleCount: 200, fps: 58, frameP95Ms: 18 },
          grew: true,
        },
        {
          pass: 2,
          label: 'div.messages',
          elements: 15000,
          items: 14500,
          scrolledPx: 9000,
          longTaskMs: 900,
          frames: { ...emptyFrameStats(60), sampleCount: 200, fps: 29, frameP95Ms: 52 },
          grew: true,
        },
      ],
      verdict: {
        fpsFirst: 58,
        fpsLast: 29,
        fpsDropRatio: 0.5,
        elementsFirst: 3000,
        elementsLast: 15000,
        elementsGrowthRatio: 5,
        worstFrameMs: 240,
        droppedFrames: 96,
        degrades: true,
        recycles: false,
      },
    },
  };
}

describe('formatPerfReport', () => {
  it('includes every diagnostic section a bug report needs', () => {
    const markdown = formatPerfReport(report());

    expect(markdown).toContain('# LibreChat performance report');
    expect(markdown).toContain('- Route: /c/abc');
    expect(markdown).toContain('## Frames');
    expect(markdown).toContain('## Web vitals');
    expect(markdown).toContain('## Data scale');
    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('## Worst frames');
    expect(markdown).toContain('## Recent long tasks');
    expect(markdown).toContain('## Load test');
    expect(markdown).toContain('## Timeline');
  });

  it('reports frame rate against the detected display rate', () => {
    const markdown = formatPerfReport(report());

    expect(markdown).toContain('| last 5 s FPS | 38.0 of 60 Hz |');
    expect(markdown).toContain('| scrolling FPS | 27.0 of 60 Hz |');
  });

  it('names the findings and their attribution', () => {
    const markdown = formatPerfReport(report());

    expect(markdown).toContain('- **error** lowFps: fps=38, refresh=60, low=12');
    expect(markdown).toContain('highlightAuto');
    expect(markdown).toContain('| CLS | 0.240 | div.message |');
  });

  it('states the load test verdict in plain terms', () => {
    const markdown = formatPerfReport(report());

    expect(markdown).toContain('FPS 58.0 to 29.0 (50% drop)');
    expect(markdown).toContain('Rendering degrades as data grows');
  });

  it('does not classify an aborted load test as stable or degraded', () => {
    const stopped = report();
    stopped.probe!.aborted = true;

    const markdown = formatPerfReport(stopped);

    expect(markdown).toContain('Verdict: unavailable');
    expect(markdown).not.toContain('Rendering held up');
    expect(markdown).not.toContain('Rendering degrades');
  });

  it('does not classify a load test without frame samples', () => {
    const unsampled = report();
    unsampled.probe!.passes[0].frames = emptyFrameStats(60);

    const markdown = formatPerfReport(unsampled);

    expect(markdown).toContain('Verdict: unavailable');
    expect(markdown).not.toContain('Rendering held up');
    expect(markdown).not.toContain('Rendering degrades');
  });

  it('does not classify a load test with no passes', () => {
    const empty = report();
    empty.probe!.passes = [];

    const markdown = formatPerfReport(empty);

    expect(markdown).toContain('Verdict: unavailable');
    expect(markdown).not.toContain('Rendering held up');
    expect(markdown).not.toContain('Rendering degrades');
  });

  it('emits a machine readable timeline', () => {
    const markdown = formatPerfReport(report());

    expect(markdown).toContain('seconds,fps,frame_p95_ms,jank_frames,dropped_frames');
    expect(markdown).toContain('0.5,31.0,48.0,9,14,12000,2048,41.0');
  });

  it('does not blame growth when the DOM never grew', () => {
    const heavy = report();
    heavy.probe = {
      targetLabel: 'div.messages',
      aborted: false,
      passes: [
        {
          pass: 1,
          label: 'div.messages',
          elements: 38092,
          items: 36803,
          scrolledPx: 257997,
          longTaskMs: 0,
          frames: { ...emptyFrameStats(240), sampleCount: 900, fps: 63.3, frameP95Ms: 29.2 },
          grew: false,
        },
      ],
      verdict: {
        fpsFirst: 63.3,
        fpsLast: 63.3,
        fpsDropRatio: 0,
        elementsFirst: 38092,
        elementsLast: 38092,
        elementsGrowthRatio: 1,
        worstFrameMs: 46,
        droppedFrames: 2208,
        degrades: true,
        recycles: false,
      },
    };

    const markdown = formatPerfReport(heavy);

    expect(markdown).toContain('swept once at 63.3 FPS with 38092 elements live');
    expect(markdown).toContain('standing cost rather than growth');
    expect(markdown).not.toContain('degrades as data grows');
  });

  it('says plainly when nothing was recorded', () => {
    const live = report();
    live.durationMs = 0;

    expect(formatPerfReport(live)).toContain('- Recorded: not recording, this is a live snapshot');
  });

  it('omits optional sections when nothing was captured', () => {
    const bare = report();
    bare.probe = undefined;
    bare.timeline = [];
    bare.worstFrames = [];
    bare.snapshot.issues = [];
    bare.snapshot.longTasks = [];
    bare.snapshot.shifts = [];

    const markdown = formatPerfReport(bare);

    expect(markdown).not.toContain('## Load test');
    expect(markdown).not.toContain('## Timeline');
    expect(markdown).not.toContain('## Worst frames');
    expect(markdown).toContain('No performance issues detected at current thresholds.');
  });
});
