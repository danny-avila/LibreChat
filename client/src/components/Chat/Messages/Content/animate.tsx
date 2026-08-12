import { memo, useRef, Fragment } from 'react';
import type { Root, Element, ElementContent } from 'hast';
import type { CSSProperties } from 'react';
import type { Plugin } from 'unified';

/** Must match the animation duration on `[data-lc-fade]` in style.css */
export const FADE_DURATION_MS = 250;
export const FADE_STAGGER_MS = 25;
export const FADE_STAGGER_MAX_MS = 250;

type FadeEntry = { at: number; delay: number };

export type FadeState = {
  /** Total characters classified during the previous run; parts below this offset are not new */
  prevCount: number;
  /** Parts still mid-animation, keyed by start offset, so re-renders replay identical props */
  active: Map<number, FadeEntry>;
};

type FadeRun = {
  state: FadeState;
  now: number;
  count: number;
  newIndex: number;
};

export type FadeSegment = {
  start: number;
  value: string;
  animated: boolean;
  delay: number;
};

const WORD_REGEX = /\S+\s*/g;
const NON_WHITESPACE_REGEX = /\S/;
const CJK_REGEX = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

let cjkSegmenter: Intl.Segmenter | null | undefined;

function getCjkSegmenter(): Intl.Segmenter | null {
  if (cjkSegmenter === undefined) {
    cjkSegmenter =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'word' })
        : null;
  }
  return cjkSegmenter;
}

function pushCjkParts(parts: string[], token: string): void {
  const segmenter = getCjkSegmenter();
  if (segmenter == null) {
    parts.push(token);
    return;
  }
  const trailing = /\s+$/.exec(token);
  const word = trailing == null ? token : token.slice(0, trailing.index);
  for (const segment of segmenter.segment(word)) {
    parts.push(segment.segment);
  }
  if (trailing != null) {
    parts.push(trailing[0]);
  }
}

/**
 * Splits text into word parts, each a non-whitespace run plus its trailing
 * whitespace, with whitespace-only runs kept as separate parts. Scripts
 * without word-delimiting spaces (CJK) are further split via Intl.Segmenter.
 * Concatenating the result always reproduces the input exactly.
 */
export function splitWords(value: string): string[] {
  const parts: string[] = [];
  WORD_REGEX.lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_REGEX.exec(value)) !== null) {
    if (match.index > index) {
      parts.push(value.slice(index, match.index));
    }
    const token = match[0];
    if (CJK_REGEX.test(token)) {
      pushCjkParts(parts, token);
    } else {
      parts.push(token);
    }
    index = match.index + token.length;
  }
  if (index < value.length) {
    parts.push(value.slice(index));
  }
  return parts;
}

export function createFadeState(): FadeState {
  return { prevCount: 0, active: new Map() };
}

export function beginRun(state: FadeState): FadeRun {
  return { state, now: performance.now(), count: 0, newIndex: 0 };
}

export function endRun(run: FadeRun): void {
  const { state, now } = run;
  state.prevCount = run.count;
  for (const [start, entry] of state.active) {
    if (now - entry.at >= entry.delay + FADE_DURATION_MS) {
      state.active.delete(start);
    }
  }
}

/**
 * Classifies one text value into fade segments, advancing the run's
 * document-order character offset. A part is animated when it starts past the
 * previous run's total offset (newly streamed) or when it is still within its
 * animation window from an earlier run — in which case it replays identical
 * animation props so React leaves the in-flight CSS animation untouched.
 */
export function classifyValue(run: FadeRun, value: string): FadeSegment[] {
  const { state, now } = run;
  const segments: FadeSegment[] = [];
  for (const part of splitWords(value)) {
    const start = run.count;
    run.count += part.length;
    if (!NON_WHITESPACE_REGEX.test(part)) {
      segments.push({ start, value: part, animated: false, delay: 0 });
      continue;
    }
    if (start >= state.prevCount) {
      const delay = Math.min(run.newIndex * FADE_STAGGER_MS, FADE_STAGGER_MAX_MS);
      run.newIndex += 1;
      state.active.set(start, { at: now, delay });
      segments.push({ start, value: part, animated: true, delay });
      continue;
    }
    const entry = state.active.get(start);
    if (entry != null && now - entry.at < entry.delay + FADE_DURATION_MS) {
      segments.push({ start, value: part, animated: true, delay: entry.delay });
      continue;
    }
    segments.push({ start, value: part, animated: false, delay: 0 });
  }
  return segments;
}

