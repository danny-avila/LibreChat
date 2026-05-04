import yauzl from 'yauzl';
import { excelMimeTypes, megabyte } from 'librechat-data-provider';
import { assertSafeZipSize } from './zipSafety';

/**
 * Maximum decompressed size we'll accept from a single PPTX entry. Mirrors the
 * `ODT_MAX_DECOMPRESSED_SIZE` cap in `crud.ts` — both pptx and odt are zip
 * archives whose central directory's `uncompressedSize` cannot be trusted.
 */
const PPTX_MAX_ENTRY_SIZE = 50 * megabyte;

/** Cap on the number of slides we'll render — pathological decks bail early. */
const PPTX_MAX_SLIDES = 500;

/** Per-sheet row cap for spreadsheet rendering. Above this we truncate with a
 *  visible banner so a 100k-row sheet doesn't blow the 512KB cache cap. */
const SPREADSHEET_MAX_ROWS_PER_SHEET = 5_000;

/** Lazy-loaded `sanitize-html` module (commonjs interop). */
let sanitizeHtmlModule: typeof import('sanitize-html') | null = null;
async function getSanitizer(): Promise<typeof import('sanitize-html')> {
  if (sanitizeHtmlModule) {
    return sanitizeHtmlModule;
  }
  const mod = await import('sanitize-html');
  sanitizeHtmlModule = (mod.default ?? mod) as typeof import('sanitize-html');
  return sanitizeHtmlModule;
}

/**
 * Sanitize HTML produced by mammoth / SheetJS / our own pptx renderer for
 * embedding in the Sandpack `static` iframe. Allows the structural and
 * formatting tags those producers emit, plus inline `data:` images (mammoth
 * inlines DOCX images as base64). Strips `<script>`, `<iframe>`, event
 * handlers, `javascript:` URLs, and color-bearing inline styles.
 *
 * The Sandpack iframe is itself a sandbox — this is defense in depth, not
 * the sole barrier.
 */
export async function sanitizeOfficeHtml(html: string): Promise<string> {
  const sanitizeHtml = await getSanitizer();
  return sanitizeHtml(html, {
    allowedTags: [
      'a',
      'b',
      'blockquote',
      'br',
      'caption',
      'code',
      'col',
      'colgroup',
      'div',
      'em',
      'figure',
      'figcaption',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'i',
      'img',
      'li',
      'ol',
      'p',
      'pre',
      'section',
      'small',
      'span',
      'strong',
      'sub',
      'sup',
      'table',
      'tbody',
      'td',
      'tfoot',
      'th',
      'thead',
      'tr',
      'u',
      'ul',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      table: ['border', 'cellpadding', 'cellspacing', 'class'],
      td: ['colspan', 'rowspan', 'class', 'style'],
      th: ['colspan', 'rowspan', 'scope', 'class', 'style'],
      col: ['span', 'width', 'style'],
      colgroup: ['span', 'width', 'style'],
      div: ['class'],
      span: ['class'],
      section: ['class', 'aria-labelledby'],
      h1: ['id', 'class'],
      h2: ['id', 'class'],
      h3: ['id', 'class'],
      h4: ['id', 'class'],
      h5: ['id', 'class'],
      h6: ['id', 'class'],
      p: ['class'],
      ol: ['class'],
      ul: ['class'],
      li: ['class'],
      blockquote: ['class'],
      tbody: ['class'],
      thead: ['class'],
      tr: ['class'],
      tfoot: ['class'],
    },
    /* `data:` is intentionally NOT in the global scheme list — it's only
     * allowed for `<img src>` (mammoth inlines DOCX images as base64
     * `data:image/...` URIs). Without this scoping, an `<a href="data:
     * text/html,<script>…</script>">` smuggled through DOCX/PPTX would
     * survive sanitization and open attacker-controlled HTML in a new
     * tab when clicked — the Sandpack iframe sandbox doesn't gate
     * `target="_blank"` navigations. */
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: 'noopener noreferrer', target: '_blank' },
      }),
    },
    /* sanitize-html runs `allowedAttributes` BEFORE per-attribute filtering, so
     * `style` only survives where we explicitly allow it (td/th/col/colgroup).
     * For those we still want to drop color declarations — defense against the
     * mammoth/SheetJS hardcoded color-on-white issue. */
    allowedStyles: {
      '*': {
        'text-align': [/^left$|^right$|^center$|^justify$/],
        'font-weight': [/^[1-9]00$|^bold$|^normal$/],
        'font-style': [/^italic$|^normal$/],
        width: [/^\d+(?:\.\d+)?(?:px|%|em|rem)?$/],
        height: [/^\d+(?:\.\d+)?(?:px|%|em|rem)?$/],
        'min-width': [/^\d+(?:\.\d+)?(?:px|%|em|rem)?$/],
        'vertical-align': [/^top$|^middle$|^bottom$|^baseline$/],
      },
    },
  });
}

