import React, { useState, useEffect } from 'react';

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

/** The tokens held, with the input they were produced from. Nothing to show is the empty key,
 *  so a hook mounted without code still recognizes the first code it receives as new. */
type HighlightState = { key: string; nodes: React.ReactNode[] | null };

const NOTHING_HIGHLIGHTED: HighlightState = { key: '', nodes: null };

const highlightKey = (code: string | undefined, lang: string): string =>
  code ? `${lang}\0${code}` : '';

/**
 * Tokens for a block of code, once the grammars have loaded.
 *
 * Highlighting runs when the input changes, and once per input: the tokens carry the key they
 * were produced from, so a mount that could highlight immediately is not repeated by the effect
 * that follows it. Grammars load on first use, so a caller renders its own raw text until this
 * returns; passing `undefined` while a pane is closed keeps a collapsed card from tokenizing
 * output nobody is reading.
 */
export default function useLazyHighlight(
  code: string | undefined,
  lang: string,
): React.ReactNode[] | null {
  const [state, setState] = useState<HighlightState>(() =>
    code && lowlightModule
      ? { key: highlightKey(code, lang), nodes: highlightCode(lowlightModule, code, lang) }
      : NOTHING_HIGHLIGHTED,
  );
  const key = highlightKey(code, lang);
  const currentKey = state.key;

  useEffect(() => {
    if (key === currentKey) {
      return;
    }

    if (!code) {
      setState(NOTHING_HIGHLIGHTED);
      return;
    }

    if (lowlightModule) {
      setState({ key, nodes: highlightCode(lowlightModule, code, lang) });
      return;
    }

    let cancelled = false;
    loadLowlight()
      .then((mod) => {
        if (!cancelled) {
          setState({ key, nodes: highlightCode(mod, code, lang) });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ key, nodes: [code] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key, currentKey, code, lang]);

  return state.nodes;
}
