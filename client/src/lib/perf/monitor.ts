import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals/attribution';
import type {
  DomStats,
  PerfReport,
  FrameSpike,
  FrameStats,
  MemoryStats,
  InputSample,
  ShiftSample,
  TimelineRow,
  PerfSnapshot,
  LongTaskKind,
  LoadProbeResult,
  LongTaskSample,
  VitalsSnapshot,
  ReactCommitStats,
} from './types';
import type { FrameBuffer } from './frames';
import {
  pushFrame,
  snapRefreshHz,
  computeFrameStats,
  createFrameBuffer,
  emptyFrameStats,
  jankThresholdMs,
  resetFrameBuffer,
} from './frames';
import { collectPerfIssues } from './diagnostics';
import { formatPerfReport } from './report';

const EMIT_INTERVAL_MS = 500;
const LIVE_WINDOW_MS = 1000;
const WINDOW_MS = 5000;
const SCROLL_IDLE_MS = 180;
const ENVIRONMENT_INTERVAL_MS = 2000;
const LONG_TASK_WINDOW_MS = 60000;
const INPUT_WINDOW_MS = 30000;
const COMMIT_WINDOW_MS = 5000;
const MAX_EVENTS = 40;
const MAX_ENVIRONMENT_SAMPLES = 90;
const MAX_COMMITS = 400;
const MAX_SPIKES = 60;
const MAX_TIMELINE_ROWS = 3600;
const SPIKE_FLOOR_MS = 50;
const REFRESH_PROMOTION_VOTES = 2;
const MESSAGE_ROW_SELECTOR = '[data-testid="message-body"]';

type Listener = (snapshot: PerfSnapshot) => void;

interface PerformanceMemoryLike {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface LoafScript {
  duration: number;
  invoker?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
  forcedStyleAndLayoutDuration?: number;
}

interface LoafEntry extends PerformanceEntry {
  blockingDuration?: number;
  styleAndLayoutStart?: number;
  scripts?: LoafScript[];
}

interface TaskAttributionLike {
  containerType?: string;
  containerName?: string;
  containerId?: string;
  containerSrc?: string;
}

interface LongTaskEntry extends PerformanceEntry {
  attribution?: TaskAttributionLike[];
}

interface LayoutShiftSource {
  node?: Node | null;
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
  sources?: LayoutShiftSource[];
}

interface EnvironmentSample {
  time: number;
  elements: number;
  heapBytes: number;
  messageRows: number;
  codeBlocks: number;
  images: number;
}

interface CommitSample {
  time: number;
  durationMs: number;
  id: string;
}

declare global {
  interface Window {
    __lcPerf?: {
      monitor: PerfMonitor;
      report: (probe?: LoadProbeResult) => PerfReport;
      markdown: (probe?: LoadProbeResult) => string;
    };
  }
}

const EMPTY_DOM_STATS: DomStats = {
  elements: 0,
  peakElements: 0,
  growthPerMin: 0,
  messageRows: 0,
  codeBlocks: 0,
  images: 0,
};

const EMPTY_MEMORY_STATS: MemoryStats = {
  supported: false,
  usedBytes: 0,
  limitBytes: 0,
  peakBytes: 0,
  growthBytesPerMin: 0,
};

export function describeNode(node: EventTarget | Node | null | undefined): string {
  if (!node || !(node instanceof Element)) {
    return node instanceof Window ? 'window' : 'unknown';
  }
  const tag = node.tagName.toLowerCase();
  const testId = node.getAttribute('data-testid');
  if (testId) {
    return `${tag}[${testId}]`;
  }
  if (node.id) {
    return `${tag}#${node.id}`;
  }
  const label = node.getAttribute('aria-label');
  if (label) {
    return `${tag}[${label.slice(0, 24)}]`;
  }
  const className = typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : '';
  return className ? `${tag}.${className}` : tag;
}

export const PERF_HUD_ATTRIBUTE = 'data-perf-hud';

const HUD_SELECTOR = `[${PERF_HUD_ATTRIBUTE}]`;
const MAX_SELECTOR_CLASSES = 2;
const MAX_SELECTOR_LENGTH = 56;

export function shortenSelector(selector: string | undefined): string {
  if (!selector) {
    return '';
  }
  const leaf = selector.split('>').pop()?.trim() ?? '';
  const [tag, ...classes] = leaf.split('.');
  const short = [tag, ...classes.slice(0, MAX_SELECTOR_CLASSES)].filter(Boolean).join('.');
  return short.length > MAX_SELECTOR_LENGTH ? short.slice(0, MAX_SELECTOR_LENGTH) : short;
}

/** web-vitals hands back a selector string, so the only way to tell whether an
 *  interaction landed on the HUD is to resolve it. Reporting the panel's own
 *  controls would make the measuring tool the slowest thing on the page.
 *  Radix ids contain colons (`#radix-:r1vg:-trigger-load`), which are invalid
 *  in an unescaped CSS id selector, so `querySelector` throws on exactly the
 *  elements this needs to catch; fall back to an id lookup. */
function isHudSelector(selector: string | undefined): boolean {
  if (!selector) {
    return false;
  }
  const leaf = selector.split('>').pop()?.trim() ?? selector;
  let element: Element | null = null;
  try {
    element = document.querySelector(selector);
  } catch {
    element = leaf.startsWith('#') ? document.getElementById(leaf.slice(1)) : null;
  }
  return element?.closest(HUD_SELECTOR) != null;
}

function shortSource(url: string | undefined): string {
  if (!url) {
    return '';
  }
  const withoutQuery = url.split('?')[0];
  const segments = withoutQuery.split('/');
  return segments[segments.length - 1] || withoutQuery;
}

function trendPerMinute(
  samples: EnvironmentSample[],
  read: (s: EnvironmentSample) => number,
): number {
  const count = samples.length;
  if (count < 3) {
    return 0;
  }
  const firstTime = samples[0].time;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < count; i++) {
    const x = samples[i].time - firstTime;
    const y = read(samples[i]);
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denominator = count * sumXX - sumX * sumX;
  if (denominator === 0) {
    return 0;
  }
  return ((count * sumXY - sumX * sumY) / denominator) * 60000;
}

function percentileOf(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(ratio * (sorted.length - 1))));
  return sorted[index];
}