/**
 * Wrap a sanitized HTML body in a complete document with the styles we want
 * inside the Sandpack iframe. The CSS palette uses `prefers-color-scheme` so
 * the iframe inherits dark/light from its parent (Sandpack iframes inherit
 * the prefers-color-scheme media query from the host document).
 */
function wrapAsDocument(bodyHtml: string, extraHeadHtml = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1f2937;
  --muted: #6b7280;
  --border: rgba(128, 128, 128, 0.25);
  --row-alt: rgba(128, 128, 128, 0.04);
  --row-hover: rgba(59, 130, 246, 0.08);
  --header-bg: rgba(243, 244, 246, 0.95);
  --tab-active-bg: rgba(229, 231, 235, 0.95);
  --tab-bg: transparent;
  --link: #2563eb;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a2e;
    --fg: #e5e7eb;
    --muted: #9ca3af;
    --border: rgba(128, 128, 128, 0.35);
    --row-alt: rgba(255, 255, 255, 0.03);
    --row-hover: rgba(59, 130, 246, 0.12);
    --header-bg: rgba(31, 41, 55, 0.95);
    --tab-active-bg: rgba(55, 65, 81, 0.95);
    --link: #60a5fa;
  }
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
body { padding: 16px; }
a { color: var(--link); }
img { max-width: 100%; height: auto; }
h1 { font-size: 1.5rem; font-weight: 700; margin: 0.75em 0 0.5em; }
h2 { font-size: 1.25rem; font-weight: 600; margin: 0.75em 0 0.5em; }
h3 { font-size: 1.1rem;  font-weight: 600; margin: 0.5em 0 0.25em; }
h4, h5, h6 { font-weight: 600; margin: 0.5em 0 0.25em; }
p { margin: 0.4em 0; }
ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
table { border-collapse: collapse; font-size: 0.85rem; line-height: 1.3; margin: 0.5em 0; max-width: 100%; }
th, td {
  border: 1px solid var(--border);
  padding: 0.4em 0.6em;
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
}
thead th, table th[scope="col"] {
  background: var(--header-bg);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}
tbody tr:nth-child(even) { background: var(--row-alt); }
tbody tr:hover { background: var(--row-hover); }
.lc-banner {
  background: var(--row-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: var(--muted);
}
.lc-table-scroll { overflow-x: auto; max-width: 100%; }
${extraHeadHtml}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/* =============================================================================
 * DOCX → HTML
 * ============================================================================= */

/**
 * Style-map directives that broaden mammoth's default heading detection.
 * Mammoth's stock map only promotes paragraphs whose ms-word style name
 * matches `Heading 1`/`Heading 2`/etc. — useless for code-generated
 * docs (e.g. python-docx output) that apply direct character formatting
 * instead of named styles. The `Title`/`Subtitle` mappings catch the
 * built-in title styles used by Word's Insert > Cover Page workflow;
 * explicit `Heading 1` thru `Heading 6` mappings retain mammoth's
 * defaults; and `:fresh` tells mammoth not to merge consecutive
 * matching paragraphs into a single heading element.
 */
const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1.lc-docx-title:fresh",
  "p[style-name='Subtitle'] => h2.lc-docx-subtitle:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
];

