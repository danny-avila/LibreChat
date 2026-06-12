import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { directive } from 'micromark-extension-directive';
import { directiveFromMarkdown } from 'mdast-util-directive';

export type MarkdownBlock = {
  /** Exact source slice for this top-level block. */
  raw: string;
  /** Executable code blocks within this block (those that render a runnable CodeBlock). */
  codeBlockCount: number;
  /** Artifact containers within this block. */
  artifactCount: number;
};

type MdastNode = {
  type: string;
  name?: string;
  lang?: string | null;
  value?: string;
  children?: MdastNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

/**
 * Mirror the `code` component's decision for whether a fenced block renders as a
 * runnable CodeBlock (and therefore consumes a block index). Every fenced code
 * block does, except `math` and `mermaid` fences, which have dedicated
 * renderers. mdast strips a fenced block's trailing newline, but
 * react-markdown/remark-rehype re-add it, so the `code` component never treats a
 * fenced block as single-line inline code regardless of its language — only true
 * inline code (an `inlineCode` node, not counted here) is.
 */
const renderedCodeLang = (lang: string): string =>
  /language-(\w+)/.exec(`language-${lang}`)?.[1] ?? '';

/**
 * Normalize the fence info string the same way the `code` component does — it
 * reads the language from `className` via `/language-(\w+)/`, so only the leading
 * word characters survive (`mermaid-js` → `mermaid`, `math-tex` → `math`). A
 * fence is executable (consumes a CodeBlock index) unless it normalizes to
 * `math` or `mermaid`, which have dedicated renderers.
 */
const isExecutableCode = (lang: string): boolean => {
  const normalized = renderedCodeLang(lang);
  return normalized !== 'math' && normalized !== 'mermaid';
};

const containsDefinition = (node: MdastNode): boolean => {
  if (node.type === 'definition' || node.type === 'footnoteDefinition') {
    return true;
  }
  return (node.children ?? []).some(containsDefinition);
};

const ARTIFACT_DIRECTIVE_TYPES = new Set(['containerDirective', 'leafDirective']);

const countWithin = (node: MdastNode, counts: { code: number; artifact: number }): void => {
  if (ARTIFACT_DIRECTIVE_TYPES.has(node.type) && node.name === 'artifact') {
    // artifactPlugin renders container (`:::artifact:::`) and leaf
    // (`::artifact{}`) artifact directives as an Artifact, each consuming one
    // index; their children never render as executable code blocks, so stop
    // descending. Inline text directives (`:artifact{}`) are intentionally
    // excluded — the plugin rewrites every textDirective to literal text, so no
    // Artifact renders and no index is consumed.
    counts.artifact += 1;
    return;
  }
  if (node.type === 'code' && isExecutableCode(node.lang ?? '')) {
    counts.code += 1;
  }
  if (node.children) {
    for (const child of node.children) {
      countWithin(child, counts);
    }
  }
};

/**
 * Parse markdown into an mdast tree using the same structural constructs the
 * render pipeline relies on (GFM tables, container directives like
 * `:::artifact:::`, and `$$` math), so top-level block boundaries match what
 * react-markdown produces. Inline-only transforms (citations, MCP-UI markers,
 * supersub) never cross a top-level block, so they are intentionally omitted.
 */
const parseToMdast = (content: string): MdastNode =>
  fromMarkdown(content, {
    extensions: [gfm(), directive(), math()],
    mdastExtensions: [gfmFromMarkdown(), directiveFromMarkdown(), mathFromMarkdown()],
  }) as MdastNode;

/**
 * Split a markdown string into its top-level blocks, returning the exact source
 * slice for each block plus the index counts it consumes. Completed blocks
 * produce byte-identical slices (and stable counts) across streamed updates,
 * which is what makes per-block memoization effective: only the final, still-
 * growing block changes from one token to the next.
 *
 * Inter-block whitespace (blank lines) is not part of any node's span and is
 * dropped; block-level elements carry their own margins, so rendering each
 * slice independently is visually equivalent to rendering the whole string.
 */
export function splitMarkdownIntoBlocks(content: string): MarkdownBlock[] {
  if (!content) {
    return [];
  }

  const tree = parseToMdast(content);
  const children = tree.children ?? [];

  if (children.length === 0) {
    return [{ raw: content, codeBlockCount: 0, artifactCount: 0 }];
  }

  // Per-block rendering loses document-global context, so render the whole
  // message as one block when it uses a construct that needs it:
  //  - reference/footnote definitions are document-scoped (and may be nested in
  //    a blockquote or list item), so a reference would otherwise render as
  //    literal text once severed from its definition; and
  //  - top-level raw HTML blocks are escaped to text (rehypeRaw is not enabled),
  //    so the separator between adjacent HTML blocks would otherwise be dropped.
  const requiresWholeMessage = children.some(
    (node) => node.type === 'html' || containsDefinition(node),
  );
  if (requiresWholeMessage) {
    return [{ raw: content, ...blockCounts(children) }];
  }

  const blocks: MarkdownBlock[] = [];

  for (const node of children) {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (start == null || end == null) {
      return [{ raw: content, ...blockCounts(children) }];
    }
    const counts = { code: 0, artifact: 0 };
    countWithin(node, counts);
    blocks.push({
      raw: content.slice(start, end),
      codeBlockCount: counts.code,
      artifactCount: counts.artifact,
    });
  }

  return blocks;
}

const blockCounts = (children: MdastNode[]): { codeBlockCount: number; artifactCount: number } => {
  const counts = { code: 0, artifact: 0 };
  for (const node of children) {
    countWithin(node, counts);
  }
  return { codeBlockCount: counts.code, artifactCount: counts.artifact };
};
