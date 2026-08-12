import React from 'react';
import ReactMarkdown from 'react-markdown';
import { render } from '@testing-library/react';
import {
  splitWords,
  beginRun,
  endRun,
  classifyValue,
  createFadeState,
  createFadePlugin,
  AnimatedText,
  FADE_DURATION_MS,
  FADE_STAGGER_MS,
  FADE_STAGGER_MAX_MS,
} from '../animate';

let nowSpy: jest.SpyInstance<number, []>;
let mockedNow = 0;

const setTime = (value: number) => {
  mockedNow = value;
};

beforeEach(() => {
  mockedNow = 0;
  nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => mockedNow);
});

afterEach(() => {
  nowSpy.mockRestore();
});

describe('splitWords', () => {
  it('splits into word parts with trailing whitespace and round-trips exactly', () => {
    const value = '  Hello world,\nthis  is streamed ';
    const parts = splitWords(value);
    expect(parts.join('')).toBe(value);
    expect(parts[0]).toBe('  ');
    expect(parts[1]).toBe('Hello ');
    expect(parts[2]).toBe('world,\n');
  });

  it('splits CJK runs into smaller segments', () => {
    const parts = splitWords('これは日本語のテストです');
    expect(parts.join('')).toBe('これは日本語のテストです');
    expect(parts.length).toBeGreaterThan(1);
  });
});

describe('classifyValue', () => {
  it('animates every word on the first run with capped stagger', () => {
    const state = createFadeState();
    const run = beginRun(state);
    const words = 'a b c d e f g h i j k l m'.split(' ').join(' ');
    const segments = classifyValue(run, words).filter((segment) => /\S/.test(segment.value));
    endRun(run);

    expect(segments.every((segment) => segment.animated)).toBe(true);
    expect(segments[0].delay).toBe(0);
    expect(segments[1].delay).toBe(FADE_STAGGER_MS);
    const maxDelay = Math.max(...segments.map((segment) => segment.delay));
    expect(maxDelay).toBe(FADE_STAGGER_MAX_MS);
  });

  it('does not animate whitespace parts', () => {
    const state = createFadeState();
    const run = beginRun(state);
    const segments = classifyValue(run, '  hello  ');
    endRun(run);
    const whitespace = segments.filter((segment) => !/\S/.test(segment.value));
    expect(whitespace.length).toBeGreaterThan(0);
    expect(whitespace.every((segment) => !segment.animated)).toBe(true);
  });

  it('only animates newly appended words on later runs', () => {
    const state = createFadeState();
    const first = beginRun(state);
    classifyValue(first, 'hello world ');
    endRun(first);

    setTime(FADE_DURATION_MS + FADE_STAGGER_MAX_MS + 1);
    const second = beginRun(state);
    const segments = classifyValue(second, 'hello world and more');
    endRun(second);

    const byValue = new Map(segments.map((segment) => [segment.value.trim(), segment]));
    expect(byValue.get('hello')?.animated).toBe(false);
    expect(byValue.get('world')?.animated).toBe(false);
    expect(byValue.get('and')?.animated).toBe(true);
    expect(byValue.get('more')?.animated).toBe(true);
  });

  it('replays identical animation props for words still inside their window', () => {
    const state = createFadeState();
    const first = beginRun(state);
    const firstSegments = classifyValue(first, 'hello world');
    endRun(first);
    const worldDelay = firstSegments.find((s) => s.value === 'world')?.delay;

    setTime(FADE_DURATION_MS / 2);
    const second = beginRun(state);
    const segments = classifyValue(second, 'hello world again');
    endRun(second);

    const world = segments.find((segment) => segment.value.trim() === 'world');
    expect(world?.animated).toBe(true);
    expect(world?.delay).toBe(worldDelay);
  });

  it('keeps animating a word that grows at the stream head', () => {
    const state = createFadeState();
    const first = beginRun(state);
    classifyValue(first, 'hel');
    endRun(first);

    setTime(FADE_DURATION_MS / 2);
    const second = beginRun(state);
    const segments = classifyValue(second, 'hello');
    endRun(second);
    expect(segments[0].animated).toBe(true);
    expect(segments[0].delay).toBe(0);
  });
});

describe('createFadePlugin', () => {
  const renderMarkdown = (plugin: ReturnType<typeof createFadePlugin>, content: string) => (
    /** @ts-ignore */
    <ReactMarkdown rehypePlugins={[plugin]}>{content}</ReactMarkdown>
  );

  it('wraps words in fade spans on first render, including inline formatting', () => {
    const plugin = createFadePlugin();
    const { container } = render(renderMarkdown(plugin, 'Hello **bold** world'));
    const spans = container.querySelectorAll('span[data-lc-fade]');
    expect(spans.length).toBe(3);
    expect(container.textContent).toBe('Hello bold world');
  });

  it('does not wrap text inside code blocks or inline code', () => {
    const plugin = createFadePlugin();
    const { container } = render(
      renderMarkdown(plugin, 'text `inline code` more\n\n```\nconst x = 1;\n```'),
    );
    expect(container.querySelector('code span[data-lc-fade]')).toBeNull();
    expect(container.querySelector('pre span[data-lc-fade]')).toBeNull();
    expect(container.querySelectorAll('p span[data-lc-fade]').length).toBe(2);
  });

  it('only animates appended words across streamed re-renders', () => {
    const plugin = createFadePlugin();
    const { container, rerender } = render(renderMarkdown(plugin, 'Hello world'));

    setTime(FADE_DURATION_MS + FADE_STAGGER_MAX_MS + 1);
    rerender(renderMarkdown(plugin, 'Hello world and more text'));

    const animated = Array.from(container.querySelectorAll('span[data-lc-fade]')).map((span) =>
      span.textContent?.trim(),
    );
    expect(animated).toEqual(['and', 'more', 'text']);
    const bare = Array.from(container.querySelectorAll('p > span:not([data-lc-fade])')).map(
      (span) => span.textContent?.trim(),
    );
    expect(bare).toEqual(['Hello', 'world']);
  });

  it('does not re-animate words when markdown restructures around them', () => {
    const plugin = createFadePlugin();
    const { container, rerender } = render(renderMarkdown(plugin, 'Result is done and'));

    setTime(FADE_DURATION_MS + FADE_STAGGER_MAX_MS + 1);
    rerender(renderMarkdown(plugin, 'Result is done and **final**'));

    const animated = Array.from(container.querySelectorAll('span[data-lc-fade]')).map((span) =>
      span.textContent?.trim(),
    );
    expect(animated).toEqual(['final']);
  });
});

describe('AnimatedText', () => {
  it('renders new words in fade spans and settles old words to plain text', () => {
    const { container, rerender } = render(<AnimatedText text="thinking about" />);
    expect(container.querySelectorAll('span[data-lc-fade]').length).toBe(2);

    setTime(FADE_DURATION_MS + FADE_STAGGER_MAX_MS + 1);
    rerender(<AnimatedText text="thinking about the answer" />);

    const animated = Array.from(container.querySelectorAll('span[data-lc-fade]')).map((span) =>
      span.textContent?.trim(),
    );
    expect(animated).toEqual(['the', 'answer']);
    expect(container.textContent).toBe('thinking about the answer');
  });
});
