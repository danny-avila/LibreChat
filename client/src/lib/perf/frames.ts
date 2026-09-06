import type { FrameStats } from './types';

/** Retains the complete default 12.9 s load probe at the supported 240 Hz rate. */
export const FRAME_CAPACITY = 4096;
export const JANK_FLOOR_MS = 24;
export const SEVERE_FRAME_MS = 100;
export const MAX_FRAME_DELTA_MS = 5000;
export const MIN_REFRESH_SAMPLES = 24;

const REFRESH_CANDIDATES = [60, 75, 90, 100, 120, 144, 165, 240];

export interface FrameBuffer {
  deltas: Float32Array;
  times: Float64Array;
  scratch: Float64Array;
  capacity: number;
  writeIndex: number;
  size: number;
}

export function createFrameBuffer(capacity: number = FRAME_CAPACITY): FrameBuffer {
  return {
    deltas: new Float32Array(capacity),
    times: new Float64Array(capacity),
    scratch: new Float64Array(capacity),
    capacity,
    writeIndex: 0,
    size: 0,
  };
}

export function resetFrameBuffer(buffer: FrameBuffer): void {
  buffer.writeIndex = 0;
  buffer.size = 0;
}

export function pushFrame(buffer: FrameBuffer, time: number, delta: number): void {
  if (!(delta > 0)) {
    return;
  }
  const index = buffer.writeIndex;
  buffer.deltas[index] = delta > MAX_FRAME_DELTA_MS ? MAX_FRAME_DELTA_MS : delta;
  buffer.times[index] = time;
  buffer.writeIndex = index + 1 === buffer.capacity ? 0 : index + 1;
  if (buffer.size < buffer.capacity) {
    buffer.size += 1;
  }
}

function fillWindow(buffer: FrameBuffer, from: number, to: number): number {
  const { capacity, size, times, deltas, scratch } = buffer;
  let count = 0;
  for (let step = 1; step <= size; step++) {
    let index = buffer.writeIndex - step;
    if (index < 0) {
      index += capacity;
    }
    const time = times[index];
    if (time < from) {
      break;
    }
    if (time > to) {
      continue;
    }
    scratch[count] = deltas[index];
    count += 1;
  }
  return count;
}

function quantile(sorted: Float64Array, count: number, ratio: number): number {
  if (count === 0) {
    return 0;
  }
  const index = Math.round(ratio * (count - 1));
  return sorted[Math.min(count - 1, Math.max(0, index))];
}

export function snapRefreshHz(frameP05Ms: number, fallbackHz: number): number {
  if (!(frameP05Ms > 0)) {
    return fallbackHz;
  }
  let best = REFRESH_CANDIDATES[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < REFRESH_CANDIDATES.length; i++) {
    const candidate = REFRESH_CANDIDATES[i];
    const distance = Math.abs(1000 / candidate - frameP05Ms);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

export function jankThresholdMs(budgetMs: number): number {
  const scaled = budgetMs * 1.5;
  return scaled > JANK_FLOOR_MS ? scaled : JANK_FLOOR_MS;
}

export function emptyFrameStats(refreshHz: number): FrameStats {
  return {
    sampleCount: 0,
    elapsedMs: 0,
    refreshHz,
    budgetMs: 1000 / refreshHz,
    fps: 0,
    frameMeanMs: 0,
    frameP05Ms: 0,
    frameP50Ms: 0,
    frameP95Ms: 0,
    frameP99Ms: 0,
    frameMaxMs: 0,
    fpsLow1: 0,
    jankFrames: 0,
    jankRatio: 0,
    severeFrames: 0,
    droppedFrames: 0,
  };
}

export function computeFrameStats(
  buffer: FrameBuffer,
  from: number,
  to: number,
  refreshHz: number,
): FrameStats {
  const count = fillWindow(buffer, from, to);
  if (count === 0) {
    return emptyFrameStats(refreshHz);
  }

  const samples = buffer.scratch.subarray(0, count);
  samples.sort();

  const budgetMs = 1000 / refreshHz;
  const jankLimit = jankThresholdMs(budgetMs);
  let total = 0;
  let jankFrames = 0;
  let severeFrames = 0;
  let droppedFrames = 0;

  for (let i = 0; i < count; i++) {
    const delta = samples[i];
    total += delta;
    if (delta >= jankLimit) {
      jankFrames += 1;
    }
    if (delta >= SEVERE_FRAME_MS) {
      severeFrames += 1;
    }
    const missed = Math.round(delta / budgetMs) - 1;
    if (missed > 0) {
      droppedFrames += missed;
    }
  }

  const frameMeanMs = total / count;
  const frameP99Ms = quantile(samples, count, 0.99);

  return {
    sampleCount: count,
    elapsedMs: total,
    refreshHz,
    budgetMs,
    fps: 1000 / frameMeanMs,
    frameMeanMs,
    frameP05Ms: quantile(samples, count, 0.05),
    frameP50Ms: quantile(samples, count, 0.5),
    frameP95Ms: quantile(samples, count, 0.95),
    frameP99Ms,
    frameMaxMs: samples[count - 1],
    fpsLow1: frameP99Ms > 0 ? 1000 / frameP99Ms : 0,
    jankFrames,
    jankRatio: jankFrames / count,
    severeFrames,
    droppedFrames,
  };
}

export function readFrameTrace(buffer: FrameBuffer, limit: number, out: Float64Array): number {
  const { capacity, size, deltas } = buffer;
  const wanted = Math.min(limit, size, out.length);
  for (let i = 0; i < wanted; i++) {
    let index = buffer.writeIndex - wanted + i;
    while (index < 0) {
      index += capacity;
    }
    out[i] = deltas[index % capacity];
  }
  return wanted;
}
