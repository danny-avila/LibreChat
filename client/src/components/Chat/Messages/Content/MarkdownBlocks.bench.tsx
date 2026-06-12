import React, { Profiler } from 'react';
import { RecoilRoot } from 'recoil';
import ReactMarkdown from 'react-markdown';
import { render } from '@testing-library/react';
import { getRemarkPlugins, getRehypePlugins, getMarkdownComponents } from './markdownConfig';
import { ArtifactProvider, CodeBlockProvider } from '~/Providers';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import Markdown from './Markdown';

/**
 * Streaming render benchmark comparing the previous whole-message renderer
 * (one ReactMarkdown re-parsing everything per token) against the per-block
 * memoized renderer. This file lives outside `__tests__/` and is named
 * `.bench.tsx` so the default jest run skips it; execute it explicitly with:
 *
 *   node node_modules/jest/bin/jest.js --runInBand --coverage=false \
 *     --testMatch '**\/MarkdownBlocks.bench.tsx'
 *
 * Two metrics are reported:
 *  - codeBlockRenders: deterministic structural metric — how many times code
 *    blocks render across the whole stream (the memoization win, noise-free).
 *  - totalMs: summed React Profiler actualDuration (wall-clock; jsdom absolute
 *    numbers are not browser-accurate, but the OLD/NEW ratio is indicative).
 */

jest.mock('~/components/Messages/Content/CodeBlock', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

const codeBlockMock = CodeBlock as unknown as jest.Mock;

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

const NewMarkdown = ({ content }: { content: string }) => (
  <Markdown content={content} isLatestMessage={true} />
);

const measure = (
  Component: React.ComponentType<{ content: string }>,
  prefixes: string[],
): { totalMs: number; codeBlockRenders: number } => {
  codeBlockMock.mockClear();
  let totalMs = 0;
  const onRender = (_id: string, _phase: string, actualDuration: number) => {
    totalMs += actualDuration;
  };
  const tree = (content: string) => (
    <Profiler id="bench" onRender={onRender}>
      <RecoilRoot>
        <Component content={content} />
      </RecoilRoot>
    </Profiler>
  );
  const { rerender, unmount } = render(tree(prefixes[0]));
  for (let i = 1; i < prefixes.length; i += 1) {
    rerender(tree(prefixes[i]));
  }
  const result = { totalMs, codeBlockRenders: codeBlockMock.mock.calls.length };
  unmount();
  return result;
};

describe('Markdown streaming benchmark (OLD whole-message vs NEW per-block)', () => {
  it('reports render cost across a simulated stream', () => {
    const content = buildMessage(12);
    const steps = 80;
    const prefixes = makePrefixes(content, steps);
    const iterations = 3;

    // Warm up module/highlight caches so the first measured run isn't skewed.
    measure(OldMarkdown, prefixes);
    measure(NewMarkdown, prefixes);

    const old: Array<{ totalMs: number; codeBlockRenders: number }> = [];
    const neu: Array<{ totalMs: number; codeBlockRenders: number }> = [];
    for (let i = 0; i < iterations; i += 1) {
      old.push(measure(OldMarkdown, prefixes));
      neu.push(measure(NewMarkdown, prefixes));
    }

    const minMs = (rs: Array<{ totalMs: number }>) => Math.min(...rs.map((r) => r.totalMs));
    const oldMs = minMs(old);
    const newMs = minMs(neu);
    const oldRenders = old[0].codeBlockRenders;
    const newRenders = neu[0].codeBlockRenders;

    console.log(
      [
        '',
        '================ Markdown streaming benchmark ================',
        `message size: ${content.length} chars, stream steps: ${steps}, iterations: ${iterations}`,
        '',
        `code-block renders over the stream (structural, noise-free):`,
        `  OLD (whole-message): ${oldRenders}`,
        `  NEW (per-block)    : ${newRenders}`,
        `  reduction          : ${(100 * (1 - newRenders / oldRenders)).toFixed(1)}%`,
        '',
        `total render time (min of ${iterations}, summed Profiler actualDuration; jsdom):`,
        `  OLD: ${oldMs.toFixed(1)} ms`,
        `  NEW: ${newMs.toFixed(1)} ms`,
        `  speedup: ${(oldMs / newMs).toFixed(2)}x`,
        '=============================================================',
        '',
      ].join('\n'),
    );

    // Sanity: the per-block renderer must not render code blocks MORE than the
    // whole-message renderer. The real win is asserted separately below.
    expect(newRenders).toBeLessThanOrEqual(oldRenders);
    // Memoization should cut total code-block renders by a wide margin.
    expect(newRenders).toBeLessThan(oldRenders * 0.5);
  });
});
