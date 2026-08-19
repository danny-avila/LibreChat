import React from 'react';
import { RecoilRoot } from 'recoil';
import ReactMarkdown from 'react-markdown';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getRemarkPlugins, getRehypePlugins, getMarkdownComponents } from '../markdownConfig';
import { ArtifactProvider, CodeBlockProvider } from '~/Providers';
import Markdown from '../Markdown';

/**
 * Stub CodeBlock so we can read the blockIndex each executable code block
 * receives, while still exercising the real `code` override's skip/single-line
 * decision (which decides whether a CodeBlock renders at all).
 */
jest.mock('~/components/Messages/Content/CodeBlock', () => ({
  __esModule: true,
  default: ({ lang, blockIndex }: { lang?: string; blockIndex?: number }) => (
    <div data-testid="cb" data-block-index={String(blockIndex)} data-lang={String(lang)} />
  ),
}));

/** The previous whole-message renderer: a single ReactMarkdown under one set of providers. */
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

/**
 * The whole-message renderer emits whitespace-only text nodes ("\n") between
 * top-level block elements; the per-block renderer parses each block in
 * isolation and omits them. That whitespace is collapsed between block-level
 * elements, so it is visually and functionally irrelevant — normalize it away
 * before comparing structure.
 */
const normalizeHtml = (html: string) => html.replace(/>\s+</g, '><').trim();

const indicesIn = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="cb"]')).map((el) => ({
    idx: el.getAttribute('data-block-index'),
    lang: el.getAttribute('data-lang'),
  }));

const streamThrough = (
  Component: React.ComponentType<{ content: string }>,
  content: string,
): HTMLElement => {
  const lines = content.split('\n');
  const { container, rerender } = render(
    <RecoilRoot>
      <Component content={lines[0]} />
    </RecoilRoot>,
  );
  for (let i = 2; i <= lines.length; i += 1) {
    rerender(
      <RecoilRoot>
        <Component content={lines.slice(0, i).join('\n')} />
      </RecoilRoot>,
    );
  }
  return container;
};

const MIXED = [
  'Intro paragraph.',
  '',
  '```python',
  'print("one")',
  'x = 1',
  '```',
  '',
  'Some `inline` code here.',
  '',
  '```js',
  'console.log("two");',
  'const y = 2;',
  '```',
  '',
  '```math',
  'E = mc^2',
  '```',
  '',
  '```bash',
  'echo single',
  '```',
  '',
  '```mermaid',
  'graph TD; A-->B;',
  '```',
  '',
  '```ts',
  'const z: number = 3;',
  'export {};',
  '```',
].join('\n');

const EXPECTED = [
  { idx: '0', lang: 'python' },
  { idx: '1', lang: 'js' },
  { idx: '2', lang: 'bash' },
  { idx: '3', lang: 'ts' },
];

const NewMarkdown = ({ content }: { content: string }) => (
  <Markdown content={content} isLatestMessage={false} />
);

describe('MarkdownBlocks code-block index parity', () => {
  it('assigns document-order indices on a direct render (matches whole-message renderer)', () => {
    const { container: oldC } = render(
      <RecoilRoot>
        <OldMarkdown content={MIXED} />
      </RecoilRoot>,
    );
    const { container: newC } = render(
      <RecoilRoot>
        <Markdown content={MIXED} isLatestMessage={false} />
      </RecoilRoot>,
    );

    expect(indicesIn(oldC)).toEqual(EXPECTED);
    expect(indicesIn(newC)).toEqual(EXPECTED);
  });

  it('keeps indices correct across a simulated stream (no drift under memoization)', () => {
    const oldC = streamThrough(OldMarkdown, MIXED);
    const newC = streamThrough(NewMarkdown, MIXED);

    expect(indicesIn(oldC)).toEqual(EXPECTED);
    expect(indicesIn(newC)).toEqual(EXPECTED);
  });

  it('streamed indices match a fresh direct render (stable for stored execution results)', () => {
    const streamed = streamThrough(NewMarkdown, MIXED);
    const { container: fresh } = render(
      <RecoilRoot>
        <Markdown content={MIXED} isLatestMessage={false} />
      </RecoilRoot>,
    );
    expect(indicesIn(streamed)).toEqual(indicesIn(fresh));
  });

  it('refreshes indices when an in-place edit inserts a code block before existing ones', () => {
    const before = 'intro\n\n```js\na\n```';
    const after = '```py\nx\n```\n\n```js\na\n```';
    const { container, rerender } = render(
      <RecoilRoot>
        <Markdown content={before} isLatestMessage={false} />
      </RecoilRoot>,
    );
    expect(indicesIn(container)).toEqual([{ idx: '0', lang: 'js' }]);

    rerender(
      <RecoilRoot>
        <Markdown content={after} isLatestMessage={false} />
      </RecoilRoot>,
    );
    // The js block's base shifted 0 -> 1; without forcing a remount its ref-cached
    // index would stay 0 (duplicating py). It must become 1.
    expect(indicesIn(container)).toEqual([
      { idx: '0', lang: 'py' },
      { idx: '1', lang: 'js' },
    ]);
  });
});

describe('MarkdownBlocks DOM equivalence (non-code blocks)', () => {
  const cases: Array<[string, string]> = [
    ['paragraphs', 'First paragraph.\n\nSecond paragraph.'],
    ['gfm table', ['| a | b |', '| - | - |', '| 1 | 2 |', '| 3 | 4 |'].join('\n')],
    ['unordered list', '- one\n- two\n- three'],
    ['ordered list', '1. one\n2. two'],
    ['headings + text', '# Title\n\nBody text with **bold** and _italics_.'],
    ['blockquote', '> quoted line one\n> quoted line two'],
    ['inline code', 'Use the `useMemo` hook for memoization.'],
    ['mixed', '# H\n\nPara with `code`.\n\n| x | y |\n| - | - |\n| 1 | 2 |\n\n- a\n- b'],
  ];

  it.each(cases)('renders identical DOM to the whole-message renderer: %s', (_label, content) => {
    const { container: oldC } = render(
      <RecoilRoot>
        <OldMarkdown content={content} />
      </RecoilRoot>,
    );
    const { container: newC } = render(
      <RecoilRoot>
        <Markdown content={content} isLatestMessage={false} />
      </RecoilRoot>,
    );
    expect(normalizeHtml(newC.innerHTML)).toBe(normalizeHtml(oldC.innerHTML));
  });
});

describe('MarkdownBlocks rendering smoke', () => {
  it('renders an empty cursor placeholder while initializing', () => {
    const { container } = render(
      <RecoilRoot>
        <Markdown content="" isLatestMessage={true} />
      </RecoilRoot>,
    );
    expect(container.querySelector('.result-thinking')).not.toBeNull();
  });

  it('renders executable code blocks for a multi-code message', () => {
    render(
      <RecoilRoot>
        <Markdown content={MIXED} isLatestMessage={false} />
      </RecoilRoot>,
    );
    expect(screen.getAllByTestId('cb')).toHaveLength(4);
  });
});

describe('MarkdownBlocks document-level definitions', () => {
  it('resolves a reference-style link whose definition is in a separate block', () => {
    const queryClient = new QueryClient();
    const content = 'See [docs][d] for details.\n\n[d]: https://example.com/docs';
    render(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <Markdown content={content} isLatestMessage={false} />
        </RecoilRoot>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      'https://example.com/docs',
    );
  });
});
