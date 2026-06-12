import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkDirective from 'remark-directive';
import type { PluggableList } from 'unified';
import type { ElementType } from 'react';
import {
  mcpUIResourcePlugin,
  MCPUIResource,
  MCPUIResourceCarousel,
} from '~/components/MCPUIResource';
import { Citation, CompositeCitation, HighlightedText } from '~/components/Web/Citation';
import { Artifact, artifactPlugin } from '~/components/Artifacts/Artifact';
import { code, a, p, img, table } from './MarkdownComponents';
import { unicodeCitation } from '~/components/Web';
import { langSubset } from '~/utils';

/**
 * Single source of truth for the markdown rendering pipeline, shared by the
 * whole-message renderer and the per-block memoized renderer so both produce
 * identical output.
 *
 * These are exposed as lazily-initialized, cached getters rather than top-level
 * consts on purpose: `MarkdownComponents` participates in a circular import
 * (`MarkdownComponents` → `CodeBlock` → `Parts` → `Markdown` → here →
 * `MarkdownComponents`). Reading `code`/`a`/… at module-evaluation time throws
 * `Cannot access 'code' before initialization` under native ESM. Deferring the
 * read to first call (render time) sidesteps the temporal dead zone, and caching
 * keeps a stable reference so react-markdown does not rebuild its processor.
 */
let remarkPluginsCache: PluggableList | null = null;
let rehypePluginsCache: PluggableList | null = null;
let markdownComponentsCache: { [nodeType: string]: ElementType } | null = null;

export const getRemarkPlugins = (): PluggableList => {
  if (remarkPluginsCache === null) {
    remarkPluginsCache = [
      supersub,
      remarkGfm,
      remarkDirective,
      artifactPlugin,
      [remarkMath, { singleDollarTextMath: false }],
      unicodeCitation,
      mcpUIResourcePlugin,
    ];
  }
  return remarkPluginsCache;
};

export const getRehypePlugins = (): PluggableList => {
  if (rehypePluginsCache === null) {
    rehypePluginsCache = [
      [rehypeKatex],
      [rehypeHighlight, { detect: true, ignoreMissing: true, subset: langSubset }],
    ];
  }
  return rehypePluginsCache;
};

export const getMarkdownComponents = (): { [nodeType: string]: ElementType } => {
  if (markdownComponentsCache === null) {
    markdownComponentsCache = {
      code,
      a,
      p,
      img,
      table,
      artifact: Artifact,
      citation: Citation,
      'highlighted-text': HighlightedText,
      'composite-citation': CompositeCitation,
      'mcp-ui-resource': MCPUIResource,
      'mcp-ui-carousel': MCPUIResourceCarousel,
    };
  }
  return markdownComponentsCache;
};
