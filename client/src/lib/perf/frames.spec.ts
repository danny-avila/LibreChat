import type { FrameBuffer } from './frames';
import {
  pushFrame,
  snapRefreshHz,
  readFrameTrace,
  jankThresholdMs,
  computeFrameStats,
  createFrameBuffer,
  resetFrameBuffer,
  SEVERE_FRAME_MS,
  MAX_FRAME_DELTA_MS,
  FRAME_CAPACITY,
} from './frames';

function fillSteady(buffer: FrameBuffer, count: number, deltaMs: number, startTime = 0): number {
  let time = startTime;
  for (let i = 0; i < count; i++) {
    time += deltaMs;
    pushFrame(buffer, time, deltaMs);
  }
  return time;
}

describe('computeFrameStats', () => {
  it('reports the display rate for a steady 60 Hz stream', () => {
    const buffer = createFrameBuffer(256);
    const end = fillSteady(buffer, 120, 1000 / 60);

    const stats = computeFrameStats(buffer, 0, end, 60);

    expect(stats.sampleCount).toBe(120);
    expect(stats.fps).toBeCloseTo(60, 5);
    expect(stats.fpsLow1).toBeCloseTo(60, 5);
    expect(stats.jankFrames).toBe(0);
    expect(stats.droppedFrames).toBe(0);
    expect(stats.severeFrames).toBe(0);
    expect(stats.jankRatio).toBe(0);
  });

  it('retains a complete 12.9 second probe at 240 Hz with the default buffer', () => {
    const buffer = createFrameBuffer();
    const sampleCount = Math.ceil((12_900 / 1000) * 240);
    const end = fillSteady(buffer, sampleCount, 1000 / 240);

    expect(FRAME_CAPACITY).toBeGreaterThanOrEqual(sampleCount);
    expect(computeFrameStats(buffer, 0, end, 240).sampleCount).toBe(sampleCount);
  });

  it('counts dropped vsyncs and severe frames for a long frame', () => {
    const buffer = createFrameBuffer(256);
    let time = fillSteady(buffer, 59, 1000 / 60);
    time += 100;
    pushFrame(buffer, time, 100);

    const stats = computeFrameStats(buffer, 0, time, 60);

    expect(stats.sampleCount).toBe(60);
    expect(stats.frameMaxMs).toBe(100);
    expect(stats.severeFrames).toBe(1);
    expect(stats.jankFrames).toBe(1);
    expect(stats.droppedFrames).toBe(5);
    expect(stats.fps).toBeLessThan(60);
  });

  it('reports the 1% low from the worst percentile of the window', () => {
    const buffer = createFrameBuffer(256);
    let time = fillSteady(buffer, 98, 1000 / 60);
    for (let i = 0; i < 2; i++) {
      time += 100;
      pushFrame(buffer, time, 100);
    }

    const stats = computeFrameStats(buffer, 0, time, 60);

    expect(stats.sampleCount).toBe(100);
    expect(stats.fpsLow1).toBeCloseTo(10, 5);
    expect(stats.frameP50Ms).toBeCloseTo(1000 / 60, 3);
  });

  it('only measures frames inside the requested window', () => {
    const buffer = createFrameBuffer(256);
    fillSteady(buffer, 30, 50, 0);
    const end = fillSteady(buffer, 30, 1000 / 60, 1500);

    const stats = computeFrameStats(buffer, 1501, end, 60);

    expect(stats.sampleCount).toBe(30);
    expect(stats.frameMaxMs).toBeCloseTo(1000 / 60, 3);
  });

  it('returns an empty result when the window holds no samples', () => {
    const buffer = createFrameBuffer(64);
    fillSteady(buffer, 10, 16, 0);

    const stats = computeFrameStats(buffer, 10000, 20000, 120);

    expect(stats.sampleCount).toBe(0);
    expect(stats.fps).toBe(0);
    expect(stats.refreshHz).toBe(120);
    expect(stats.budgetMs).toBeCloseTo(1000 / 120, 5);
  });

  it('keeps only the most recent samples once the ring buffer wraps', () => {
    const buffer = createFrameBuffer(8);
    const end = fillSteady(buffer, 20, 10);

    const stats = computeFrameStats(buffer, 0, end, 60);

    expect(stats.sampleCount).toBe(8);
  });

  it('clamps pathological deltas so one stall cannot poison the window', () => {
    const buffer = createFrameBuffer(16);
    pushFrame(buffer, 100, MAX_FRAME_DELTA_MS * 4);
    pushFrame(buffer, 200, -5);

    const stats = computeFrameStats(buffer, 0, 300, 60);

    expect(stats.sampleCount).toBe(1);
    expect(stats.frameMaxMs).toBe(MAX_FRAME_DELTA_MS);
  });

  it('drops every sample after a reset', () => {
    const buffer = createFrameBuffer(32);
    const end = fillSteady(buffer, 20, 16);
    resetFrameBuffer(buffer);

    expect(computeFrameStats(buffer, 0, end, 60).sampleCount).toBe(0);
  });
});

describe('snapRefreshHz', () => {
  it('snaps observed frame periods to the nearest display rate', () => {
    expect(snapRefreshHz(1000 / 60, 60)).toBe(60);
    expect(snapRefreshHz(8.4, 60)).toBe(120);
    expect(snapRefreshHz(6.9, 60)).toBe(144);
    expect(snapRefreshHz(4.1, 60)).toBe(240);
  });

  it('never guesses below the slowest candidate for a slow stream', () => {
    expect(snapRefreshHz(33, 60)).toBe(60);
  });

  it('keeps the current rate when no period was measured', () => {
    expect(snapRefreshHz(0, 120)).toBe(120);
  });
});

describe('jankThresholdMs', () => {
  it('scales with the frame budget but never below the perceptual floor', () => {
    expect(jankThresholdMs(1000 / 60)).toBeCloseTo(25, 5);
    expect(jankThresholdMs(1000 / 240)).toBe(24);
    expect(jankThresholdMs(1000 / 30)).toBeCloseTo(50, 5);
    expect(SEVERE_FRAME_MS).toBeGreaterThan(jankThresholdMs(1000 / 60));
  });
});

describe('readFrameTrace', () => {
  it('returns the newest frames in chronological order', () => {
    const buffer = createFrameBuffer(8);
    for (let i = 1; i <= 10; i++) {
      pushFrame(buffer, i * 10, i);
    }

    const out = new Float64Array(4);
    const count = readFrameTrace(buffer, 4, out);

    expect(count).toBe(4);
    expect(Array.from(out)).toEqual([7, 8, 9, 10]);
  });

  it('never returns more than the buffer holds', () => {
    const buffer = createFrameBuffer(8);
    pushFrame(buffer, 10, 16);

    const out = new Float64Array(4);

    expect(readFrameTrace(buffer, 4, out)).toBe(1);
  });
});
