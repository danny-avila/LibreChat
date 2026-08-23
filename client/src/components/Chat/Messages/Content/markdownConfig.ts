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
import { langSubset, remarkApproxTilde } from '~/utils';
import { unicodeCitation } from '~/components/Web';

/**
 * Single source of truth for the markdown rendering pipeline, shared by the
 * whole-message renderer and the per-block memoized renderer so both produce
 * identical output.
 *
 * These are exposed as lazily-initialized getters rather than top-level
 * consts on purpose: MarkdownComponents participates in a circular import
 * (MarkdownComponents -> CodeBlock -> Parts -> Markdown -> here ->
 * MarkdownComponents). Reading code/a/... at module-evaluation time throws
 * Cannot access 'code' before initialization under native ESM. Deferring the
 * read to call time (when components render or memoize) sidesteps the
 * temporal dead zone.
 */
export const getRemarkPlugins = (): PluggableList => [
  remarkApproxTilde,
  supersub,
  remarkGfm,
  remarkDirective,
  artifactPlugin,
  [remarkMath, { singleDollarTextMath: false }],
  unicodeCitation,
  mcpUIResourcePlugin,
];

export const getRehypePlugins = (): PluggableList => [
  [rehypeKatex],
  [rehypeHighlight, { detect: true, ignoreMissing: true, subset: langSubset }],
];

export const getMarkdownComponents = (): { [nodeType: string]: ElementType } => ({
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
});
