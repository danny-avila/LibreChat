import supersub from 'remark-supersub';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { defaultUrlTransform } from 'react-markdown';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { directive } from 'micromark-extension-directive';
import { directiveFromMarkdown } from 'mdast-util-directive';
import type { AlignType, Definition, Root, RootContent, Table } from 'mdast';
import type { Extension as MicromarkExtension } from 'micromark-util-types';
import { remarkApproxTilde } from './tilde';
import { preprocessLaTeX } from './latex';

/**
 * Which message renderer this copy has to match. `Markdown` (assistant turns)
 * enables directives; `MarkdownLite` (user turns) does not, so a user message
 * showing literal `:::` markers must keep them.
 */
export type MarkdownVariant = 'full' | 'lite';

export type RichTextMode = {
  variant: MarkdownVariant;
  /** Whether `Markdown`'s LaTeX preprocessing is on, mirroring `LaTeXParsing`. */
  latex: boolean;
  /**
   * Reference labels that must not resolve against a definition. Citation
   * markers are generated as `[1]`, `[2]`, and a message that also defines
   * `[1]: https://elsewhere` would otherwise capture them.
   */
  reserved?: ReadonlySet<string>;
};

/**
 * `remark-supersub` is typed as a unified `Transformer`, which declares a
 * `file` and a `next` the plugin never reads: it only walks the tree. Narrowing
 * those to optional arguments lets it be called as the plain mdast transform it
 * is, so this copy stays on exactly the transform the renderers apply.
 */
const applySuperSub = supersub() as (tree: Root, file?: unknown, next?: unknown) => void;

/** `remark-supersub` produces these outside of mdast's own node set. */
type SuperSubNode = {
  type: 'superscript' | 'subscript';
  children: SerializableNode[];
};

type SerializableNode = RootContent | SuperSubNode;

const MONOSPACE = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

/**
 * The paste target's theme is unknowable, so a background is only ever set
 * together with its own foreground. Everything else inherits the destination's
 * colors rather than assuming a light canvas.
 */
const CODE_COLORS = 'background-color:#f6f8fa;color:#24292f;';
const BORDER = '1px solid #d0d7de';

const STYLES = {
  inlineCode: `font-family:${MONOSPACE};${CODE_COLORS}border-radius:4px;padding:0.15em 0.35em;`,
  codeBlock: `font-family:${MONOSPACE};${CODE_COLORS}border-radius:6px;padding:12px;white-space:pre-wrap;`,
  blockquote: 'margin:0 0 16px;padding:0 1em;border-left:4px solid #d0d7de;',
  table: 'border-collapse:collapse;',
  headerCell: `border:${BORDER};padding:6px 13px;${CODE_COLORS}`,
  cell: `border:${BORDER};padding:6px 13px;`,
} as const;

const EMPTY_RESERVED: ReadonlySet<string> = new Set();

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

