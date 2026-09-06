import type { LoadProbePass, LoadProbeResult, LoadProbeVerdict } from './types';
import type { PerfMonitor } from './monitor';
import { describeNode, PERF_HUD_ATTRIBUTE } from './monitor';

export const MIN_SCROLL_OVERFLOW_PX = 96;
export const MIN_TARGET_SIZE_PX = 120;
export const MAX_SCROLL_TARGETS = 8;
export const DEFAULT_SWEEP_PX_PER_SECOND = 2500;
export const DEFAULT_MAX_SWEEP_MS = 6000;
export const MIN_SWEEP_MS = 300;
export const DEFAULT_SETTLE_MS = 450;
export const DEFAULT_PASSES = 6;
export const GROWTH_FLOOR_ELEMENTS = 50;
export const GROWTH_RATIO = 0.02;

export interface ScrollTarget {
  element: HTMLElement;
  label: string;
  overflowPx: number;
  area: number;
}

export interface LoadProbeOptions {
  target: HTMLElement;
  label: string;
  monitor: PerfMonitor;
  passes?: number;
  pxPerSecond?: number;
  maxSweepMs?: number;
  settleMs?: number;
  signal?: AbortSignal;
  onPass?: (pass: LoadProbePass) => void;
}

export function findScrollTargets(): ScrollTarget[] {
  const targets: ScrollTarget[] = [];
  const candidates = document.body.getElementsByTagName('*');

  for (let i = 0; i < candidates.length; i++) {
    const element = candidates[i];
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    const overflowPx = element.scrollHeight - element.clientHeight;
    if (overflowPx < MIN_SCROLL_OVERFLOW_PX) {
      continue;
    }
    if (element.clientWidth < MIN_TARGET_SIZE_PX || element.clientHeight < MIN_TARGET_SIZE_PX) {
      continue;
    }
    if (element.closest(`[${PERF_HUD_ATTRIBUTE}]`)) {
      continue;
    }
    const overflowY = getComputedStyle(element).overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll') {
      continue;
    }
    targets.push({
      element,
      label: describeNode(element),
      overflowPx,
      area: element.clientWidth * element.clientHeight,
    });
  }

  targets.sort((a, b) => b.area - a.area);
  return targets.slice(0, MAX_SCROLL_TARGETS);
}

function countElements(): number {
  const hud = document.querySelector(`[${PERF_HUD_ATTRIBUTE}]`);
  const hudElements = hud ? hud.getElementsByTagName('*').length + 1 : 0;
  return document.getElementsByTagName('*').length - hudElements;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  if (signal?.aborted) {
    resolve();
    return promise;
  }
  let timer = 0;
  const onAbort = (): void => {
    window.clearTimeout(timer);
    resolve();
  };
  timer = window.setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
  return promise;
}

/** A fixed-duration sweep scrolls faster the longer the thread, so the same
 *  gesture becomes a teleport on a big conversation and the result stops being
 *  comparable between threads. Hold the velocity instead and let the duration
 *  follow the distance, capped so a huge thread still finishes. */
export function sweepDurationMs(distancePx: number, pxPerSecond: number, maxMs: number): number {
  const natural = (Math.abs(distancePx) / pxPerSecond) * 1000;
  return Math.min(maxMs, Math.max(MIN_SWEEP_MS, natural));
}

function sweep(
  element: HTMLElement,
  direction: 'top' | 'bottom',
  pxPerSecond: number,
  maxSweepMs: number,
  signal?: AbortSignal,
): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  const start = element.scrollTop;
  const startedAt = performance.now();
  let travelled = 0;
  const initialLimit =
    direction === 'top' ? 0 : Math.max(0, element.scrollHeight - element.clientHeight);
  const durationMs = sweepDurationMs(initialLimit - start, pxPerSecond, maxSweepMs);

  const step = (now: number): void => {
    if (signal?.aborted) {
      resolve(travelled);
      return;
    }
    const progress = Math.min(1, (now - startedAt) / durationMs);
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - (2 - 2 * progress) ** 2 / 2;
    const limit =
      direction === 'top' ? 0 : Math.max(0, element.scrollHeight - element.clientHeight);
    const previous = element.scrollTop;
    element.scrollTop = start + (limit - start) * eased;
    travelled += Math.abs(element.scrollTop - previous);
    if (progress >= 1) {
      resolve(travelled);
      return;
    }
    requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
  return promise;
}

