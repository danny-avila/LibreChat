import React, { useState, useEffect, useRef } from 'react';

/** Minimum gap between highlights while the input keeps changing (streaming). */
export const HIGHLIGHT_THROTTLE_MS = 300;
export const CodeHighlightThrottleContext = React.createContext(HIGHLIGHT_THROTTLE_MS);

export function normalizeCodeHighlightThrottleMs(value: unknown): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 60000
    ? value
    : HIGHLIGHT_THROTTLE_MS;
}

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

type HighlightedValue = {
  key: string;
  nodes: React.ReactNode[];
};

export default function useLazyHighlight(
  code: string | undefined,
  lang: string,
): React.ReactNode[] | null {
  const throttleMs = React.useContext(CodeHighlightThrottleContext);
  const currentKey = `${lang}\0${code ?? ''}`;
  const initialKey = code && lowlightModule ? currentKey : '';
  const hasInitialHighlight = Boolean(code && lowlightModule);
  const [highlighted, setHighlighted] = useState<HighlightedValue | null>(() => {
    if (!hasInitialHighlight) {
      return null;
    }
    return { key: initialKey, nodes: highlightCode(lowlightModule!, code!, lang) };
  });
  const prevKey = useRef(initialKey);
  const prevThrottleMs = useRef<number | null>(hasInitialHighlight ? throttleMs : null);
  const currentTime = typeof performance === 'undefined' ? Date.now() : performance.now();
  const lastRunAt = useRef<number | null>(hasInitialHighlight ? currentTime : null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = `${lang}\0${code ?? ''}`;
    const keyChanged = key !== prevKey.current;
    const throttleChanged = throttleMs !== prevThrottleMs.current;
    if (!keyChanged && !throttleChanged) {
      return;
    }
    prevKey.current = keyChanged ? key : prevKey.current;
    prevThrottleMs.current = throttleMs;
    generation.current += 1;
    if (keyChanged) {
      setHighlighted(null);
    }

    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (!code) {
      lastRunAt.current = null;
      return;
    }

    if (lang === 'plaintext') {
      setHighlighted({ key, nodes: [code] });
      return;
    }

    const run = () => {
      timer.current = null;
      lastRunAt.current = typeof performance === 'undefined' ? Date.now() : performance.now();
      const gen = ++generation.current;

      if (lowlightModule) {
        setHighlighted({ key, nodes: highlightCode(lowlightModule, code, lang) });
        return;
      }

      loadLowlight()
        .then((mod) => {
          if (gen === generation.current) {
            setHighlighted({ key, nodes: highlightCode(mod, code, lang) });
          }
        })
        .catch(() => {
          if (gen === generation.current) {
            setHighlighted({ key, nodes: [code] });
          }
        });
    };

    let elapsed = throttleMs;
    if (lastRunAt.current !== null) {
      elapsed =
        typeof performance === 'undefined'
          ? Date.now() - lastRunAt.current
          : performance.now() - lastRunAt.current;
    }
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
      prevKey.current = '';
      prevThrottleMs.current = null;
      generation.current += 1;
    },
    [],
  );
  if (highlighted?.key === currentKey) {
    return highlighted.nodes;
  }
  return code ? [code] : null;
}
