import React, { useState, useEffect, useRef } from 'react';

import { useGetStartupConfig } from '~/data-provider';

/** Minimum gap between highlights while the input keeps changing (streaming). */
export const HIGHLIGHT_THROTTLE_MS = 300;

interface HastText {
  type: 'text';
  value: string;
}

interface HastElement {
  type: 'element';
  tagName: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

type HastNode = HastText | HastElement;

function hastToReact(nodes: HastNode[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === 'text') {
      return node.value;
    }
    return React.createElement(
      node.tagName,
      { key: i, className: node.properties?.className?.join(' ') },
      node.children ? hastToReact(node.children) : undefined,
    );
  });
}

type LowlightModule = typeof import('lowlight');

let lowlightPromise: Promise<LowlightModule> | null = null;
let lowlightModule: LowlightModule | null = null;

function loadLowlight(): Promise<LowlightModule> {
  if (lowlightModule) {
    return Promise.resolve(lowlightModule);
  }
  if (!lowlightPromise) {
    lowlightPromise = import('lowlight').then((mod) => {
      lowlightModule = mod;
      return mod;
    });
  }
  return lowlightPromise;
}

function highlightCode(mod: LowlightModule, code: string, lang: string): React.ReactNode[] {
  if (lang === 'plaintext') {
    return [code];
  }
  try {
    const tree = mod.lowlight.registered(lang)
      ? mod.lowlight.highlight(lang, code)
      : mod.lowlight.highlightAuto(code);
    return hastToReact(tree.children as HastNode[]);
  } catch {
    return [code];
  }
}

/**
 * Highlights `code` with lowlight, loading the grammar module lazily.
 *
 * The first value highlights immediately; while the value keeps changing
 * (e.g. a streamed tool call) re-highlights are throttled to one per
 * `HIGHLIGHT_THROTTLE_MS`, with a trailing run so the settled value is
 * always highlighted. Returns `null` until the first highlight completes.
 */
export default function useLazyHighlight(
  code: string | undefined,
  lang: string,
): React.ReactNode[] | null {
  const { data: startupConfig } = useGetStartupConfig();
  const throttleMs = startupConfig?.interface?.codeHighlightThrottleMs ?? HIGHLIGHT_THROTTLE_MS;
  const [highlighted, setHighlighted] = useState<React.ReactNode[] | null>(() => {
    if (!code || !lowlightModule) {
      return null;
    }
    return highlightCode(lowlightModule, code, lang);
  });
  const prevKey = useRef('');
  const lastRunAt = useRef(0);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = `${lang}\0${code ?? ''}`;
    if (key === prevKey.current) {
      return;
    }
    prevKey.current = key;
    generation.current += 1;

    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (!code) {
      setHighlighted(null);
      return;
    }

    const run = () => {
      timer.current = null;
      lastRunAt.current = typeof performance === 'undefined' ? Date.now() : performance.now();
      const gen = ++generation.current;

      if (lowlightModule) {
        setHighlighted(highlightCode(lowlightModule, code, lang));
        return;
      }

      loadLowlight()
        .then((mod) => {
          if (gen === generation.current) {
            setHighlighted(highlightCode(mod, code, lang));
          }
        })
        .catch(() => {
          if (gen === generation.current) {
            setHighlighted([code]);
          }
        });
    };

    const elapsed =
      typeof performance === 'undefined'
        ? Date.now() - lastRunAt.current
        : performance.now() - lastRunAt.current;
    const wait = throttleMs - elapsed;
    if (wait <= 0) {
      run();
    } else {
      timer.current = setTimeout(run, wait);
    }
  }, [code, lang, throttleMs]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      generation.current += 1;
    },
    [],
  );

  return highlighted;
}