/**
 * CSS layered on top of `wrapAsDocument`'s base styles to give mammoth's
 * flat output more visual structure. Mammoth strips the navy banners,
 * cell shading, and column layouts that direct-formatted docs apply, so
 * the source loses most of its presentation. We compensate with three
 * targeted heuristics:
 *
 *   1. The first row of any `<table>` gets sticky-header styling
 *      regardless of `<thead>` (mammoth never emits `<thead>`).
 *   2. Tables get alternating row stripes so dense data blocks stay
 *      scannable even without the source's hand-tuned shading.
 *   3. A bold-only-child paragraph (`<p><strong>X</strong></p>`) is the
 *      python-docx idiom for a "section heading"; styled as a
 *      pseudo-h2 with a thin accent border so the document's structure
 *      survives the round-trip.
 */
const DOCX_EXTRA_CSS = `
.lc-docx h1 { font-size: 1.5rem; font-weight: 700; margin: 1em 0 0.5em; padding-bottom: 0.3em; border-bottom: 2px solid var(--border); }
.lc-docx h2 { font-size: 1.2rem; font-weight: 600; margin: 1em 0 0.4em; padding-left: 0.6em; border-left: 3px solid var(--link); }
.lc-docx h3 { font-size: 1.05rem; font-weight: 600; margin: 0.8em 0 0.3em; color: var(--link); }
.lc-docx-title { text-align: center; border-bottom: none; }
.lc-docx-subtitle { text-align: center; border-left: none; padding-left: 0; color: var(--muted); font-style: italic; font-weight: 400; }
.lc-docx p { margin: 0.5em 0; }
.lc-docx p:has(> strong:only-child) { margin: 1em 0 0.4em; padding-left: 0.6em; border-left: 3px solid var(--link); font-size: 1.05rem; }
.lc-docx p:has(> strong:only-child) strong { font-weight: 600; }
.lc-docx table { width: 100%; max-width: 100%; }
.lc-docx td, .lc-docx th { white-space: normal; }
.lc-docx table tr:first-child td { background: var(--header-bg); font-weight: 600; }
.lc-docx table tr:nth-child(even):not(:first-child) td { background: var(--row-alt); }
.lc-docx ul, .lc-docx ol { margin: 0.5em 0; padding-left: 1.6em; }
.lc-docx li { margin: 0.15em 0; }
.lc-docx blockquote { border-left: 3px solid var(--border); color: var(--muted); margin: 0.8em 0; padding: 0.2em 0 0.2em 0.8em; }
`.trim();

/**
 * Convert a `.docx` buffer to a sandboxed HTML document. Uses mammoth's
 * default conversion (paragraph styles, runs, tables, hyperlinks, lists,
 * inline images as base64 `data:` URIs) augmented by `DOCX_STYLE_MAP`
 * for richer heading detection and `DOCX_EXTRA_CSS` for table-first-row
 * + section-heading heuristics that compensate for mammoth's habit of
 * stripping direct-formatted presentation.
 *
 * Pre-flights the buffer through `assertSafeZipSize` so a zip-bomb DOCX
 * is rejected BEFORE it reaches mammoth — mammoth's internal extraction
 * has no decompressed-size cap and would happily inflate a sub-1MB
 * compressed bomb to 200+ MB of XML, blocking the event loop and
 * spiking RSS. See SEC review on PR #12934.
 */
export async function wordDocToHtml(buffer: Buffer): Promise<string> {
  await assertSafeZipSize(buffer, { name: 'docx' });
  const { convertToHtml } = await import('mammoth');
  const result = await convertToHtml({ buffer }, { styleMap: DOCX_STYLE_MAP });
  const sanitized = await sanitizeOfficeHtml(result.value);
  return wrapAsDocument(`<article class="lc-docx">${sanitized}</article>`, DOCX_EXTRA_CSS);
}

/* =============================================================================
 * XLSX / XLS / ODS → HTML (multi-sheet with pure-CSS tab strip)
 * ============================================================================= */

/** A workbook sheet rendered to its `<table>` HTML and metadata. */
interface RenderedSheet {
  name: string;
  html: string;
  truncated: boolean;
  totalRows: number;
}

