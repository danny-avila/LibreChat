import React, { Profiler } from 'react';
import ReactMarkdown from 'react-markdown';
import { render } from '@testing-library/react';
import { getRemarkPlugins, getRehypePlugins, getMarkdownComponents } from './markdownConfig';
import { splitMarkdownIntoBlocks, splitMarkdownIntoBlocksUncached } from './splitMarkdown';
import { ArtifactProvider, CodeBlockProvider, MessageContext } from '~/Providers';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import MarkdownBlocks from './MarkdownBlocks';
import { AppStores } from 'test/harness';
import Markdown from './Markdown';

/**
 * Render benchmark comparing the previous whole-message renderer (one
 * ReactMarkdown re-parsing everything per token) against the per-block memoized
 * renderer, both while a message streams and when a finished message mounts.
 * This file lives outside `__tests__/` and is named `.bench.tsx` so the default
 * jest run skips it; execute it explicitly with:
 *
 *   cd client
 *   npx jest --maxWorkers=2 --coverage=false \
 *     --testMatch '**\/MarkdownBlocks.bench.tsx'
 *
 * Three metrics are reported:
 *  - pipelineInvocations: full ReactMarkdown renders, including every plugin.
 *  - codeBlockRenders: deterministic structural metric, how many times code
 *    blocks render across the whole stream (the memoization win, noise-free).
 *  - totalMs: summed React Profiler actualDuration (wall-clock; jsdom absolute
 *    numbers are not browser-accurate, but the OLD/NEW ratio is indicative).
 */

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: jest.fn(jest.requireActual('react-markdown').default),
}));