type SerializeContext = {
  definitions: Map<string, Definition>;
  /** Footnote label to its displayed number, in the order references appear. */
  footnotes: Map<string, number>;
  reserved: ReadonlySet<string>;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

/**
 * Message text renders under `white-space: pre-wrap`, so a soft line break is a
 * visible line on screen. HTML would collapse the newline to a space, which is
 * what every paste target would then show.
 */
const escapeText = (value: string): string => escapeHtml(value).replace(/\n/g, '<br />');

const alignStyle = (align: AlignType | undefined): string =>
  align == null ? '' : `text-align:${align};`;

const taskMarker = (checked: boolean | null | undefined): string => {
  if (checked === true) {
    return '☑ ';
  }
  return checked === false ? '☐ ' : '';
};

function isAbsoluteUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Screens the URL exactly as the renderer does, through react-markdown's own
 * transform, then resolves what it keeps. A relative URL resolves against
 * LibreChat on screen but against the destination document once pasted, so it
 * has to leave absolute. Already-absolute URLs are passed through verbatim
 * rather than normalized, which would rewrite what the user sees.
 */
function resolveUrl(url: string): string {
  const transformed = defaultUrlTransform(url);
  if (transformed.length === 0 || isAbsoluteUrl(transformed)) {
    return transformed;
  }

  try {
    return new URL(transformed, document.baseURI).href;
  } catch {
    return transformed;
  }
}

const anchor = (url: string, children: string): string => {
  const resolved = resolveUrl(url);
  return resolved.length > 0 ? `<a href="${escapeHtml(resolved)}">${children}</a>` : children;
};

const image = (url: string, alt: string): string => {
  const resolved = resolveUrl(url);
  return resolved.length > 0
    ? `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}" />`
    : escapeHtml(alt);
};

/**
 * Reference-style links resolve against definitions that may appear anywhere in
 * the message, including after their use, and footnotes are numbered by the
 * order their references appear, so both are collected before any node is
 * serialized.
 */
function collectContext(nodes: readonly SerializableNode[], context: SerializeContext): void {
  for (const node of nodes) {
    if (node.type === 'definition') {
      context.definitions.set(node.identifier, node);
      continue;
    }
    if (node.type === 'footnoteReference' && !context.footnotes.has(node.identifier)) {
      context.footnotes.set(node.identifier, context.footnotes.size + 1);
    }
    if ('children' in node) {
      collectContext(node.children, context);
    }
  }
}

type Reference = {
  identifier: string;
  label?: string | null;
  referenceType: 'shortcut' | 'collapsed' | 'full';
};

const resolveReference = (node: Reference, context: SerializeContext): Definition | undefined =>
  context.reserved.has(node.identifier) ? undefined : context.definitions.get(node.identifier);

/**
 * An unresolved reference falls back to its own source form, the way
 * remark-rehype reverts one it cannot match.
 */
function revertReference(node: Reference, inner: string, prefix: string): string {
  if (node.referenceType === 'full') {
    return `${prefix}[${inner}][${escapeText(node.label ?? node.identifier)}]`;
  }
  if (node.referenceType === 'collapsed') {
    return `${prefix}[${inner}][]`;
  }
  return `${prefix}[${inner}]`;
}

function serializeTable(node: Table, context: SerializeContext): string {
  const align = node.align ?? [];
  const [headerRow, ...bodyRows] = node.children;

  const cells = (row: (typeof node.children)[number], tag: 'th' | 'td', style: string): string => {
    let html = '';
    for (let index = 0; index < row.children.length; index++) {
      const cell = row.children[index];
      html += `<${tag} style="${style}${alignStyle(align[index])}">${serializeChildren(
        cell.children,
        context,
      )}</${tag}>`;
    }
    return `<tr>${html}</tr>`;
  };

  const head = headerRow ? `<thead>${cells(headerRow, 'th', STYLES.headerCell)}</thead>` : '';

  let body = '';
  for (const row of bodyRows) {
    body += cells(row, 'td', STYLES.cell);
  }

  return `<table style="${STYLES.table}">${head}${body && `<tbody>${body}</tbody>`}</table>`;
}

/**
 * Raw HTML is emitted as text because the message renderer does not enable
 * `rehype-raw` either: what the user sees is the literal markup, and the
 * clipboard copy must not smuggle live markup into the paste target.
 */
function serializeNode(node: SerializableNode, context: SerializeContext): string {
  switch (node.type) {
    case 'text':
    case 'html':
      return escapeText(node.value);
    case 'paragraph':
      return `<p>${serializeChildren(node.children, context)}</p>`;
    case 'heading':
      return `<h${node.depth}>${serializeChildren(node.children, context)}</h${node.depth}>`;
    case 'strong':
      return `<strong>${serializeChildren(node.children, context)}</strong>`;
    case 'emphasis':
      return `<em>${serializeChildren(node.children, context)}</em>`;
    case 'delete':
      return `<s>${serializeChildren(node.children, context)}</s>`;
    case 'superscript':
      return `<sup>${serializeChildren(node.children, context)}</sup>`;
    case 'subscript':
      return `<sub>${serializeChildren(node.children, context)}</sub>`;
    case 'inlineCode':
      return `<code style="${STYLES.inlineCode}">${escapeHtml(node.value)}</code>`;
    case 'code':
      return `<pre style="${STYLES.codeBlock}"><code>${escapeHtml(node.value)}</code></pre>`;
    case 'blockquote':
      return `<blockquote style="${STYLES.blockquote}">${serializeChildren(
        node.children,
        context,
      )}</blockquote>`;
    case 'list': {
      const tag = node.ordered === true ? 'ol' : 'ul';
      const start = node.ordered === true && node.start != null && node.start !== 1;
      return `<${tag}${start ? ` start="${node.start}"` : ''}>${serializeChildren(
        node.children,
        context,
      )}</${tag}>`;
    }
    case 'listItem': {
      const [firstChild] = node.children;
      const tight = node.spread !== true && firstChild?.type === 'paragraph';
      const children = tight
        ? serializeChildren(firstChild.children, context) +
          serializeChildren(node.children.slice(1), context)
        : serializeChildren(node.children, context);
      return `<li>${taskMarker(node.checked)}${children}</li>`;
    }
    case 'table':
      return serializeTable(node, context);
    case 'link':
      return anchor(node.url, serializeChildren(node.children, context));
    case 'image':
      return image(node.url, node.alt ?? '');
    case 'linkReference': {
      const children = serializeChildren(node.children, context);
      const definition = resolveReference(node, context);
      return definition ? anchor(definition.url, children) : revertReference(node, children, '');
    }
    case 'imageReference': {
      const alt = node.alt ?? '';
      const definition = resolveReference(node, context);
      return definition ? image(definition.url, alt) : revertReference(node, escapeText(alt), '!');
    }
    case 'thematicBreak':
      return '<hr />';
    case 'break':
      return '<br />';
    case 'inlineMath':
      return escapeText(node.value);
    case 'math':
      return `<p>${escapeText(node.value)}</p>`;
    case 'footnoteReference':
      return `<sup>${context.footnotes.get(node.identifier) ?? ''}</sup>`;
    case 'footnoteDefinition': {
      const number = context.footnotes.get(node.identifier);
      if (number == null) {
        return '';
      }
      return `<div><sup>${number}</sup>${serializeChildren(node.children, context)}</div>`;
    }
    case 'textDirective':
      return escapeText(`:${node.name}`);
    case 'definition':
      return '';
    default:
      return 'children' in node ? serializeChildren(node.children, context) : '';
  }
}

function serializeChildren(nodes: readonly SerializableNode[], context: SerializeContext): string {
  let html = '';
  for (const node of nodes) {
    html += serializeNode(node, context);
  }
  return html;
}

/**
 * Convert message markdown into the semantic, inline-styled HTML that goes on
 * the clipboard as `text/html`. Paste targets that ignore Markdown (Teams,
 * Outlook, Word) strip stylesheets, so every visual cue has to be inline.
 *
 * Parsing mirrors the message renderers: the same LaTeX preprocessing, the same
 * micromark extensions with `singleDollarTextMath` off so currency such as
 * `$5 to $10` stays currency, then the same `remarkApproxTilde` and
 * `remark-supersub` transforms they apply to the parsed tree.
 */
export function markdownToHtml(
  markdown: string,
  mode: RichTextMode = { variant: 'full', latex: false },
): string {
  const extensions: MicromarkExtension[] = [gfm(), math({ singleDollarTextMath: false })];
  if (mode.variant === 'full') {
    extensions.push(directive());
  }

  const source = mode.latex ? preprocessLaTeX(markdown) : markdown;

  const tree = fromMarkdown(source, {
    extensions,
    mdastExtensions: [gfmFromMarkdown(), directiveFromMarkdown(), mathFromMarkdown()],
  });

  remarkApproxTilde()(tree);
  applySuperSub(tree);

  const children = tree.children as SerializableNode[];
  const context: SerializeContext = {
    definitions: new Map(),
    footnotes: new Map(),
    reserved: mode.reserved ?? EMPTY_RESERVED,
  };
  collectContext(children, context);

  let html = '';
  for (const node of children) {
    const serialized = serializeNode(node, context);
    if (serialized.length > 0) {
      html += html.length > 0 ? `\n${serialized}` : serialized;
    }
  }

  return html;
}
