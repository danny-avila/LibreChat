import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { directive } from 'micromark-extension-directive';
import { directiveFromMarkdown } from 'mdast-util-directive';
import type { AlignType, RootContent, Table } from 'mdast';
import { isSafeUrl } from './markdown';

const MONOSPACE = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

const STYLES = {
  inlineCode: `font-family:${MONOSPACE};background-color:#f6f8fa;border-radius:4px;padding:0.15em 0.35em;`,
  codeBlock: `font-family:${MONOSPACE};background-color:#f6f8fa;border-radius:6px;padding:12px;white-space:pre-wrap;`,
  blockquote: 'margin:0 0 16px;padding:0 1em;border-left:4px solid #d0d7de;color:#57606a;',
  table: 'border-collapse:collapse;',
  headerCell: 'border:1px solid #d0d7de;padding:6px 13px;background-color:#f6f8fa;',
  cell: 'border:1px solid #d0d7de;padding:6px 13px;',
} as const;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

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

function serializeTable(node: Table): string {
  const align = node.align ?? [];
  const [headerRow, ...bodyRows] = node.children;

  const cells = (row: (typeof node.children)[number], tag: 'th' | 'td', style: string): string => {
    let html = '';
    for (let index = 0; index < row.children.length; index++) {
      const cell = row.children[index];
      html += `<${tag} style="${style}${alignStyle(align[index])}">${serializeChildren(
        cell.children,
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
function serializeNode(node: RootContent): string {
  switch (node.type) {
    case 'text':
    case 'html':
      return escapeHtml(node.value);
    case 'paragraph':
      return `<p>${serializeChildren(node.children)}</p>`;
    case 'heading':
      return `<h${node.depth}>${serializeChildren(node.children)}</h${node.depth}>`;
    case 'strong':
      return `<strong>${serializeChildren(node.children)}</strong>`;
    case 'emphasis':
      return `<em>${serializeChildren(node.children)}</em>`;
    case 'delete':
      return `<s>${serializeChildren(node.children)}</s>`;
    case 'inlineCode':
      return `<code style="${STYLES.inlineCode}">${escapeHtml(node.value)}</code>`;
    case 'code':
      return `<pre style="${STYLES.codeBlock}"><code>${escapeHtml(node.value)}</code></pre>`;
    case 'blockquote':
      return `<blockquote style="${STYLES.blockquote}">${serializeChildren(
        node.children,
      )}</blockquote>`;
    case 'list': {
      const tag = node.ordered === true ? 'ol' : 'ul';
      const start = node.ordered === true && node.start != null && node.start !== 1;
      return `<${tag}${start ? ` start="${node.start}"` : ''}>${serializeChildren(
        node.children,
      )}</${tag}>`;
    }
    case 'listItem': {
      const [firstChild] = node.children;
      const tight = node.spread !== true && firstChild?.type === 'paragraph';
      const children = tight
        ? serializeChildren(firstChild.children) + serializeChildren(node.children.slice(1))
        : serializeChildren(node.children);
      return `<li>${taskMarker(node.checked)}${children}</li>`;
    }
    case 'table':
      return serializeTable(node);
    case 'link':
      return isSafeUrl(node.url)
        ? `<a href="${escapeHtml(node.url)}">${serializeChildren(node.children)}</a>`
        : serializeChildren(node.children);
    case 'image':
      return isSafeUrl(node.url)
        ? `<img src="${escapeHtml(node.url)}" alt="${escapeHtml(node.alt ?? '')}" />`
        : escapeHtml(node.alt ?? '');
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
      )}</div>`;
    case 'definition':
      return '';
    default:
      return 'children' in node ? serializeChildren(node.children) : '';
  }
}

function serializeChildren(nodes: readonly RootContent[]): string {
  let html = '';
  for (const node of nodes) {
    html += serializeNode(node);
  }
  return html;
}

/**
 * Convert message markdown into the semantic, inline-styled HTML that goes on
 * the clipboard as `text/html`. Paste targets that ignore Markdown (Teams,
 * Outlook, Word) strip stylesheets, so every visual cue has to be inline.
 */
export function markdownToHtml(markdown: string): string {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm(), directive(), math()],
    mdastExtensions: [gfmFromMarkdown(), directiveFromMarkdown(), mathFromMarkdown()],
  });

  let html = '';
  for (const node of tree.children) {
    const serialized = serializeNode(node);
    if (serialized.length > 0) {
      html += html.length > 0 ? `\n${serialized}` : serialized;
    }
  }

  return html;
}