let vitalsRegistered = false;

class PerfMonitor {
  private readonly frames: FrameBuffer = createFrameBuffer();
  private readonly scrollFrames: FrameBuffer = createFrameBuffer(1024);
  private readonly listeners = new Set<Listener>();
  private readonly observers: PerformanceObserver[] = [];

  private longTasks: LongTaskSample[] = [];
  private inputs: InputSample[] = [];
  private shifts: ShiftSample[] = [];
  private spikes: FrameSpike[] = [];
  private commits: CommitSample[] = [];
  private environment: EnvironmentSample[] = [];
  private timeline: TimelineRow[] = [];

  private vitals: VitalsSnapshot = {};
  private snapshot: PerfSnapshot | null = null;
  private pendingInput: InputSample | null = null;

  private rafHandle = 0;
  private running = false;
  private started = false;
  private skipFrame = true;
  private lastFrameTime = 0;
  private lastEmit = 0;
  private lastEnvironment = 0;
  private scrollActiveUntil = 0;
  private refreshHz = 60;
  private pendingRefreshHz = 0;
  private pendingRefreshVotes = 0;
  private peakElements = 0;
  private peakHeapBytes = 0;
  private recordingStart = 0;
  private recordedMs = 0;
  private commitsInstrumented = false;
  private loafSupported = false;

  get isRunning(): boolean {
    return this.running;
  }

  get isRecording(): boolean {
    return this.recordingStart > 0;
  }

  get frameBuffer(): FrameBuffer {
    return this.frames;
  }

  get refreshRate(): number {
    return this.refreshHz;
  }

  start(): void {
    if (this.running || typeof window === 'undefined') {
      return;
    }
    this.running = true;
    this.skipFrame = true;
    this.lastFrameTime = 0;
    this.lastEmit = performance.now();
    this.lastEnvironment = 0;

    this.registerVitals();
    this.observe('long-animation-frame');
    if (!this.loafSupported) {
      this.observe('longtask');
    }
    this.observe('layout-shift');

    window.addEventListener('scroll', this.handleScroll, { capture: true, passive: true });
    window.addEventListener('pointerdown', this.handleInput, { capture: true, passive: true });
    window.addEventListener('keydown', this.handleInput, { capture: true, passive: true });
    window.addEventListener('wheel', this.handleInput, { capture: true, passive: true });
    document.addEventListener('visibilitychange', this.handleVisibility);

    this.rafHandle = requestAnimationFrame(this.tick);
    this.started = true;
    window.__lcPerf = {
      monitor: this,
      report: (probe?: LoadProbeResult) => this.buildReport(probe),
      markdown: (probe?: LoadProbeResult) => formatPerfReport(this.buildReport(probe)),
    };
  }

