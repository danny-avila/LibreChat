import type { FrameStats, LoadProbePass } from './types';
import { summarizeLoadProbe, sweepDurationMs, MIN_SWEEP_MS } from './probe';
import { shortenSelector } from './monitor';
import { emptyFrameStats } from './frames';

function pass(index: number, fps: number, elements: number, grew = true): LoadProbePass {
  const frames: FrameStats = {
    ...emptyFrameStats(60),
    sampleCount: 200,
    fps,
    fpsLow1: fps * 0.6,
    frameP95Ms: 1000 / fps,
    frameMaxMs: 1000 / fps + 20,
    droppedFrames: Math.round((60 - fps) * 2),
  };
  return {
    pass: index,
    label: 'div.messages',
    elements,
    items: elements - 100,
    scrolledPx: 4000,
    longTaskMs: 0,
    frames,
    grew,
  };
}

describe('summarizeLoadProbe', () => {
  it('returns a neutral verdict without passes', () => {
    const verdict = summarizeLoadProbe([]);

    expect(verdict.degrades).toBe(false);
    expect(verdict.recycles).toBe(false);
    expect(verdict.elementsGrowthRatio).toBe(1);
  });

  it('calls out degradation when frame rate falls as the DOM grows', () => {
    const verdict = summarizeLoadProbe([pass(1, 58, 3000), pass(2, 44, 8000), pass(3, 29, 15000)]);

    expect(verdict.fpsFirst).toBe(58);
    expect(verdict.fpsLast).toBe(29);
    expect(verdict.fpsDropRatio).toBeCloseTo(0.5, 1);
    expect(verdict.elementsGrowthRatio).toBeCloseTo(5, 5);
    expect(verdict.degrades).toBe(true);
    expect(verdict.recycles).toBe(false);
  });

  it('does not blame data growth when frame rate holds', () => {
    const verdict = summarizeLoadProbe([pass(1, 59, 3000), pass(2, 58, 9000)]);

    expect(verdict.degrades).toBe(false);
    expect(verdict.fpsDropRatio).toBeLessThan(0.05);
  });

  it('reports a low absolute frame rate even without DOM growth', () => {
    const verdict = summarizeLoadProbe([pass(1, 30, 5000, false), pass(2, 30, 5000, false)]);

    expect(verdict.degrades).toBe(true);
  });

  it('recognises a recycling list when the DOM stays flat while data loads', () => {
    const verdict = summarizeLoadProbe([
      pass(1, 59, 4000, true),
      pass(2, 58, 4020, true),
      pass(3, 59, 4010, false),
    ]);

    expect(verdict.recycles).toBe(true);
    expect(verdict.degrades).toBe(false);
  });

  it('aggregates the worst frame and dropped frames across passes', () => {
    const verdict = summarizeLoadProbe([pass(1, 60, 3000), pass(2, 20, 6000)]);

    expect(verdict.worstFrameMs).toBeCloseTo(1000 / 20 + 20, 5);
    expect(verdict.droppedFrames).toBe(80);
  });
});

describe('shortenSelector', () => {
  it('keeps a readable leaf out of a long attribution selector', () => {
    const raw =
      '#root>div.flex>button.inline-flex.items-center.justify-center.gap-2.whitespace-nowrap.text-sm.font-medium.size-10.rounded-full';

    expect(shortenSelector(raw)).toBe('button.inline-flex.items-center');
  });

  it('passes through simple selectors and empty attribution', () => {
    expect(shortenSelector('div.messages')).toBe('div.messages');
    expect(shortenSelector(undefined)).toBe('');
  });
});

describe('sweepDurationMs', () => {
  it('holds a constant velocity so threads of different length compare', () => {
    expect(sweepDurationMs(2500, 2500, 6000)).toBe(1000);
    expect(sweepDurationMs(5000, 2500, 6000)).toBe(2000);
    expect(sweepDurationMs(-5000, 2500, 6000)).toBe(2000);
  });

  it('caps a very long thread instead of sweeping forever', () => {
    expect(sweepDurationMs(400000, 2500, 6000)).toBe(6000);
  });

  it('keeps a short list sweeping long enough to sample frames', () => {
    expect(sweepDurationMs(120, 2500, 6000)).toBe(MIN_SWEEP_MS);
  });
});
