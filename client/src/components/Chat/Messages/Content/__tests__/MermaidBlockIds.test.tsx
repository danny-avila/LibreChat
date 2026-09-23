import React from 'react';
import { render, screen } from '@testing-library/react';
import { getRemarkPlugins, getRehypePlugins, getMarkdownComponents } from '../markdownConfig';
import MarkdownBlocks from '../MarkdownBlocks';

/**
 * Mermaid fences do not consume a code-block index, so before they carried
 * their own sequence every diagram in a message received the same `mermaid-N`
 * id and therefore the same Recoil artifact key.
 */
jest.mock('~/components/Messages/Content/Mermaid', () => ({
  __esModule: true,
  default: ({ id, children }: { id?: string; children: string }) => (
    <div data-testid="mermaid" data-mermaid-id={String(id)}>
      {children}
    </div>
  ),
  MermaidErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('~/components/Messages/Content/CodeBlock', () => ({
  __esModule: true,
  default: ({ blockIndex }: { blockIndex?: number }) => (
    <div data-testid="code-block" data-block-index={String(blockIndex)} />
  ),
}));

const renderMarkdown = (content: string) =>
  render(
    <MarkdownBlocks
      content={content}
      remarkPlugins={getRemarkPlugins()}
      rehypePlugins={getRehypePlugins()}
      components={getMarkdownComponents()}
    />,
  );

const mermaidIds = () =>
  screen.getAllByTestId('mermaid').map((element) => element.getAttribute('data-mermaid-id'));

describe('Mermaid block ids', () => {
  it('gives each Mermaid fence in a message a distinct id', () => {
    renderMarkdown(
      ['```mermaid', 'graph TD', 'A-->B', '```', '', '```mermaid', 'graph TD', 'C-->D', '```'].join(
        '\n',
      ),
    );

    const ids = mermaidIds();
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps Mermaid ids distinct across intervening executable code blocks', () => {
    renderMarkdown(
      [
        '```mermaid',
        'graph TD',
        'A-->B',
        '```',
        '',
        '```python',
        'print("hi")',
        '```',
        '',
        '```mermaid',
        'graph TD',
        'C-->D',
        '```',
        '',
        '```mermaid',
        'graph TD',
        'E-->F',
        '```',
      ].join('\n'),
    );

    const ids = mermaidIds();
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  /**
   * Fences nested in one top-level block share a provider and re-run their
   * index on every streamed token, so the counter has to restart per render.
   * Without that restart the indices climb as the message grows and a diagram
   * already open in the panel loses the artifact id it was registered under.
   */
  it('holds Mermaid ids steady as a nested block keeps streaming', () => {
    const listWithOne = ['- step one', '', '  ```mermaid', '  graph TD', '  A-->B', '  ```'].join(
      '\n',
    );
    const listWithTwo = [
      listWithOne,
      '',
      '- step two',
      '',
      '  ```mermaid',
      '  graph TD',
      '  C-->D',
      '  ```',
    ].join('\n');
    const listStillGrowing = [listWithTwo, '', '- step three'].join('\n');

    const { rerender } = renderMarkdown(listWithOne);
    expect(mermaidIds()).toEqual(['mermaid-0']);

    const view = (content: string) => (
      <MarkdownBlocks
        content={content}
        remarkPlugins={getRemarkPlugins()}
        rehypePlugins={getRehypePlugins()}
        components={getMarkdownComponents()}
      />
    );

    rerender(view(listWithTwo));
    expect(mermaidIds()).toEqual(['mermaid-0', 'mermaid-1']);

    rerender(view(listStillGrowing));
    expect(mermaidIds()).toEqual(['mermaid-0', 'mermaid-1']);
  });

  it('does not let a Mermaid fence disturb executable code block indices', () => {
    renderMarkdown(
      [
        '```python',
        'print("first")',
        '```',
        '',
        '```mermaid',
        'graph TD',
        'A-->B',
        '```',
        '',
        '```python',
        'print("second")',
        '```',
      ].join('\n'),
    );

    const indices = screen
      .getAllByTestId('code-block')
      .map((element) => element.getAttribute('data-block-index'));
    expect(indices).toEqual(['0', '1']);
  });
});
