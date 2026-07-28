import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  messagesView,
  selectMockEndpoint,
  sendMessage,
} from '../specs/mock/helpers';
import {
  buildTextSection,
  buildThinkSection,
  countModelChunks,
  END_MARKER,
  SENTENCE,
} from './payload';

type RenderTally = Record<string, { count: number; time: number }>;

type PerfSnapshot = {
  renders: RenderTally;
  longTasks: number[];
  /** Milliseconds between the phase's anchor render and this snapshot, on
   *  the page's own clock: the first ThinkingContent render (assistant
   *  content = stream start) when one occurred, else the first render after
   *  the reset (typing phase), else the reset itself. Idle request-setup
   *  time before the assistant renders never pads the interval. */
  elapsedMs: number;
};

type PerfGlobal = {
  renders: RenderTally;
  longTasks: number[];
  startedAt: number;
  firstRenderAt: number | null;
  firstStreamRenderAt: number | null;
  drain(): void;
  reset(): void;
};

declare global {
  interface Window {
    __PERF__: PerfGlobal;
  }
}

/**
 * The react-scan bundle is injected from disk so the repo does not need it as
 * a dependency; point REACT_SCAN_PATH at `react-scan/dist/auto.global.js`.
 */
function resolveReactScanPath(): string {
  const fromEnv = process.env.REACT_SCAN_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  return require.resolve('react-scan/dist/auto.global.js');
}

const TALLY_SETUP = `(() => {
  const perf = {
    renders: Object.create(null),
    longTasks: [],
    observer: null,
    startedAt: performance.now(),
    firstRenderAt: null,
    firstStreamRenderAt: null,
    drain() {
      if (!this.observer) {
        return;
      }
      for (const entry of this.observer.takeRecords()) {
        this.longTasks.push(entry.duration);
      }
    },
    reset() {
      this.drain();
      this.renders = Object.create(null);
      this.longTasks = [];
      this.startedAt = performance.now();
      this.firstRenderAt = null;
      this.firstStreamRenderAt = null;
    },
  };
  window.__PERF__ = perf;
  try {
    perf.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        perf.longTasks.push(entry.duration);
      }
    });
    perf.observer.observe({ type: 'longtask', buffered: true });
  } catch (_error) {
    /* longtask unsupported: totals stay empty */
  }
  const nameOf = (fiber) => {
    let type = fiber && fiber.type;
    for (let depth = 0; depth < 4 && type; depth += 1) {
      if (typeof type === 'function') {
        return type.displayName || type.name || null;
      }
      if (typeof type === 'object') {
        if (type.displayName) {
          return type.displayName;
        }
        type = type.type || type.render;
        continue;
      }
      return String(type);
    }
    return null;
  };
  const configure = () => {
    if (typeof window.reactScan !== 'function') {
      return false;
    }
    window.reactScan({
      enabled: true,
      log: false,
      showToolbar: false,
      animationSpeed: 'off',
      trackUnnecessaryRenders: false,
      dangerouslyForceRunInProduction: true,
      onRender: (fiber, renders) => {
        if (perf.firstRenderAt == null) {
          perf.firstRenderAt = performance.now();
        }
        for (const render of renders) {
          const name = render.componentName || nameOf(fiber) || 'anonymous';
          if (perf.firstStreamRenderAt == null && name === 'ThinkingContent') {
            perf.firstStreamRenderAt = performance.now();
          }
          let slot = perf.renders[name];
          if (!slot) {
            slot = { count: 0, time: 0 };
            perf.renders[name] = slot;
          }
          slot.count += render.count || 1;
          slot.time += render.time || 0;
        }
      },
    });
    return true;
  };
  if (!configure()) {
    const timer = setInterval(() => {
      if (configure()) {
        clearInterval(timer);
      }
    }, 50);
  }
})();`;

async function snapshotPerf(page: Page): Promise<PerfSnapshot> {
  return page.evaluate(() => {
    window.__PERF__.drain();
    return {
      renders: window.__PERF__.renders,
      longTasks: window.__PERF__.longTasks.slice(),
      elapsedMs:
        performance.now() -
        (window.__PERF__.firstStreamRenderAt ??
          window.__PERF__.firstRenderAt ??
          window.__PERF__.startedAt),
    };
  });
}

async function resetPerf(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__PERF__.reset();
  });
}

function totals(snapshot: PerfSnapshot): { renders: number; time: number } {
  let renders = 0;
  let time = 0;
  for (const slot of Object.values(snapshot.renders)) {
    renders += slot.count;
    time += slot.time;
  }
  return { renders, time };
}

function topComponents(snapshot: PerfSnapshot, limit: number): string[] {
  return Object.entries(snapshot.renders)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(
      ([name, slot]) =>
        `${name.padEnd(28)} renders=${String(slot.count).padStart(6)} time=${slot.time.toFixed(1)}ms`,
    );
}

async function attachSnapshot(
  testInfo: TestInfo,
  name: string,
  snapshot: PerfSnapshot,
  extra: Record<string, number>,
): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify({ ...extra, ...snapshot }, null, 2),
    contentType: 'application/json',
  });
}