export function summarizeLoadProbe(passes: LoadProbePass[]): LoadProbeVerdict {
  if (passes.length === 0) {
    return {
      fpsFirst: 0,
      fpsLast: 0,
      fpsDropRatio: 0,
      elementsFirst: 0,
      elementsLast: 0,
      elementsGrowthRatio: 1,
      worstFrameMs: 0,
      droppedFrames: 0,
      degrades: false,
      recycles: false,
    };
  }

  const first = passes[0];
  const last = passes[passes.length - 1];
  let worstFrameMs = 0;
  let droppedFrames = 0;
  let minElements = first.elements;
  let maxElements = first.elements;

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    if (pass.frames.frameMaxMs > worstFrameMs) {
      worstFrameMs = pass.frames.frameMaxMs;
    }
    droppedFrames += pass.frames.droppedFrames;
    if (pass.elements < minElements) {
      minElements = pass.elements;
    }
    if (pass.elements > maxElements) {
      maxElements = pass.elements;
    }
  }

  const fpsFirst = first.frames.fps;
  const fpsLast = last.frames.fps;
  const fpsDropRatio = fpsFirst > 0 ? Math.max(0, (fpsFirst - fpsLast) / fpsFirst) : 0;
  const elementsGrowthRatio = minElements > 0 ? maxElements / minElements : 1;
  const refreshHz = last.frames.refreshHz;
  const grewSomewhere = passes.some((pass) => pass.grew);

  return {
    fpsFirst,
    fpsLast,
    fpsDropRatio,
    elementsFirst: first.elements,
    elementsLast: last.elements,
    elementsGrowthRatio,
    worstFrameMs,
    droppedFrames,
    degrades:
      (fpsDropRatio >= 0.15 && elementsGrowthRatio >= 1.1) ||
      (fpsLast > 0 && fpsLast < refreshHz * 0.7),
    recycles: grewSomewhere && elementsGrowthRatio < 1.05,
  };
}

export async function runLoadProbe(options: LoadProbeOptions): Promise<LoadProbeResult> {
  const {
    target,
    label,
    monitor,
    passes: maxPasses = DEFAULT_PASSES,
    pxPerSecond = DEFAULT_SWEEP_PX_PER_SECOND,
    maxSweepMs = DEFAULT_MAX_SWEEP_MS,
    settleMs = DEFAULT_SETTLE_MS,
    signal,
    onPass,
  } = options;

  const originalScrollTop = target.scrollTop;
  const passes: LoadProbePass[] = [];
  let previousElements = countElements();
  let flatPasses = 0;

  for (let index = 1; index <= maxPasses; index++) {
    if (signal?.aborted) {
      break;
    }

    const from = performance.now();
    let scrolledPx = await sweep(target, 'top', pxPerSecond, maxSweepMs, signal);
    await wait(settleMs, signal);
    scrolledPx += await sweep(target, 'bottom', pxPerSecond, maxSweepMs, signal);
    const to = performance.now();
    await wait(settleMs, signal);

    const elements = countElements();
    const threshold = Math.max(GROWTH_FLOOR_ELEMENTS, previousElements * GROWTH_RATIO);
    const grew = elements > previousElements + threshold;
    previousElements = elements;

    const pass: LoadProbePass = {
      pass: index,
      label,
      elements,
      items: target.getElementsByTagName('*').length,
      scrolledPx: Math.round(scrolledPx),
      longTaskMs: Math.round(monitor.longTaskMsBetween(from, to)),
      frames: monitor.statsBetween(from, to),
      grew,
    };
    passes.push(pass);
    onPass?.(pass);

    flatPasses = grew ? 0 : flatPasses + 1;
    if (flatPasses >= 2) {
      break;
    }
  }

  target.scrollTop = originalScrollTop;

  return {
    targetLabel: label,
    passes,
    verdict: summarizeLoadProbe(passes),
    aborted: signal?.aborted === true,
  };
}