const SKIP_TAGS = new Set([
  'code',
  'pre',
  'svg',
  'math',
  'annotation',
  'script',
  'style',
  'artifact',
  'citation',
  'composite-citation',
  'highlighted-text',
  'mcp-ui-resource',
  'mcp-ui-carousel',
]);

function isSkippedElement(node: Element): boolean {
  if (SKIP_TAGS.has(node.tagName)) {
    return true;
  }
  const className = node.properties?.className;
  if (Array.isArray(className)) {
    return className.some((name) => typeof name === 'string' && name.startsWith('katex'));
  }
  return typeof className === 'string' && className.startsWith('katex');
}

function toContent(segment: FadeSegment): ElementContent {
  if (!NON_WHITESPACE_REGEX.test(segment.value)) {
    return { type: 'text', value: segment.value };
  }
  const properties: Element['properties'] = {};
  if (segment.animated) {
    properties.dataLcFade = '';
    if (segment.delay > 0) {
      properties.style = `--lc-delay:${segment.delay}ms`;
    }
  }
  return {
    type: 'element',
    tagName: 'span',
    properties,
    children: [{ type: 'text', value: segment.value }],
  };
}

function transformElement(run: FadeRun, element: Element): void {
  const next: ElementContent[] = [];
  for (const child of element.children) {
    if (child.type === 'text') {
      for (const segment of classifyValue(run, child.value)) {
        next.push(toContent(segment));
      }
      continue;
    }
    if (child.type === 'element' && !isSkippedElement(child)) {
      transformElement(run, child);
    }
    next.push(child);
  }
  element.children = next;
}

/**
 * Creates a per-renderer rehype plugin that wraps newly streamed words in
 * one-shot CSS fade spans (`[data-lc-fade]`). New-text detection uses
 * document-order character offsets held in the factory closure, so text that
 * was already visible in a previous render mounts as a bare span and never
 * re-animates, even when markdown re-parsing restructures the tree. Create one
 * instance per streaming renderer and drop it (plain plugin array) once the
 * stream ends so the settled message renders without wrapper spans.
 */
export function createFadePlugin(): Plugin<[], Root> {
  const state = createFadeState();
  return function rehypeFade() {
    return (tree: Root) => {
      const run = beginRun(state);
      for (const child of tree.children) {
        if (child.type === 'element' && !isSkippedElement(child)) {
          transformElement(run, child);
        }
      }
      endRun(run);
    };
  };
}

const DELAY_VAR = '--lc-delay';

/**
 * Plain-text counterpart of the rehype plugin for non-markdown streamed text
 * (reasoning). Renders words in fade spans keyed by character offset; only
 * render this while the text is actively streaming and render the raw string
 * once settled.
 */
export const AnimatedText = memo(function AnimatedText({ text }: { text: string }) {
  const stateRef = useRef<FadeState | null>(null);
  if (stateRef.current == null) {
    stateRef.current = createFadeState();
  }
  const run = beginRun(stateRef.current);
  const segments = classifyValue(run, text);
  endRun(run);

  return (
    <>
      {segments.map((segment) => {
        if (!segment.animated) {
          return <Fragment key={segment.start}>{segment.value}</Fragment>;
        }
        const style =
          segment.delay > 0 ? ({ [DELAY_VAR]: `${segment.delay}ms` } as CSSProperties) : undefined;
        return (
          <span key={segment.start} data-lc-fade="" style={style}>
            {segment.value}
          </span>
        );
      })}
    </>
  );
});
AnimatedText.displayName = 'AnimatedText';
