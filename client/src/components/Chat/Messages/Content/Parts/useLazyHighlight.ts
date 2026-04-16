import React, { useState, useEffect, useRef } from 'react';

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
  try {
    const tree = mod.lowlight.registered(lang)
      ? mod.lowlight.highlight(lang, code)
      : mod.lowlight.highlightAuto(code);
    return hastToReact(tree.children as HastNode[]);
  } catch {
    return [code];
  }
}

export default function useLazyHighlight(
  code: string | undefined,
  lang: string,
): React.ReactNode[] | null {
  const [highlighted, setHighlighted] = useState<React.ReactNode[] | null>(() => {
    if (!code || !lowlightModule) {
      return null;
    }
    return highlightCode(lowlightModule, code, lang);
  });
  const prevKey = useRef('');

  useEffect(() => {
    const key = `${lang}\0${code ?? ''}`;
    if (key === prevKey.current) {
      return;
    }
    prevKey.current = key;

    if (!code) {
      setHighlighted(null);
      return;
    }

    if (lowlightModule) {
      setHighlighted(highlightCode(lowlightModule, code, lang));
      return;
    }

    let cancelled = false;
    loadLowlight()
      .then((mod) => {
        if (!cancelled) {
          setHighlighted(highlightCode(mod, code, lang));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHighlighted([code]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  return highlighted;
}