async function renderWorkbookSheets(
  workbook: import('xlsx').WorkBook,
  XLSX: typeof import('xlsx'),
): Promise<RenderedSheet[]> {
  const sheets: RenderedSheet[] = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const ref = ws['!ref'];
    let totalRows = 0;
    let truncated = false;
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      totalRows = range.e.r - range.s.r + 1;
      if (totalRows > SPREADSHEET_MAX_ROWS_PER_SHEET) {
        const cappedEnd = range.s.r + SPREADSHEET_MAX_ROWS_PER_SHEET - 1;
        ws['!ref'] = XLSX.utils.encode_range({
          s: range.s,
          e: { r: cappedEnd, c: range.e.c },
        });
        truncated = true;
      }
    }
    const html = XLSX.utils.sheet_to_html(ws, { editable: false, header: '', footer: '' });
    sheets.push({ name: sheetName, html, truncated, totalRows });
  }
  return sheets;
}

/**
 * Build a self-contained HTML document with a pure-CSS tab strip for
 * multi-sheet workbooks. Sheet switching uses radio inputs + `:checked ~`
 * sibling selectors so no JavaScript is needed inside the iframe.
 */
function renderSpreadsheetHtml(sheets: RenderedSheet[]): string {
  if (sheets.length === 0) {
    return wrapAsDocument('<p class="lc-banner">This workbook contains no sheets.</p>');
  }

  const tabStripCss = `
.lc-sheet-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 0 0 8px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.lc-sheet-tab-radio { position: absolute; opacity: 0; pointer-events: none; }
.lc-sheet-tab-label {
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 6px 6px 0 0;
  font-size: 0.8rem;
  color: var(--muted);
  border: 1px solid transparent;
  border-bottom: none;
  user-select: none;
}
.lc-sheet-tab-label:hover { color: var(--fg); background: var(--row-alt); }
.lc-sheet-panel { display: none; }
${sheets
  .map(
    (_, i) =>
      `#lc-sheet-tab-${i}:checked ~ .lc-sheet-tabs label[for="lc-sheet-tab-${i}"] { color: var(--fg); background: var(--tab-active-bg); border-color: var(--border); font-weight: 600; }
#lc-sheet-tab-${i}:checked ~ #lc-sheet-panel-${i} { display: block; }`,
  )
  .join('\n')}