  stop(): void {
    this.stopRecording();
    if (!this.running) {
      return;
    }
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;

    for (let i = 0; i < this.observers.length; i++) {
      this.observers[i].disconnect();
    }
    this.observers.length = 0;

    window.removeEventListener('scroll', this.handleScroll, { capture: true });
    window.removeEventListener('pointerdown', this.handleInput, { capture: true });
    window.removeEventListener('keydown', this.handleInput, { capture: true });
    window.removeEventListener('wheel', this.handleInput, { capture: true });
    document.removeEventListener('visibilitychange', this.handleVisibility);
    delete window.__lcPerf;
  }

  reset(): void {
    resetFrameBuffer(this.frames);
    resetFrameBuffer(this.scrollFrames);
    this.longTasks = [];
    this.inputs = [];
    this.shifts = [];
    this.spikes = [];
    this.commits = [];
    this.environment = [];
    this.timeline = [];
    this.peakElements = 0;
    this.peakHeapBytes = 0;
    this.skipFrame = true;
    this.lastFrameTime = 0;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  startRecording(): void {
    this.timeline = [];
    this.recordedMs = 0;
    this.recordingStart = performance.now();
  }

  stopRecording(): void {
    if (this.recordingStart > 0) {
      this.recordedMs = performance.now() - this.recordingStart;
    }
    this.recordingStart = 0;
  }

  recordCommit(id: string, durationMs: number): void {
    this.commitsInstrumented = true;
    if (!this.running) {
      return;
    }
    this.commits.push({ time: performance.now(), durationMs, id });
    if (this.commits.length > MAX_COMMITS) {
      this.commits.shift();
    }
  }

  statsBetween(from: number, to: number): FrameStats {
    return computeFrameStats(this.frames, from, to, this.refreshHz);
  }

  longTaskMsBetween(from: number, to: number): number {
    let total = 0;
    for (let i = 0; i < this.longTasks.length; i++) {
      const task = this.longTasks[i];
      if (task.startTime >= from && task.startTime <= to) {
        total += task.durationMs;
      }
    }
    return total;
  }

  getSnapshot(): PerfSnapshot {
    if (!this.snapshot) {
      this.snapshot = this.buildSnapshot(performance.now());
    }
    return this.snapshot;
  }

  buildReport(probe?: LoadProbeResult): PerfReport {
    const snapshot = this.buildSnapshot(performance.now());
    const worstFrames = this.spikes
      .slice()
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10);
    return {
      createdAt: Date.now(),
      durationMs: snapshot.recordingMs,
      userAgent: navigator.userAgent,
      route: window.location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
      snapshot,
      timeline: this.timeline.slice(),
      worstFrames,
      probe,
    };
  }

  private registerVitals(): void {
    if (vitalsRegistered) {
      return;
    }
    vitalsRegistered = true;
    onLCP(
      (metric) => {
        this.vitals = {
          ...this.vitals,
          lcpMs: metric.value,
          lcpElement: shortenSelector(metric.attribution.element),
        };
      },
      { reportAllChanges: true },
    );
    onCLS(
      (metric) => {
        this.vitals = {
          ...this.vitals,
          clsValue: metric.value,
          clsTarget: shortenSelector(metric.attribution.largestShiftTarget),
        };
      },
      { reportAllChanges: true },
    );
    onINP(
      (metric) => {
        if (isHudSelector(metric.attribution.eventTarget)) {
          return;
        }
        this.vitals = {
          ...this.vitals,
          inpMs: metric.value,
          inpType: metric.attribution.eventType,
          inpTarget: shortenSelector(metric.attribution.eventTarget),
        };
      },
      { reportAllChanges: true },
    );
    onFCP((metric) => {
      this.vitals = { ...this.vitals, fcpMs: metric.value };
    });
    onTTFB((metric) => {
      this.vitals = { ...this.vitals, ttfbMs: metric.value };
    });
  }