test.describe('reasoning stream perf (react-scan)', () => {
  test('one long unsplit reasoning + markdown reply stays render-bounded', async ({
    page,
  }, testInfo) => {
    test.setTimeout(6 * 60 * 1000);

    const thinkSection = buildThinkSection();
    const textSection = buildTextSection();
    const thinkChunks = countModelChunks(thinkSection);
    const textChunks = countModelChunks(textSection);
    const sectionCount = (textSection.match(/## Section /g) ?? []).length;

    await page.addInitScript({ content: fs.readFileSync(resolveReactScanPath(), 'utf8') });
    await page.addInitScript({ content: TALLY_SETUP });
    /** Stream with the reasoning box EXPANDED — the heavier layout path a
     *  user gets with "Show Thinking" enabled — so the measured interval
     *  covers live paragraph layout inside the box, not just the collapsed
     *  header. */
    await page.addInitScript(() => {
      localStorage.setItem('showThinking', 'true');
    });

    /** First load through the vite dev server transforms the module graph. */
    await page.goto(NEW_CHAT_PATH, { timeout: 180_000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    /** Reset BEFORE the send: with a 1ms chunk delay the earliest deltas can
     *  render between the response headers resolving and any later
     *  evaluation, and a post-send reset would erase them. The clock anchors
     *  to the first ThinkingContent render — the payload always opens with
     *  reasoning, so that is the first assistant-content paint — keeping
     *  composer renders and idle request setup out of the denominators (the
     *  few pre-stream composer renders stay in the tally, which only makes
     *  the bounds stricter). */
    await resetPerf(page);
    await sendMessage(page, 'Stream the long reasoning benchmark reply.');

    await expect(messagesView(page).getByText(END_MARKER)).toBeVisible({
      timeout: 4 * 60 * 1000,
    });
    /** The marker only proves the final text delta painted — generation
     *  finalization (usage chunk, terminal events, save-time re-render) is
     *  part of the measured stream, so wait for it to finish first. */
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden({
      timeout: 30_000,
    });
    const streaming = await snapshotPerf(page);
    const streamMs = Math.ceil(streaming.elapsedMs);

    /**
     * The whole reasoning section must land in ONE think part — a single
     * Thoughts toggle. More than one means something re-split the reasoning.
     */
    const thoughtToggles = messagesView(page).getByRole('button', {
      name: /^(Thoughts|Thinking)$/,
    });
    await expect(thoughtToggles).toHaveCount(1);

    /**
     * One nonempty toggle is not enough — the ENTIRE reasoning section must
     * survive the pipeline, internal paragraph breaks included (the box
     * renders whitespace-pre-wrap, so they are user-visible content). The
     * only transforms the UI applies are inline-tag stripping and edge
     * trimming, so the comparison is exact after trimming the source edges.
     * The box is already expanded via the seeded showThinking preference.
     */
    const thinkGroup = messagesView(page).getByRole('group', {
      name: /^(Thoughts|Thinking)$/,
    });
    const renderedThink = (await thinkGroup.locator('p').first().textContent()) ?? '';
    expect(renderedThink).toBe(thinkSection.trim());

    /**
     * The markdown body must also arrive whole — END_MARKER only proves the
     * suffix rendered. Structure alone is not enough either: verify the prose
     * itself — every section's heading, doubled-sentence paragraph, and both
     * list items, plus the exact table count with cell values and the code
     * block's lines — so the measured render work covers the full payload.
     */
    expect(sectionCount).toBeGreaterThan(0);
    const doubledSentence = `${SENTENCE}${SENTENCE}`.trim();
    await expect(messagesView(page).getByText(doubledSentence, { exact: true })).toHaveCount(
      sectionCount,
    );
    for (let section = 1; section <= sectionCount; section += 1) {
      await expect(
        messagesView(page).getByRole('heading', { name: `Section ${section}`, exact: true }),
      ).toBeVisible();
      await expect(
        messagesView(page).getByText(`Point one for section ${section}`, { exact: true }),
      ).toBeVisible();
      await expect(
        messagesView(page).getByText(`Point two for section ${section}`, { exact: true }),
      ).toBeVisible();
    }
    await expect(messagesView(page).getByRole('listitem')).toHaveCount(sectionCount * 2);
    const tableCount = Math.floor(sectionCount / 4);
    await expect(messagesView(page).getByRole('table')).toHaveCount(tableCount);
    for (const cellValue of ['120000', '135500', '151200']) {
      await expect(
        messagesView(page).getByRole('cell', { name: cellValue, exact: true }),
      ).toHaveCount(tableCount);
    }
    const codeBlockCount = Math.floor(sectionCount / 3);
    expect(codeBlockCount).toBeGreaterThan(0);
    for (const codeLine of ['export function estimate', 'return Math.round(total * rate);']) {
      await expect(messagesView(page).locator('code', { hasText: codeLine })).toHaveCount(
        codeBlockCount,
      );
    }

    await resetPerf(page);
    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.click();
    await input.pressSequentially('typing latency probe after long transcript', { delay: 25 });
    const typing = await snapshotPerf(page);

    const streamTotals = totals(streaming);
    const typingTotals = totals(typing);
    const longTaskTotal = streaming.longTasks.reduce((sum, duration) => sum + duration, 0);
    const worstLongTask = streaming.longTasks.reduce((max, duration) => Math.max(max, duration), 0);

    console.log(`\n=== Streaming phase (${streamMs}ms wall) ===`);
    console.log(`model chunks: think=${thinkChunks} text=${textChunks}`);
    console.log(
      `total renders=${streamTotals.renders} render-time=${streamTotals.time.toFixed(0)}ms ` +
        `longtask-total=${longTaskTotal.toFixed(0)}ms worst-longtask=${worstLongTask.toFixed(0)}ms`,
    );
    for (const line of topComponents(streaming, 15)) {
      console.log(`  ${line}`);
    }
    console.log('key components:');
    for (const component of ['ThinkingContent', 'MarkdownBlock', 'MarkdownBlocks', 'TextPart']) {
      const slot = streaming.renders[component];
      console.log(
        `  ${component.padEnd(20)} renders=${slot?.count ?? 0} time=${(slot?.time ?? 0).toFixed(1)}ms`,
      );
    }
    console.log('=== Typing phase (40 keys) ===');
    console.log(
      `total renders=${typingTotals.renders} render-time=${typingTotals.time.toFixed(0)}ms`,
    );
    for (const line of topComponents(typing, 10)) {
      console.log(`  ${line}`);
    }

    await attachSnapshot(testInfo, 'streaming-renders.json', streaming, {
      streamMs,
      thinkChunks,
      textChunks,
    });
    await attachSnapshot(testInfo, 'typing-renders.json', typing, {});

    /**
     * rAF coalescing must keep per-token work bounded: cache flushes happen at
     * most once per animation frame, so render counts scale with elapsed
     * frames, never with chunk count. The bound is derived from wall time
     * (60fps + 50% headroom) — without coalescing, renders track chunks
     * (~5k in ~13s) and blow far past it (measured baseline: 122). The floor
     * guards against the instrumentation (or the component name) silently
     * disappearing, which would zero the count and void the upper bound.
     */
    const framesUpperBound = Math.ceil((streamMs / 1000) * 90);
    const thinkingContentRenders = streaming.renders['ThinkingContent']?.count ?? 0;
    expect(thinkingContentRenders).toBeGreaterThan(10);
    expect(thinkingContentRenders).toBeLessThan(framesUpperBound);
    /** Rate-independent companion bound: even on a slow stream (where the
     *  frame bound balloons), one-render-per-chunk behavior must still fail. */
    expect(thinkingContentRenders).toBeLessThan(thinkChunks / 4);

    /**
     * Markdown must not re-render every block on every token — total
     * MarkdownBlock renders stay in the order of frames + blocks (measured
     * baseline: 153), far below blocks × tokens (~100k). Same floor rationale
     * as above: zero means the guard lost its subject, not that it passed.
     */
    const markdownBlockRenders = streaming.renders['MarkdownBlock']?.count ?? 0;
    expect(markdownBlockRenders).toBeGreaterThan(10);
    expect(markdownBlockRenders).toBeLessThan(framesUpperBound);
    expect(markdownBlockRenders).toBeLessThan(textChunks / 4);

    /**
     * The main thread must stay responsive while the huge block streams:
     * no single stall past 250ms, no more than 10% of the stream's wall time
     * in long tasks (measured baseline: one 51-96ms task), and — because
     * sustained sub-50ms work never surfaces as a long task — cumulative
     * render time capped as well (measured baseline: ~4-7% of wall time).
     */
    expect(worstLongTask).toBeLessThan(250);
    expect(longTaskTotal).toBeLessThan(streamMs * 0.1);
    expect(streamTotals.time).toBeLessThan(streamMs * 0.25);

    /**
     * Typing after the long transcript must not re-render the transcript:
     * message-content components stay quiet while the composer updates.
     */
    const transcriptComponents = [
      'MarkdownBlock',
      'MarkdownBlocks',
      'Markdown',
      'ThinkingContent',
      'TextPart',
      'Part',
      'MessageContent',
    ];
    for (const component of transcriptComponents) {
      const renders = typing.renders[component]?.count ?? 0;
      expect(renders, `${component} re-rendered while typing`).toBeLessThanOrEqual(2);
    }

    /**
     * Quiet transcript components alone don't prove keystrokes feel fast —
     * slow input handlers or layout can lag without re-rendering any named
     * component. Bound the typing phase's own long tasks and cumulative
     * render time (measured baseline: no long tasks, ~3% render time).
     */
    const typingWorstLongTask = typing.longTasks.reduce(
      (max, duration) => Math.max(max, duration),
      0,
    );
    const typingLongTaskTotal = typing.longTasks.reduce((sum, duration) => sum + duration, 0);
    expect(typingWorstLongTask).toBeLessThan(150);
    /** Absolute cumulative budget — repeated sub-threshold stalls both evade
     *  a worst-case check and inflate elapsedMs, so no ratio is used here. */
    expect(typingLongTaskTotal).toBeLessThan(300);
    expect(typingTotals.time).toBeLessThan(typing.elapsedMs * 0.25);
  });
});