`.trim();

  const radios = sheets
    .map(
      (_, i) =>
        `<input type="radio" name="lc-sheet" id="lc-sheet-tab-${i}" class="lc-sheet-tab-radio"${i === 0 ? ' checked' : ''}>`,
    )
    .join('\n');

  const tabs =
    sheets.length > 1
      ? `<nav class="lc-sheet-tabs">${sheets
          .map(
            (s, i) =>
              `<label class="lc-sheet-tab-label" for="lc-sheet-tab-${i}">${escapeHtml(s.name)}</label>`,
          )
          .join('')}</nav>`
      : '';

  const panels = sheets
    .map((s, i) => {
      const banner = s.truncated
        ? `<div class="lc-banner">Showing first ${SPREADSHEET_MAX_ROWS_PER_SHEET.toLocaleString()} of ${s.totalRows.toLocaleString()} rows. Download the file to see the rest.</div>`
        : '';
      return `<section class="lc-sheet-panel" id="lc-sheet-panel-${i}">${banner}<div class="lc-table-scroll">${s.html}</div></section>`;
    })
    .join('\n');

  return wrapAsDocument(`${radios}\n${tabs}\n${panels}`, tabStripCss);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert a workbook buffer (`.xlsx`, `.xls`, `.ods`) to a sandboxed HTML
 * document. Each sheet is rendered as its own `<table>` and the document
 * carries a pure-CSS tab strip for sheet switching.
 *
 * Pre-flights ZIP-backed formats (`.xlsx`/`.ods`) through
 * `assertSafeZipSize` to reject zip bombs before SheetJS reaches them.
 * `.xls` is a binary CFB format, not a ZIP — it doesn't have the
 * decompression-amplification attack surface, so the safety check is
 * skipped for it (yauzl would reject it as malformed anyway).
 */
export async function excelSheetToHtml(buffer: Buffer): Promise<string> {
  /* Cheap magic-byte check so we only run the ZIP validator on actual
   * ZIP-backed inputs. `.xls` (BIFF/CFB) starts with `D0 CF 11 E0`; ZIPs
   * start with `PK\x03\x04`. Skipping the validator on a non-ZIP input
   * also avoids confusing yauzl errors leaking out as ZipBombError. */
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    await assertSafeZipSize(buffer, { name: 'spreadsheet' });
  }
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = await renderWorkbookSheets(workbook, XLSX);
  /* The per-sheet HTML from `sheet_to_html` is generally well-formed but we
   * still sanitize it (defense in depth). The chrome (tab strip, banners) is
   * our own code and doesn't need sanitization. */
  const sanitizedSheets = await Promise.all(
    sheets.map(async (s) => ({ ...s, html: await sanitizeOfficeHtml(s.html) })),
  );
  return renderSpreadsheetHtml(sanitizedSheets);
}

/* =============================================================================
 * CSV → HTML
 * ============================================================================= */

/** Convert a CSV buffer to a sandboxed HTML document with a single table. */
export async function csvToHtml(buffer: Buffer): Promise<string> {
  const XLSX = await import('xlsx');
  const text = buffer.toString('utf-8');
  /* `XLSX.read` with `type: 'string'` accepts CSV as well as XML/JSON
   * formats; the default sheet name for CSV is `Sheet1` which we relabel
   * below for a friendlier tab. */
  const workbook = XLSX.read(text, { type: 'string', raw: true });
  const sheets = await renderWorkbookSheets(workbook, XLSX);
  // Single sheet for CSV — relabel to "CSV" for clarity, no tab strip emitted.
  const sanitized = await Promise.all(
    sheets.map(async (s) => ({ ...s, name: 'CSV', html: await sanitizeOfficeHtml(s.html) })),
  );
  return renderSpreadsheetHtml(sanitized);
}

/* =============================================================================
 * PPTX → slide-list HTML
 * ============================================================================= */

interface PptxSlide {
  number: number;
  title: string;
  body: string[];
}

/**
 * Stream `ppt/slides/slide*.xml` out of a PPTX buffer using yauzl. Mirrors
 * the anti-zip-bomb pattern used by `extractOdtContentXml` in `crud.ts` —
 * counts real decompressed bytes mid-inflate so a falsified central-directory
 * `uncompressedSize` cannot bypass the cap. Returns slides in slide-number
 * order; ignores everything else in the archive.
 *
 * Uses `yauzl.fromBuffer` (no disk I/O) — the safety pre-flight in
 * `assertSafeZipSize` already proved the buffer is well-formed enough
 * to walk, and fromBuffer keeps the hot path memory-only.
 */
function extractPptxSlideXml(buffer: Buffer): Promise<Array<{ number: number; xml: string }>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        return reject(err);
      }
      if (!zipfile) {
        return reject(new Error('Failed to open PPTX buffer'));
      }

      let settled = false;
      const slides: Array<{ number: number; xml: string }> = [];
      const finish = (error: Error | null) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          zipfile.close();
        } catch {
          /* zipfile.close() is best-effort — yauzl will throw if a
           * stream is mid-flight. We've already settled the outer
           * promise, so swallow this so the original error (if any)
           * isn't replaced by a close-time exception. Mirrors
           * `assertSafeZipSize`'s defensive pattern in zipSafety.ts. */
        }
        if (error) {
          reject(error);
        } else {
          slides.sort((a, b) => a.number - b.number);
          resolve(slides);
        }
      };

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        const slideMatch = entry.fileName.match(/^ppt\/slides\/slide(\d+)\.xml$/);
        if (!slideMatch) {
          zipfile.readEntry();
          return;
        }
        if (slides.length >= PPTX_MAX_SLIDES) {
          // Cap reached — drain remaining entries silently.
          zipfile.readEntry();
          return;
        }
        const slideNumber = Number.parseInt(slideMatch[1], 10);
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            return finish(streamErr ?? new Error('Failed to open slide stream'));
          }

          let totalBytes = 0;
          const chunks: Buffer[] = [];

          readStream.on('data', (chunk: Buffer) => {
            totalBytes += chunk.byteLength;
            if (totalBytes > PPTX_MAX_ENTRY_SIZE) {
              readStream.destroy(
                new Error(
                  `PPTX slide${slideNumber}.xml exceeds the ${PPTX_MAX_ENTRY_SIZE / megabyte}MB decompressed limit`,
                ),
              );
              return;
            }
            chunks.push(chunk);
          });

          readStream.on('end', () => {
            slides.push({ number: slideNumber, xml: Buffer.concat(chunks).toString('utf-8') });
            zipfile.readEntry();
          });
          readStream.on('error', (readErr: Error) => finish(readErr));
        });
      });

      zipfile.on('end', () => finish(null));
      zipfile.on('error', (zipErr: Error) => finish(zipErr));
    });
  });
}

/**
 * Pull the visible text out of a slide XML. PPTX text lives in `<a:t>`
 * elements, grouped by `<a:p>` (paragraph). We keep paragraph boundaries so
 * the rendered slide preserves bullet/line structure.
 *
 * Pure regex (no DOMParser available in Node by default; the markup is
 * tightly defined by the OOXML spec, so regex is robust enough for the text-
 * only preview).
 */
function extractSlideText(xml: string): { title: string; body: string[] } {
  const paragraphs: string[] = [];
  const paragraphMatches = xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g);
  for (const match of paragraphMatches) {
    const innerXml = match[1];
    const runs: string[] = [];
    const runMatches = innerXml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g);
    for (const run of runMatches) {
      runs.push(decodeXmlEntities(run[1]));
    }
    const text = runs.join('').trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  }
  const title = paragraphs[0] ?? '';
  const body = paragraphs.slice(1);
  return { title, body };
}

const XML_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
};
function decodeXmlEntities(input: string): string {
  return input.replace(/&(?:lt|gt|amp|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

function renderPptxSlidesHtml(slides: PptxSlide[]): string {
  if (slides.length === 0) {
    return wrapAsDocument(
      '<p class="lc-banner">This presentation contains no readable slides.</p>',
    );
  }

  const slideCss = `