jest.mock('~/components/Messages/Content/CodeBlock', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

const codeBlockMock = CodeBlock as unknown as jest.Mock;
const markdownMock = jest.mocked(ReactMarkdown);

type RenderProps = { content: string; streaming?: boolean };
type Measurement = {
  totalMs: number;
  codeBlockRenders: number;
  pipelineInvocations: number;
  streamingCodeBlockRenders: number;
  streamingPipelineInvocations: number;
};

const LANGS = ['python', 'javascript', 'typescript', 'bash', 'json', 'sql', 'go', 'rust'];

const buildMessage = (sections: number): string => {
  const parts: string[] = [];
  for (let i = 0; i < sections; i += 1) {
    parts.push(`## Section ${i + 1}`, '');
    parts.push(
      `This is paragraph ${i + 1} explaining the code below with some **bold** and ` +
        `\`inline\` text, intentionally a bit long to add realistic reflow cost during ` +
        `streaming, repeated across every section of the message.`,
      '',
    );
    const lang = LANGS[i % LANGS.length];
    parts.push('```' + lang);
    for (let l = 0; l < 8; l += 1) {
      parts.push(`const value_${i}_${l} = computeSomething(${l}, "arg_${l}"); // line ${l}`);
    }
    parts.push('```', '');
    if (i % 3 === 0) {
      parts.push('| Name | Type | Value |', '| --- | --- | --- |');
      for (let r = 0; r < 5; r += 1) {
        parts.push(`| item_${i}_${r} | number | ${r * i} |`);
      }
      parts.push('');
    }
  }
  return parts.join('\n');
};

const makePrefixes = (content: string, steps: number): string[] => {
  const prefixes: string[] = [];
  for (let s = 1; s <= steps; s += 1) {
    prefixes.push(content.slice(0, Math.ceil((content.length * s) / steps)));
  }
  return prefixes;
};

const OldMarkdown = ({ content }: { content: string }) => (
  <ArtifactProvider>
    <CodeBlockProvider>
      <ReactMarkdown
        /** @ts-ignore */
        remarkPlugins={getRemarkPlugins()}
        /** @ts-ignore */
        rehypePlugins={getRehypePlugins()}
        components={getMarkdownComponents()}
      >
        {content}
      </ReactMarkdown>
    </CodeBlockProvider>
  </ArtifactProvider>
);

/** The per-block renderer a streaming message uses, without the fade. */
const NewMarkdown = ({ content, streaming = true }: RenderProps) => (
  <MarkdownBlocks
    content={content}
    streaming={streaming}
    remarkPlugins={getRemarkPlugins()}
    rehypePlugins={getRehypePlugins()}
    components={getMarkdownComponents()}
  />
);

/** A finished message as a conversation opens with it. */
const SettledMarkdown = ({ content }: { content: string }) => (
  <Markdown content={content} isLatestMessage={false} />
);

const streamingContext = {
  messageId: 'bench',
  isExpanded: false,
  isSubmitting: true,
  isLatestMessage: true,
};

const FadeMarkdown = ({ content, streaming = true }: RenderProps) => (
  <MessageContext.Provider value={{ ...streamingContext, isSubmitting: streaming }}>
    <Markdown content={content} isLatestMessage={true} />
  </MessageContext.Provider>
);

const measure = (
  Component: React.ComponentType<RenderProps>,
  prefixes: string[],
  finish = false,
): Measurement => {
  codeBlockMock.mockClear();
  markdownMock.mockClear();
  let totalMs = 0;
  const onRender = (_id: string, _phase: string, actualDuration: number) => {
    totalMs += actualDuration;
  };
  const tree = (content: string, streaming = true) => (
    <Profiler id="bench" onRender={onRender}>
      <AppStores>
        <Component content={content} streaming={streaming} />
      </AppStores>
    </Profiler>
  );
  const { rerender, unmount } = render(tree(prefixes[0]));
  for (let i = 1; i < prefixes.length; i += 1) {
    rerender(tree(prefixes[i]));
  }
  const streamingCodeBlockRenders = codeBlockMock.mock.calls.length;
  const streamingPipelineInvocations = markdownMock.mock.calls.length;
  if (finish) {
    rerender(tree(prefixes[prefixes.length - 1], false));
  }
  const result = {
    totalMs,
    codeBlockRenders: codeBlockMock.mock.calls.length,
    pipelineInvocations: markdownMock.mock.calls.length,
    streamingCodeBlockRenders,
    streamingPipelineInvocations,
  };
  unmount();
  return result;
};

describe('splitMarkdownIntoBlocks streaming benchmark (full re-parse vs incremental)', () => {
  it('reports split cost across a simulated stream', () => {
    const content = buildMessage(40);
    const steps = 1500;
    const prefixes = makePrefixes(content, steps);
    const iterations = 3;

    const time = (split: (content: string) => void): number => {
      split('warm up and reset the cache');
      const start = performance.now();
      for (const prefix of prefixes) {
        split(prefix);
      }
      return performance.now() - start;
    };

    time(splitMarkdownIntoBlocksUncached);
    time(splitMarkdownIntoBlocks);
    let fullMs = Infinity;
    let incrementalMs = Infinity;
    for (let i = 0; i < iterations; i += 1) {
      fullMs = Math.min(fullMs, time(splitMarkdownIntoBlocksUncached));
      incrementalMs = Math.min(incrementalMs, time(splitMarkdownIntoBlocks));
    }

    console.log(
      [
        '',
        '============ splitMarkdownIntoBlocks streaming benchmark ============',
        `message size: ${content.length} chars, stream steps: ${steps}, iterations: ${iterations}`,
        `  full re-parse : ${fullMs.toFixed(1)} ms`,
        `  incremental   : ${incrementalMs.toFixed(1)} ms`,
        `  speedup       : ${(fullMs / incrementalMs).toFixed(2)}x`,
        '=====================================================================',
        '',
      ].join('\n'),
    );

    expect(incrementalMs).toBeLessThan(fullMs);
  });
});

describe('Markdown streaming benchmark (OLD whole-message vs NEW per-block)', () => {
  it.each([
    ['paragraph', 'A single **growing** paragraph with `inline` code. '.repeat(30)],
    ['code fence', '```typescript\n' + 'const x = computeSomething();\n'.repeat(30)],
  ])('avoids full-pipeline invocations for one growing %s', (_label, content) => {
    const prefixes = makePrefixes(content, 80);
    const old = measure(OldMarkdown, prefixes);
    const streaming = measure(NewMarkdown, prefixes);
    const finished = measure(NewMarkdown, prefixes, true);
    const faded = measure(FadeMarkdown, prefixes, true);

    console.log(
      `${_label} full-pipeline invocations: OLD ${old.pipelineInvocations}, ` +
        `LITE ${streaming.pipelineInvocations}, FINISHED ${finished.pipelineInvocations}, ` +
        `FADE FINISHED ${faded.pipelineInvocations}`,
    );
    expect(old.pipelineInvocations).toBe(prefixes.length);
    expect(streaming.pipelineInvocations).toBe(0);
    expect(finished.pipelineInvocations).toBe(1);
    expect(faded.pipelineInvocations).toBe(1);
  });

  it('reports render cost across a simulated stream', () => {
    const content = buildMessage(12);
    const steps = 80;
    const prefixes = makePrefixes(content, steps);
    const iterations = 3;

    // Warm up module/highlight caches so the first measured run isn't skewed.
    measure(OldMarkdown, prefixes);
    measure(NewMarkdown, prefixes);
    measure(FadeMarkdown, prefixes);

    const old: Measurement[] = [];
    const neu: Measurement[] = [];
    const fade: Measurement[] = [];
    for (let i = 0; i < iterations; i += 1) {
      old.push(measure(OldMarkdown, prefixes, true));
      neu.push(measure(NewMarkdown, prefixes, true));
      fade.push(measure(FadeMarkdown, prefixes, true));
    }

    const minMs = (rs: Array<{ totalMs: number }>) => Math.min(...rs.map((r) => r.totalMs));
    const oldMs = minMs(old);
    const newMs = minMs(neu);
    const fadeMs = minMs(fade);
    const oldRenders = old[0].streamingCodeBlockRenders;
    const newRenders = neu[0].streamingCodeBlockRenders;
    const fadeRenders = fade[0].streamingCodeBlockRenders;

    console.log(
      [
        '',
        'full-pipeline invocations while streaming:',
        `  OLD: ${old[0].streamingPipelineInvocations}`,
        `  NEW: ${neu[0].streamingPipelineInvocations}`,
        `  NEW + fade: ${fade[0].streamingPipelineInvocations}`,
        '',
        'full-pipeline invocations (including stream completion):',
        `  OLD: ${old[0].pipelineInvocations}`,
        `  NEW: ${neu[0].pipelineInvocations}`,
        `  NEW + fade: ${fade[0].pipelineInvocations}`,
        '',
        '================ Markdown streaming benchmark ================',
        `message size: ${content.length} chars, stream steps: ${steps}, iterations: ${iterations}`,
        '',
        `code-block renders before completion (structural, noise-free):`,
        `  OLD (whole-message): ${oldRenders}`,
        `  NEW (per-block)    : ${newRenders}`,
        `  NEW + fade         : ${fadeRenders}`,
        `  reduction          : ${(100 * (1 - newRenders / oldRenders)).toFixed(1)}%`,
        '',
        `total render time (min of ${iterations}, summed Profiler actualDuration; jsdom):`,
        `  OLD       : ${oldMs.toFixed(1)} ms`,
        `  NEW       : ${newMs.toFixed(1)} ms`,
        `  NEW + fade: ${fadeMs.toFixed(1)} ms (${(100 * (fadeMs / newMs - 1)).toFixed(1)}% vs NEW)`,
        `  speedup vs OLD: ${(oldMs / newMs).toFixed(2)}x (fade: ${(oldMs / fadeMs).toFixed(2)}x)`,
        '=============================================================',
        '',
      ].join('\n'),
    );

    // The fade plugin must not disturb block memoization: code blocks render
    // exactly as often as without it.
    expect(fadeRenders).toBe(newRenders);
    expect(fade[0].streamingPipelineInvocations).toBe(neu[0].streamingPipelineInvocations);
    expect(neu[0].pipelineInvocations).toBeLessThan(old[0].pipelineInvocations);
    // Ending animation re-runs finalized blocks to remove their fade spans.
    expect(fade[0].pipelineInvocations).toBeLessThan(old[0].pipelineInvocations);

    // Sanity: the per-block renderer must not render code blocks MORE than the
    // whole-message renderer. The real win is asserted separately below.
    expect(newRenders).toBeLessThanOrEqual(oldRenders);
    // Memoization should cut total code-block renders by a wide margin.
    expect(newRenders).toBeLessThan(oldRenders * 0.5);
  });

  it('reports mount cost for a message that was already finished', () => {
    const iterations = 5;
    const rows = [12, 40].map((sections) => {
      const prefixes = [buildMessage(sections)];
      measure(OldMarkdown, prefixes);
      measure(NewMarkdown, prefixes);
      measure(SettledMarkdown, prefixes);

      const old: Array<{ totalMs: number; codeBlockRenders: number }> = [];
      const perBlock: Array<{ totalMs: number; codeBlockRenders: number }> = [];
      const settled: Array<{ totalMs: number; codeBlockRenders: number }> = [];
      for (let i = 0; i < iterations; i += 1) {
        old.push(measure(OldMarkdown, prefixes));
        perBlock.push(measure(NewMarkdown, prefixes));
        settled.push(measure(SettledMarkdown, prefixes));
      }
      const minMs = (rs: Array<{ totalMs: number }>) => Math.min(...rs.map((r) => r.totalMs));
      return {
        chars: prefixes[0].length,
        oldMs: minMs(old),
        perBlockMs: minMs(perBlock),
        settledMs: minMs(settled),
        oldRenders: old[0].codeBlockRenders,
        settledRenders: settled[0].codeBlockRenders,
      };
    });

    console.log(
      [
        '',
        '================ Markdown finished-message mount benchmark ================',
        `min of ${iterations} mounts, summed Profiler actualDuration; jsdom`,
        ...rows.map(
          (r) =>
            `  ${r.chars} chars: OLD ${r.oldMs.toFixed(1)} ms | STREAMING ${r.perBlockMs.toFixed(1)} ms | ` +
            `SETTLED ${r.settledMs.toFixed(1)} ms (${(r.perBlockMs / r.settledMs).toFixed(2)}x vs streaming)`,
        ),
        '==========================================================================',
        '',
      ].join('\n'),
    );

    // A finished message mounts through the whole-message pipeline: every code
    // block renders exactly once, as it did before per-block rendering existed.
    for (const r of rows) {
      expect(r.settledRenders).toBe(r.oldRenders);
    }
  });
});
