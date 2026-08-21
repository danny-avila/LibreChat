import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { directive } from 'micromark-extension-directive';
import { directiveFromMarkdown } from 'mdast-util-directive';
import type { AlignType, Definition, RootContent, Table } from 'mdast';
import { isSafeUrl } from './markdown';

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
  blockquote: `margin:0 0 16px;padding:0 1em;border-left:4px solid #d0d7de;`,
  table: 'border-collapse:collapse;',
  headerCell: `border:${BORDER};padding:6px 13px;${CODE_COLORS}`,
  cell: `border:${BORDER};padding:6px 13px;`,
} as const;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

type Definitions = Map<string, Definition>;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

const alignStyle = (align: AlignType | undefined): string =>
  align == null ? '' : `text-align:${align};`;

const taskMarker = (checked: boolean | null | undefined): string => {
  if (checked === true) {
    return '☑ ';
  }
  return checked === false ? '☐ ' : '';
};

const anchor = (url: string, children: string): string =>
  isSafeUrl(url) ? `<a href="${escapeHtml(url)}">${children}</a>` : children;

const image = (url: string, alt: string): string =>
  isSafeUrl(url) ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />` : escapeHtml(alt);

/**
 * Reference-style links resolve against definitions that may appear anywhere in
 * the message, including after their use, so they are collected before any node
 * is serialized.
 */
function collectDefinitions(nodes: readonly RootContent[], definitions: Definitions): void {
  for (const node of nodes) {
    if (node.type === 'definition') {
      definitions.set(node.identifier, node);
      continue;
    }
    if ('children' in node) {
      collectDefinitions(node.children, definitions);
    }
  }
}

function serializeTable(node: Table, definitions: Definitions): string {
  const align = node.align ?? [];
  const [headerRow, ...bodyRows] = node.children;

  const cells = (row: (typeof node.children)[number], tag: 'th' | 'td', style: string): string => {
    let html = '';
    for (let index = 0; index < row.children.length; index++) {
      const cell = row.children[index];
      html += `<${tag} style="${style}${alignStyle(align[index])}">${serializeChildren(
        cell.children,
        definitions,
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
function serializeNode(node: RootContent, definitions: Definitions): string {
  switch (node.type) {
    case 'text':
    case 'html':
      return escapeHtml(node.value);
    case 'paragraph':
      return `<p>${serializeChildren(node.children, definitions)}</p>`;
    case 'heading':
      return `<h${node.depth}>${serializeChildren(node.children, definitions)}</h${node.depth}>`;
    case 'strong':
      return `<strong>${serializeChildren(node.children, definitions)}</strong>`;
    case 'emphasis':
      return `<em>${serializeChildren(node.children, definitions)}</em>`;
    case 'delete':
      return `<s>${serializeChildren(node.children, definitions)}</s>`;
    case 'inlineCode':
      return `<code style="${STYLES.inlineCode}">${escapeHtml(node.value)}</code>`;
    case 'code':
      return `<pre style="${STYLES.codeBlock}"><code>${escapeHtml(node.value)}</code></pre>`;
    case 'blockquote':
      return `<blockquote style="${STYLES.blockquote}">${serializeChildren(
        node.children,
        definitions,
      )}</blockquote>`;
    case 'list': {
      const tag = node.ordered === true ? 'ol' : 'ul';
      const start = node.ordered === true && node.start != null && node.start !== 1;
      return `<${tag}${start ? ` start="${node.start}"` : ''}>${serializeChildren(
        node.children,
        definitions,
      )}</${tag}>`;
    }
    case 'listItem': {
      const [firstChild] = node.children;
      const tight = node.spread !== true && firstChild?.type === 'paragraph';
      const children = tight
        ? serializeChildren(firstChild.children, definitions) +
          serializeChildren(node.children.slice(1), definitions)
        : serializeChildren(node.children, definitions);
      return `<li>${taskMarker(node.checked)}${children}</li>`;
    }
    case 'table':
      return serializeTable(node, definitions);
    case 'link':
      return anchor(node.url, serializeChildren(node.children, definitions));
    case 'image':
      return image(node.url, node.alt ?? '');
    case 'linkReference': {
      const children = serializeChildren(node.children, definitions);
      const definition = definitions.get(node.identifier);
      return definition ? anchor(definition.url, children) : children;
    }
    case 'imageReference': {
      const alt = node.alt ?? '';
      const definition = definitions.get(node.identifier);
      return definition ? image(definition.url, alt) : escapeHtml(alt);
    }
    case 'thematicBreak':
      return '<hr />';
    case 'break':
      return '<br />';
    case 'inlineMath':
      return escapeHtml(node.value);
    case 'math':
      return `<p>${escapeHtml(node.value)}</p>`;
    case 'footnoteReference':
      return `<sup>${escapeHtml(node.label ?? node.identifier)}</sup>`;
    case 'footnoteDefinition':
      return `<div><sup>${escapeHtml(node.label ?? node.identifier)}</sup>${serializeChildren(
        node.children,
        definitions,
      )}</div>`;
    case 'definition':
      return '';
    default:
      return 'children' in node ? serializeChildren(node.children, definitions) : '';
  }
}

function serializeChildren(nodes: readonly RootContent[], definitions: Definitions): string {
  let html = '';
  for (const node of nodes) {
    html += serializeNode(node, definitions);
  }
  return html;
}

/**
 * Convert message markdown into the semantic, inline-styled HTML that goes on
 * the clipboard as `text/html`. Paste targets that ignore Markdown (Teams,
 * Outlook, Word) strip stylesheets, so every visual cue has to be inline.
 *
 * The parser options mirror the message renderer's, `singleDollarTextMath`
 * included, so currency such as `$5 to $10` stays currency instead of being
 * read as math.
 */
export function markdownToHtml(markdown: string): string {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm(), directive(), math({ singleDollarTextMath: false })],
    mdastExtensions: [gfmFromMarkdown(), directiveFromMarkdown(), mathFromMarkdown()],
  });

  const definitions: Definitions = new Map();
  collectDefinitions(tree.children, definitions);

  let html = '';
  for (const node of tree.children) {
    const serialized = serializeNode(node, definitions);
    if (serialized.length > 0) {
      html += html.length > 0 ? `\n${serialized}` : serialized;
    }
  }

  return html;
}