.lc-pptx-list { display: flex; flex-direction: column; gap: 16px; padding: 0; margin: 0; list-style: none; }
.lc-pptx-slide {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  background: var(--bg);
  position: relative;
}
.lc-pptx-slide-number {
  display: inline-block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 6px;
}
.lc-pptx-slide-title { font-size: 1.15rem; font-weight: 600; margin: 0 0 8px; }
.lc-pptx-slide-body { margin: 0; padding-left: 1.25em; }
.lc-pptx-slide-body li { margin: 0.2em 0; }
.lc-pptx-slide-empty { color: var(--muted); font-style: italic; margin: 0; }
`.trim();

  const items = slides
    .map((slide) => {
      const titleHtml = slide.title
        ? `<h2 class="lc-pptx-slide-title">${escapeHtml(slide.title)}</h2>`
        : '';
      const bodyHtml =
        slide.body.length > 0
          ? `<ul class="lc-pptx-slide-body">${slide.body.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
          : !slide.title
            ? '<p class="lc-pptx-slide-empty">(empty slide)</p>'
            : '';
      return `<li class="lc-pptx-slide">
  <span class="lc-pptx-slide-number">Slide ${slide.number}</span>
  ${titleHtml}
  ${bodyHtml}
</li>`;
    })
    .join('\n');

  return wrapAsDocument(`<ol class="lc-pptx-list">${items}</ol>`, slideCss);
}

/**
 * Convert a `.pptx` buffer to a sandboxed HTML document rendering each slide
 * as a card (slide number, title, body bullets). Honest about being a
 * text-only preview — complex visual layouts, charts, and embedded media are
 * not represented. Higher-fidelity rendering is a deferred follow-up.
 *
 * Pre-flights through `assertSafeZipSize` so a zip-bomb PPTX can't blow
 * up the slide-XML extraction pass.
 */
export async function pptxToSlideListHtml(buffer: Buffer): Promise<string> {
  await assertSafeZipSize(buffer, { name: 'pptx' });
  const rawSlides = await extractPptxSlideXml(buffer);
  const slides: PptxSlide[] = rawSlides.map(({ number, xml }) => {
    const { title, body } = extractSlideText(xml);
    return { number, title, body };
  });
  return renderPptxSlidesHtml(slides);
}

/* =============================================================================
 * Dispatcher
 * ============================================================================= */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';
