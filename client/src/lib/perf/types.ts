export type PerfIssueSeverity = 'info' | 'warning' | 'error';

export type PerfIssueId =
  | 'lowFps'
  | 'scrollJank'
  | 'frameSpikes'
  | 'freeze'
  | 'longTasks'
  | 'slowInput'
  | 'layoutShift'
  | 'heapGrowth'
  | 'domBloat'
  | 'domGrowth'
  | 'reactChurn'
  | 'slowLcp';

export type PerfIssueValues = Record<string, string | number>;

export interface PerfIssue {
  id: PerfIssueId;
  severity: PerfIssueSeverity;
  values: PerfIssueValues;
}

export interface FrameStats {
  sampleCount: number;
  elapsedMs: number;
  refreshHz: number;
  budgetMs: number;
  fps: number;
  frameMeanMs: number;
  frameP05Ms: number;
  frameP50Ms: number;
  frameP95Ms: number;
  frameP99Ms: number;
  frameMaxMs: number;
  fpsLow1: number;
  jankFrames: number;
  jankRatio: number;
  severeFrames: number;
  droppedFrames: number;
}

export type LongTaskKind = 'long-animation-frame' | 'longtask';

export interface LongTaskSample {
  startTime: number;
  durationMs: number;
  blockingMs: number;
  styleAndLayoutMs: number;
  source: string;
  kind: LongTaskKind;
}

export interface InputSample {
  startTime: number;
  type: string;
  latencyMs: number;
  target: string;
}

export interface ShiftSample {
  startTime: number;
  value: number;
  source: string;
}

export interface VitalsSnapshot {
  lcpMs?: number;
  lcpElement?: string;
  fcpMs?: number;
  ttfbMs?: number;
  clsValue?: number;
  clsTarget?: string;
  inpMs?: number;
  inpType?: string;
  inpTarget?: string;
}

export interface MemoryStats {
  supported: boolean;
  usedBytes: number;
  limitBytes: number;
  peakBytes: number;
  growthBytesPerMin: number;
}

export interface DomStats {
  elements: number;
  peakElements: number;
  growthPerMin: number;
  messageRows: number;
  codeBlocks: number;
  images: number;
}

export interface ReactCommitStats {
  commits: number;
  commitsPerSec: number;
  totalMs: number;
  worstMs: number;
  worstId: string;
  instrumented: boolean;
}

export interface PerfSnapshot {
  time: number;
  running: boolean;
  scrolling: boolean;
  live: FrameStats;
  window: FrameStats;
  scroll: FrameStats;
  vitals: VitalsSnapshot;
  memory: MemoryStats;
  dom: DomStats;
  react: ReactCommitStats;
  longTasks: LongTaskSample[];
  inputs: InputSample[];
  shifts: ShiftSample[];
  longTaskMsPerMin: number;
  inputLatencyP95Ms: number;
  issues: PerfIssue[];
  recordingMs: number;
  loafSupported: boolean;
}

export interface TimelineRow {
  time: number;
  fps: number;
  frameP95Ms: number;
  jankFrames: number;
  droppedFrames: number;
  elements: number;
  heapBytes: number;
  commitMs: number;
}

export interface LoadProbePass {
  pass: number;
  label: string;
  elements: number;
  items: number;
  scrolledPx: number;
  longTaskMs: number;
  frames: FrameStats;
  grew: boolean;
}

export interface LoadProbeVerdict {
  fpsFirst: number;
  fpsLast: number;
  fpsDropRatio: number;
  elementsFirst: number;
  elementsLast: number;
  elementsGrowthRatio: number;
  worstFrameMs: number;
  droppedFrames: number;
  degrades: boolean;
  recycles: boolean;
}

export interface LoadProbeResult {
  targetLabel: string;
  passes: LoadProbePass[];
  verdict: LoadProbeVerdict;
  aborted: boolean;
}

export interface FrameSpike {
  startTime: number;
  durationMs: number;
  scrolling: boolean;
  source: string;
}

export interface PerfReport {
  createdAt: number;
  durationMs: number;
  userAgent: string;
  route: string;
  viewport: string;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  snapshot: PerfSnapshot;
  timeline: TimelineRow[];
  worstFrames: FrameSpike[];
  probe?: LoadProbeResult;
}