  private observe(type: string): void {
    const supported = PerformanceObserver.supportedEntryTypes ?? [];
    if (!supported.includes(type)) {
      return;
    }
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (let i = 0; i < entries.length; i++) {
          this.handleEntry(type, entries[i]);
        }
      });
      observer.observe({ type, buffered: true });
      this.observers.push(observer);
      if (type === 'long-animation-frame') {
        this.loafSupported = true;
      }
    } catch {
      /* Entry type unsupported in this browser; the HUD degrades to frame sampling only. */
    }
  }

  private handleEntry(type: string, entry: PerformanceEntry): void {
    if (type === 'layout-shift') {
      const shift = entry as LayoutShiftEntry;
      if (shift.hadRecentInput || shift.value < 0.001) {
        return;
      }
      const node = shift.sources?.[0]?.node;
      if (node instanceof Element && node.closest(HUD_SELECTOR)) {
        return;
      }
      this.pushCapped(this.shifts, {
        startTime: shift.startTime,
        value: shift.value,
        source: describeNode(node),
      });
      return;
    }

    if (type === 'long-animation-frame') {
      const loaf = entry as LoafEntry;
      const scripts = loaf.scripts ?? [];
      let worst: LoafScript | undefined;
      for (let i = 0; i < scripts.length; i++) {
        if (!worst || scripts[i].duration > worst.duration) {
          worst = scripts[i];
        }
      }
      const styleAndLayoutMs = loaf.styleAndLayoutStart
        ? Math.max(0, loaf.startTime + loaf.duration - loaf.styleAndLayoutStart)
        : 0;
      this.pushLongTask({
        startTime: loaf.startTime,
        durationMs: loaf.duration,
        blockingMs: loaf.blockingDuration ?? 0,
        styleAndLayoutMs,
        source:
          worst?.sourceFunctionName ||
          worst?.invoker ||
          shortSource(worst?.sourceURL) ||
          (styleAndLayoutMs > loaf.duration / 2 ? 'style & layout' : 'unattributed'),
        kind: 'long-animation-frame',
      });
      return;
    }

    const task = entry as LongTaskEntry;
    const attribution = task.attribution?.[0];
    this.pushLongTask({
      startTime: task.startTime,
      durationMs: task.duration,
      blockingMs: Math.max(0, task.duration - 50),
      styleAndLayoutMs: 0,
      source:
        attribution?.containerName ||
        attribution?.containerId ||
        shortSource(attribution?.containerSrc) ||
        attribution?.containerType ||
        'unattributed',
      kind: 'longtask' as LongTaskKind,
    });
  }

  private pruneLongTasks(now: number): void {
    const cutoff = now - LONG_TASK_WINDOW_MS;
    while (this.longTasks.length > 0 && this.longTasks[0].startTime < cutoff) {
      this.longTasks.shift();
    }
  }

  private pushLongTask(sample: LongTaskSample): void {
    this.longTasks.push(sample);
    this.pruneLongTasks(performance.now());
  }

  private pushCapped<T>(list: T[], sample: T): void {
    list.push(sample);
    if (list.length > MAX_EVENTS) {
      list.shift();
    }
  }

  private handleScroll = (): void => {
    this.scrollActiveUntil = performance.now() + SCROLL_IDLE_MS;
  };

  private handleInput = (event: Event): void => {
    if (this.pendingInput) {
      return;
    }
    /** Clicking the HUD's own controls is not app latency, and reporting it
     *  would make the panel the slowest interaction on the page. */
    const target = event.target;
    if (target instanceof Element && target.closest(HUD_SELECTOR)) {
      return;
    }
    this.pendingInput = {
      startTime: event.timeStamp,
      type: event.type,
      target: describeNode(target),
      latencyMs: 0,
    };
  };

  private handleVisibility = (): void => {
    this.skipFrame = true;
    this.lastFrameTime = 0;
  };

  private tick = (now: number): void => {
    this.rafHandle = requestAnimationFrame(this.tick);

    const previous = this.lastFrameTime;
    this.lastFrameTime = now;

    if (this.skipFrame || previous === 0) {
      this.skipFrame = false;
    } else {
      const delta = now - previous;
      const scrolling = now <= this.scrollActiveUntil;
      pushFrame(this.frames, now, delta);
      if (scrolling) {
        pushFrame(this.scrollFrames, now, delta);
      }
      if (delta >= Math.max(SPIKE_FLOOR_MS, jankThresholdMs(1000 / this.refreshHz) * 2)) {
        this.recordSpike(now, delta, scrolling);
      }
      if (this.pendingInput && now > this.pendingInput.startTime) {
        this.pendingInput.latencyMs = now - this.pendingInput.startTime;
        this.pushCapped(this.inputs, this.pendingInput);
        this.pendingInput = null;
      }
    }

    if (now - this.lastEnvironment >= ENVIRONMENT_INTERVAL_MS) {
      this.lastEnvironment = now;
      this.sampleEnvironment(now);
    }

    if (now - this.lastEmit >= EMIT_INTERVAL_MS) {
      this.lastEmit = now;
      this.emit(now);
    }
  };

  private recordSpike(now: number, delta: number, scrolling: boolean): void {
    const frameStart = now - delta;
    let source = 'rendering or GC (no script attributed)';
    for (let i = this.longTasks.length - 1; i >= 0; i--) {
      const task = this.longTasks[i];
      if (task.startTime >= frameStart - 4 && task.startTime <= now) {
        source = task.source;
        break;
      }
    }
    this.spikes.push({ startTime: frameStart, durationMs: delta, scrolling, source });
    if (this.spikes.length > MAX_SPIKES) {
      let smallest = 0;
      for (let i = 1; i < this.spikes.length; i++) {
        if (this.spikes[i].durationMs < this.spikes[smallest].durationMs) {
          smallest = i;
        }
      }
      this.spikes.splice(smallest, 1);
    }
  }

  private sampleEnvironment(now: number): void {
    const hud = document.querySelector(HUD_SELECTOR);
    const hudElements = hud ? hud.getElementsByTagName('*').length + 1 : 0;
    const elements = document.getElementsByTagName('*').length - hudElements;
    const memory = (performance as Performance & { memory?: PerformanceMemoryLike }).memory;
    const heapBytes = memory?.usedJSHeapSize ?? 0;

    this.environment.push({
      time: now,
      elements,
      heapBytes,
      messageRows: document.querySelectorAll(MESSAGE_ROW_SELECTOR).length,
      codeBlocks: document.getElementsByTagName('pre').length,
      images: document.getElementsByTagName('img').length,
    });
    if (this.environment.length > MAX_ENVIRONMENT_SAMPLES) {
      this.environment.shift();
    }
    if (elements > this.peakElements) {
      this.peakElements = elements;
    }
    if (heapBytes > this.peakHeapBytes) {
      this.peakHeapBytes = heapBytes;
    }
  }

  private domStats(): DomStats {
    const latest = this.environment[this.environment.length - 1];
    if (!latest) {
      return EMPTY_DOM_STATS;
    }
    return {
      elements: latest.elements,
      peakElements: this.peakElements,
      growthPerMin: trendPerMinute(this.environment, (sample) => sample.elements),
      messageRows: latest.messageRows,
      codeBlocks: latest.codeBlocks,
      images: latest.images,
    };
  }

  private memoryStats(): MemoryStats {
    const memory = (performance as Performance & { memory?: PerformanceMemoryLike }).memory;
    if (!memory) {
      return EMPTY_MEMORY_STATS;
    }
    if (memory.usedJSHeapSize > this.peakHeapBytes) {
      this.peakHeapBytes = memory.usedJSHeapSize;
    }
    return {
      supported: true,
      usedBytes: memory.usedJSHeapSize,
      limitBytes: memory.jsHeapSizeLimit,
      peakBytes: this.peakHeapBytes,
      growthBytesPerMin: trendPerMinute(this.environment, (sample) => sample.heapBytes),
    };
  }

  private reactStats(now: number): ReactCommitStats {
    const from = now - COMMIT_WINDOW_MS;
    let commits = 0;
    let totalMs = 0;
    let worstMs = 0;
    let worstId = '';
    for (let i = this.commits.length - 1; i >= 0; i--) {
      const commit = this.commits[i];
      if (commit.time < from) {
        break;
      }
      commits += 1;
      totalMs += commit.durationMs;
      if (commit.durationMs > worstMs) {
        worstMs = commit.durationMs;
        worstId = commit.id;
      }
    }
    return {
      commits,
      commitsPerSec: (commits * 1000) / COMMIT_WINDOW_MS,
      totalMs,
      worstMs,
      worstId,
      instrumented: this.commitsInstrumented,
    };
  }

  private updateRefreshRate(window: FrameStats): void {
    if (window.sampleCount < 60) {
      return;
    }
    const candidate = snapRefreshHz(window.frameP05Ms, this.refreshHz);
    if (candidate <= this.refreshHz) {
      this.pendingRefreshVotes = 0;
      return;
    }
    if (candidate === this.pendingRefreshHz) {
      this.pendingRefreshVotes += 1;
    } else {
      this.pendingRefreshHz = candidate;
      this.pendingRefreshVotes = 1;
    }
    if (this.pendingRefreshVotes >= REFRESH_PROMOTION_VOTES) {
      this.refreshHz = candidate;
      this.pendingRefreshVotes = 0;
    }
  }

  private buildSnapshot(now: number): PerfSnapshot {
    const windowStats = this.running
      ? computeFrameStats(this.frames, now - WINDOW_MS, now, this.refreshHz)
      : emptyFrameStats(this.refreshHz);
    this.updateRefreshRate(windowStats);

    const live = this.running
      ? computeFrameStats(this.frames, now - LIVE_WINDOW_MS, now, this.refreshHz)
      : emptyFrameStats(this.refreshHz);
    const scroll = computeFrameStats(this.scrollFrames, now - WINDOW_MS * 2, now, this.refreshHz);
    this.pruneLongTasks(now);

    const inputCutoff = now - INPUT_WINDOW_MS;
    const latencies: number[] = [];
    for (let i = 0; i < this.inputs.length; i++) {
      if (this.inputs[i].startTime >= inputCutoff) {
        latencies.push(this.inputs[i].latencyMs);
      }
    }

    let longTaskTotal = 0;
    let recentSpan = 0;
    if (this.longTasks.length > 0) {
      const first = this.longTasks[0].startTime;
      recentSpan = Math.max(1000, now - first);
      for (let i = 0; i < this.longTasks.length; i++) {
        longTaskTotal += this.longTasks[i].durationMs;
      }
    }

    const dom = this.domStats();
    const memory = this.memoryStats();
    const react = this.reactStats(now);
    const longTaskMsPerMin = recentSpan > 0 ? (longTaskTotal / recentSpan) * 60000 : 0;
    const inputLatencyP95Ms = percentileOf(latencies, 0.95);

    let worstLongTaskMs = 0;
    let worstLongTaskSource = '';
    for (let i = 0; i < this.longTasks.length; i++) {
      if (this.longTasks[i].durationMs > worstLongTaskMs) {
        worstLongTaskMs = this.longTasks[i].durationMs;
        worstLongTaskSource = this.longTasks[i].source;
      }
    }

    const issues = collectPerfIssues({
      window: windowStats,
      scroll,
      longTaskMsPerMin,
      worstLongTaskMs,
      worstLongTaskSource,
      inputLatencyP95Ms,
      vitals: this.vitals,
      memory,
      dom,
      react,
    });

    return {
      time: now,
      running: this.running,
      scrolling: now <= this.scrollActiveUntil,
      live,
      window: windowStats,
      scroll,
      vitals: this.vitals,
      memory,
      dom,
      react,
      longTasks: this.longTasks.slice(-12).reverse(),
      inputs: this.inputs.slice(-12).reverse(),
      shifts: this.shifts.slice(-8).reverse(),
      longTaskMsPerMin,
      inputLatencyP95Ms,
      issues,
      recordingMs: this.recordingStart > 0 ? now - this.recordingStart : this.recordedMs,
      loafSupported: this.loafSupported,
    };
  }

  private emit(now: number): void {
    const snapshot = this.buildSnapshot(now);
    this.snapshot = snapshot;

    if (this.recordingStart > 0 && this.timeline.length < MAX_TIMELINE_ROWS) {
      let commitMs = 0;
      for (let i = this.commits.length - 1; i >= 0; i--) {
        if (this.commits[i].time < now - EMIT_INTERVAL_MS) {
          break;
        }
        commitMs += this.commits[i].durationMs;
      }
      this.timeline.push({
        time: now - this.recordingStart,
        fps: snapshot.live.fps,
        frameP95Ms: snapshot.live.frameP95Ms,
        jankFrames: snapshot.live.jankFrames,
        droppedFrames: snapshot.live.droppedFrames,
        elements: snapshot.dom.elements,
        heapBytes: snapshot.memory.usedBytes,
        commitMs,
      });
    }

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        /* A failing HUD subscriber must never break the sampling loop. */
      }
    }
  }

  get hasStarted(): boolean {
    return this.started;
  }
}

export const perfMonitor = new PerfMonitor();
export type { PerfMonitor };