const CSV_MIME_PATTERN = /^(text\/csv|application\/csv|text\/comma-separated-values)$/i;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) {
    return '';
  }
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Strip MIME parameters (`; charset=utf-8`, `; boundary=...`) and
 * lowercase the result so exact-match MIME comparisons survive servers
 * and tool sandboxes that decorate Content-Type headers. Without this,
 * an extensionless `text/csv; charset=utf-8` would slip past the bucket
 * predicate (returning null) while the client's MIME router — which
 * already strips parameters via `baseMime` — would route it to
 * SPREADSHEET expecting an HTML body that the backend never produced.
 * Mirrors `client/src/utils/artifacts.ts:baseMime`.
 */
function baseMime(mime: string): string {
  if (!mime) {
    return '';
  }
  const semi = mime.indexOf(';');
  return (semi < 0 ? mime : mime.slice(0, semi)).trim().toLowerCase();
}

/**
 * The four buckets the dispatcher can route to. Used by both
 * `bufferToOfficeHtml` (which actually renders) and `officeHtmlBucket`
 * (which the upstream gate in `extract.ts` calls to decide whether to
 * invoke the dispatcher at all). Sharing one source of truth prevents the
 * gate from going out of sync with the dispatcher — a previous version
 * had a narrower extension-only gate that missed extensionless office
 * files identified solely by MIME (e.g. a tool emitting `data` with
 * `text/csv`), which then routed to the SPREADSHEET bucket on the
 * client expecting full HTML and got raw text instead.
 */
export type OfficeHtmlBucket = 'docx' | 'spreadsheet' | 'csv' | 'pptx';

const OFFICE_EXTENSIONS: Record<string, OfficeHtmlBucket> = {
  docx: 'docx',
  csv: 'csv',
  xlsx: 'spreadsheet',
  xls: 'spreadsheet',
  ods: 'spreadsheet',
  pptx: 'pptx',
};

/**
 * Classify a file by extension OR MIME into the bucket the office HTML
 * dispatcher would route it to, or `null` if no producer applies.
 *
 * **Extension always wins** over MIME for any known office extension.
 * Without this precedence, a `deck.pptx` whose `Content-Type` was
 * mislabeled `text/csv` (a known footgun when tool sandboxes ship
 * generic MIMEs) would be routed to `csvToHtml` and try to parse a
 * binary PPTX as CSV — yielding garbage at best, a parse exception at
 * worst. MIME-only routing is the fallback for extensionless filenames
 * (or extensions outside our known set) where the upstream supplied a
 * useful Content-Type header.
 */
export function officeHtmlBucket(name: string, mimeType: string): OfficeHtmlBucket | null {
  const ext = extensionOf(name);
  const byExtension = OFFICE_EXTENSIONS[ext];
  if (byExtension) {
    return byExtension;
  }
  /* MIME-only fallback. Strip parameters first — Content-Type headers
   * routinely carry `; charset=utf-8` or `; boundary=...` decorations
   * that would otherwise fail exact-match comparisons. Order within the
   * fallback doesn't matter: there are no overlapping MIME patterns
   * across buckets, and the extension table already took precedence
   * above for any conflicting input. */
  const normalized = baseMime(mimeType);
  if (normalized === DOCX_MIME) {
    return 'docx';
  }
  if (CSV_MIME_PATTERN.test(normalized)) {
    return 'csv';
  }
  if (excelMimeTypes.test(normalized) || normalized === ODS_MIME) {
    return 'spreadsheet';
  }
  if (normalized === PPTX_MIME) {
    return 'pptx';
  }
  return null;
}

/**
 * Route an office-format buffer to the matching HTML producer. Returns `null`
 * if the file isn't a recognized office type — caller should fall through to
 * its existing text/binary handling.
 */
export async function bufferToOfficeHtml(
  buffer: Buffer,
  name: string,
  mimeType: string,
): Promise<string | null> {
  const bucket = officeHtmlBucket(name, mimeType);
  switch (bucket) {
    case 'docx':
      return wordDocToHtml(buffer);
    case 'csv':
      return csvToHtml(buffer);
    case 'spreadsheet':
      return excelSheetToHtml(buffer);
    case 'pptx':
      return pptxToSlideListHtml(buffer);
    default:
      return null;
  }
}
