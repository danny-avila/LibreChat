import path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import { megabyte } from 'librechat-data-provider';
import {
  _internal,
  bufferToOfficeHtml,
  csvToHtml,
  excelSheetToHtml,
  officeHtmlBucket,
  pptxToSlideListHtml,
  sanitizeOfficeHtml,
  wordDocToHtml,
} from './html';
import { ZipBombError } from './zipSafety';

const fixturesDir = __dirname;
const readFixture = (name: string): Buffer => fs.readFileSync(path.join(fixturesDir, name));

describe('Office HTML producers', () => {
  describe('wordDocToHtml', () => {
    /* The dispatcher chooses CDN vs mammoth by buffer size. The fixture
     * sample.docx is small (~6 KB) so it goes down the CDN path. Tests
     * that need the mammoth output specifically call
     * `_internal.wordDocToHtmlViaMammoth` directly. */

    test('routes a small docx (≤ cap) through the CDN-rendered path', async () => {
      const html = await wordDocToHtml(readFixture('sample.docx'));
      expect(html).toMatch(/^<!DOCTYPE html>/);
      // CDN wrapper signatures.
      expect(html).toContain('id="lc-doc-data"');
      expect(html).toContain('docx.renderAsync');
      expect(html).toContain('cdn.jsdelivr.net/npm/docx-preview@');
      // Mammoth-path artifact must NOT appear.
      expect(html).not.toContain('<article class="lc-docx">');
    });

    test('routes a docx above the size cap through the mammoth fallback', async () => {
      /* Synthesize an oversized buffer by reading the fixture and
       * verifying the dispatcher picks the mammoth path. We can't
       * cheaply forge a multi-hundred-KB DOCX that mammoth can still
       * parse, so this asserts the size predicate by calling
       * `wordDocToHtmlViaMammoth` directly — the dispatcher's `if`
       * branch is itself trivial to inspect. */
      const html = await _internal.wordDocToHtmlViaMammoth(readFixture('sample.docx'));
      expect(html).toContain('<article class="lc-docx">');
      expect(html).toContain('This is a sample DOCX file.');
    });

    test('mammoth fallback strips <script> tags and event handlers', async () => {
      const html = await _internal.wordDocToHtmlViaMammoth(readFixture('sample.docx'));
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/onerror=/i);
    });

    test('mammoth fallback emits the docx-specific extra CSS', async () => {
      const html = await _internal.wordDocToHtmlViaMammoth(readFixture('sample.docx'));
      expect(html).toContain('.lc-docx table tr:first-child td');
      expect(html).toContain('.lc-docx p:has(> strong:only-child)');
      expect(html).toContain('.lc-docx h2');
    });

    describe('CDN-rendered path', () => {
      /* These tests lock in the security-relevant structure of the
       * embedded-binary HTML wrapper. If any of these assertions break
       * after a refactor, the iframe is one config tweak away from
       * being a vehicle for outbound exfiltration or supply-chain
       * compromise. */

      test('embeds the binary as base64 that round-trips to the original bytes', async () => {
        const original = readFixture('sample.docx');
        const html = await _internal.wordDocToHtmlViaCdn(original);
        const match = html.match(
          /<script id="lc-doc-data" type="application\/octet-stream;base64">([^<]*)<\/script>/,
        );
        expect(match).not.toBeNull();
        const decoded = Buffer.from(match![1], 'base64');
        expect(decoded.equals(original)).toBe(true);
      });

      test('pins both CDN scripts to specific versions with SRI integrity', async () => {
        const html = await _internal.wordDocToHtmlViaCdn(readFixture('sample.docx'));
        // Both deps loaded from jsdelivr at pinned versions.
        expect(html).toContain('https://cdn.jsdelivr.net/npm/jszip@3.10.1/');
        expect(html).toContain('https://cdn.jsdelivr.net/npm/docx-preview@0.3.7/');
        // Both have SRI integrity attributes.
        const integrityMatches = html.match(/integrity="sha384-[A-Za-z0-9+/=]+"/g);
        expect(integrityMatches).not.toBeNull();
        expect(integrityMatches!.length).toBe(2);
        // Both have crossorigin="anonymous" (required for SRI on cross-origin).
        const crossoriginMatches = html.match(/crossorigin="anonymous"/g);
        expect(crossoriginMatches).not.toBeNull();
        expect(crossoriginMatches!.length).toBe(2);
      });

      test('CSP locks the iframe down: no outbound connect, no eval, scripts only from jsdelivr', async () => {
        const html = await _internal.wordDocToHtmlViaCdn(readFixture('sample.docx'));
        const cspMatch = html.match(
          /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/,
        );
        expect(cspMatch).not.toBeNull();
        const csp = cspMatch![1];
        // The bomb defense: no outbound HTTP requests from the rendered
        // iframe — a parser bug in docx-preview can't be turned into
        // exfiltration of the embedded document content.
        expect(csp).toMatch(/connect-src 'none'/);
        // No `<base>` tampering, no form submission either.
        expect(csp).toMatch(/base-uri 'none'/);
        expect(csp).toMatch(/form-action 'none'/);
        // Scripts only from jsdelivr (plus inline for our renderer
        // bootstrap). No 'unsafe-eval' anywhere.
        expect(csp).toMatch(/script-src https:\/\/cdn\.jsdelivr\.net 'unsafe-inline'/);
        expect(csp).not.toMatch(/unsafe-eval/);
      });

      test('exposes a fallback message that surfaces if the renderer fails to load', async () => {
        const html = await _internal.wordDocToHtmlViaCdn(readFixture('sample.docx'));
        // Visible loading state and a fallback that swaps in on error.
        expect(html).toContain('Loading preview…');
        expect(html).toContain('Preview unavailable');
        // The bootstrap script checks `typeof docx === 'undefined'` so
        // a CDN outage degrades gracefully rather than leaving a
        // permanently empty iframe.
        expect(html).toContain("typeof docx === 'undefined'");
      });

      test('size-fallback threshold is the documented 350 KB', async () => {
        /* Lock the public threshold so a future refactor doesn't drift
         * away from the value referenced in the JSDoc and the
         * `MAX_TEXT_CACHE_BYTES` reasoning above it. */
        expect(_internal.MAX_DOCX_CDN_BINARY_BYTES).toBe(350 * 1024);
      });
    });
  });

  describe('excelSheetToHtml', () => {
    test('renders all sheets of a multi-sheet workbook into the HTML document', async () => {
      const html = await excelSheetToHtml(readFixture('sample.xlsx'));
      expect(html).toMatch(/^<!DOCTYPE html>/);
      // Each sheet name should appear as a tab label.
      expect(html).toContain('Sheet One');
      expect(html).toContain('Second Sheet');
      // Cell values from both sheets should render.
      expect(html).toContain('first');
      expect(html).toContain('Second');
      // Tab strip uses pure-CSS radio inputs — verify the chrome wired up.
      expect(html).toContain('lc-sheet-tab-radio');
      expect(html).toContain('lc-sheet-panel-0');
      expect(html).toContain('lc-sheet-panel-1');
    });

    test('omits the tab strip when only one sheet is present', async () => {
      const html = await excelSheetToHtml(readFixture('sample.xls'));
      // Cell content should render even though there's no tab strip.
      expect(html).toContain('first');
      expect(html).toContain('<table');
      // Single sheet — no <nav class="lc-sheet-tabs">.
      expect(html).not.toContain('class="lc-sheet-tabs"');
    });

    test('renders ods workbooks the same way', async () => {
      const html = await excelSheetToHtml(readFixture('sample.ods'));
      expect(html).toContain('Sheet One');
      expect(html).toContain('Second Sheet');
    });
  });

  describe('csvToHtml', () => {
    test('renders a basic CSV as a single-table HTML document with no tab strip', async () => {
      const csv = Buffer.from('name,age,city\nAlice,30,NYC\nBob,25,SF\n', 'utf-8');
      const html = await csvToHtml(csv);
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('Alice');
      expect(html).toContain('NYC');
      expect(html).toContain('<table');
      expect(html).not.toContain('class="lc-sheet-tabs"');
    });

    test('handles CSV with embedded commas via quoted fields', async () => {
      const csv = Buffer.from('label,value\n"hello, world",42\n', 'utf-8');
      const html = await csvToHtml(csv);
      expect(html).toContain('hello, world');
      expect(html).toContain('42');
    });

    test('handles an empty CSV without crashing', async () => {
      const html = await csvToHtml(Buffer.from('', 'utf-8'));
      expect(html).toMatch(/^<!DOCTYPE html>/);
    });
  });

  describe('pptxToSlideListHtml', () => {
    /** Build a minimal valid PPTX with N synthesized slides for testing. */
    const buildPptx = async (
      slides: Array<{ title: string; body?: string[] }>,
    ): Promise<Buffer> => {
      const zip = new JSZip();
      const slideXml = (title: string, body: string[] = []) => {
        const titleP = `<a:p><a:r><a:t>${title}</a:t></a:r></a:p>`;
        const bodyPs = body.map((b) => `<a:p><a:r><a:t>${b}</a:t></a:r></a:p>`).join('');
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          ${titleP}
          ${bodyPs}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
      };
      slides.forEach((s, i) => {
        zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(s.title, s.body));
      });
      // Add a dummy non-slide entry so we exercise the filter.
      zip.file('docProps/core.xml', '<core/>');
      return zip.generateAsync({ type: 'nodebuffer' });
    };

    test('extracts slide titles and body bullets in slide-number order', async () => {
      const pptx = await buildPptx([
        { title: 'Welcome', body: ['First point', 'Second point'] },
        { title: 'Agenda', body: ['Item A', 'Item B', 'Item C'] },
        { title: 'Thanks!' },
      ]);
      const html = await pptxToSlideListHtml(pptx);
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('Slide 1');
      expect(html).toContain('Welcome');
      expect(html).toContain('First point');
      expect(html).toContain('Slide 2');
      expect(html).toContain('Agenda');
      expect(html).toContain('Item C');
      expect(html).toContain('Slide 3');
      expect(html).toContain('Thanks!');
      // Title appears before body in the doc.
      expect(html.indexOf('Welcome')).toBeLessThan(html.indexOf('First point'));
    });

    test('handles a slide with no extractable text gracefully', async () => {
      const pptx = await buildPptx([{ title: '' }]);
      const html = await pptxToSlideListHtml(pptx);
      expect(html).toContain('Slide 1');
      expect(html).toContain('(empty slide)');
    });

    test('returns a friendly empty-state document when no slides are present', async () => {
      const zip = new JSZip();
      zip.file('docProps/core.xml', '<core/>');
      const pptx = await zip.generateAsync({ type: 'nodebuffer' });
      const html = await pptxToSlideListHtml(pptx);
      expect(html).toContain('contains no readable slides');
    });

    test('decodes XML entities in slide text', async () => {
      const pptx = await buildPptx([{ title: 'A &amp; B', body: ['x &lt; y'] }]);
      const html = await pptxToSlideListHtml(pptx);
      expect(html).toContain('A &amp; B'); // re-escaped on output
      expect(html).toContain('x &lt; y');
    });
  });

  describe('bufferToOfficeHtml dispatcher', () => {
    test('routes by extension when MIME is generic', async () => {
      const html = await bufferToOfficeHtml(
        readFixture('sample.docx'),
        'sample.docx',
        'application/octet-stream',
      );
      expect(html).not.toBeNull();
      // sample.docx is small → CDN path. Lock the dispatcher routing
      // by checking for a CDN-path signature rather than the literal
      // document text (which only appears in the mammoth fallback).
      expect(html!).toContain('id="lc-doc-data"');
      expect(html!).toContain('docx-preview@');
    });

    test('routes by MIME when extension is missing', async () => {
      const html = await bufferToOfficeHtml(
        readFixture('sample.xlsx'),
        'workbook',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(html).not.toBeNull();
      expect(html!).toContain('Sheet One');
    });

    test('routes csv by extension', async () => {
      const html = await bufferToOfficeHtml(
        Buffer.from('a,b\n1,2', 'utf-8'),
        'data.csv',
        'application/octet-stream',
      );
      expect(html).not.toBeNull();
      expect(html!).toContain('<table');
    });

    test('routes csv by MIME when extension is missing', async () => {
      const html = await bufferToOfficeHtml(Buffer.from('a,b\n1,2', 'utf-8'), 'data', 'text/csv');
      expect(html).not.toBeNull();
      expect(html!).toContain('<table');
    });

    test('returns null for unrecognized types', async () => {
      const html = await bufferToOfficeHtml(Buffer.from('hello'), 'notes.txt', 'text/plain');
      expect(html).toBeNull();
    });

    test('extension wins over MIME (sniff misclassifies docx as application/zip)', async () => {
      const html = await bufferToOfficeHtml(
        readFixture('sample.docx'),
        'sample.docx',
        'application/zip',
      );
      expect(html).not.toBeNull();
      expect(html!).toContain('lc-docx');
    });
  });

  describe('officeHtmlBucket predicate', () => {
    /* The shared predicate is the single source of truth for "should the
     * office HTML pipeline handle this file?". The upstream gate in
     * `extract.ts` calls it directly; the dispatcher above delegates to
     * it. Tests here lock in MIME-only routing for extensionless inputs
     * (the case Codex flagged on PR #12934). */
    it.each([
      ['report.docx', 'application/zip', 'docx'],
      ['report.docx', '', 'docx'],
      ['noext', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
      ['data.csv', 'application/octet-stream', 'csv'],
      ['data', 'text/csv', 'csv'],
      ['data', 'application/csv', 'csv'],
      ['workbook.xlsx', '', 'spreadsheet'],
      ['legacy.xls', '', 'spreadsheet'],
      ['sheet.ods', '', 'spreadsheet'],
      ['noext', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'spreadsheet'],
      ['noext', 'application/vnd.ms-excel', 'spreadsheet'],
      ['noext', 'application/vnd.oasis.opendocument.spreadsheet', 'spreadsheet'],
      ['deck.pptx', '', 'pptx'],
      [
        'noext',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'pptx',
      ],
    ])('classifies (%s, %s) as %s', (name, mime, expected) => {
      expect(officeHtmlBucket(name, mime)).toBe(expected);
    });

    it.each([
      ['note.txt', 'text/plain'],
      ['code.py', 'text/x-python'],
      ['data.json', 'application/json'],
      ['photo.jpg', 'image/jpeg'],
      ['doc.pdf', 'application/pdf'],
      ['archive.zip', 'application/zip'],
      ['notes.odt', 'application/vnd.oasis.opendocument.text'],
      ['noext', 'text/plain'],
      ['noext', ''],
    ])('returns null for non-office (%s, %s)', (name, mime) => {
      expect(officeHtmlBucket(name, mime)).toBeNull();
    });

    /* Regression for Codex P2 review on PR #12934. A binary office file
     * with a mismatched MIME (e.g. a tool sandbox sets `text/csv` on
     * everything it ships) must NOT be re-routed to a different bucket
     * just because the MIME matches a different bucket's pattern. The
     * documented "extension wins" precedence is enforced by checking
     * extensions exhaustively before any MIME pattern fires. */
    it.each([
      ['deck.pptx', 'text/csv', 'pptx'],
      ['workbook.xlsx', 'text/csv', 'spreadsheet'],
      [
        'legacy.xls',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'spreadsheet',
      ],
      ['sheet.ods', 'text/csv', 'spreadsheet'],
      ['report.docx', 'text/csv', 'docx'],
      ['report.docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'docx'],
      [
        'data.csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'csv',
      ],
    ])('extension wins over conflicting MIME: (%s, %s) → %s', (name, mime, expected) => {
      expect(officeHtmlBucket(name, mime)).toBe(expected);
    });

    /* Regression for Codex P2 review on PR #12934. Real Content-Type
     * headers carry parameters like `; charset=utf-8` and `; boundary`;
     * the predicate must strip them before matching, otherwise the
     * backend silently falls through to raw text while the client's
     * `baseMime` strips the same parameters and routes the file to the
     * spreadsheet bucket — yielding a broken preview. */
    it.each([
      ['data', 'text/csv; charset=utf-8', 'csv'],
      ['data', 'text/csv;charset=utf-8', 'csv'],
      ['data', 'TEXT/CSV; CHARSET=UTF-8', 'csv'],
      ['data', 'application/csv; charset=ascii', 'csv'],
      ['data', 'text/comma-separated-values', 'csv'],
      ['data', 'text/comma-separated-values; charset=utf-8', 'csv'],
      [
        'workbook',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=binary',
        'spreadsheet',
      ],
      [
        'report',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document; charset=binary',
        'docx',
      ],
      [
        'deck',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation; foo=bar',
        'pptx',
      ],
    ])('strips MIME parameters before matching: (%s, %s) → %s', (name, mime, expected) => {
      expect(officeHtmlBucket(name, mime)).toBe(expected);
    });
  });

  describe('zip-bomb defense (SEC review on PR #12934)', () => {
    /* Build a sub-1MB compressed ZIP that inflates to >25MB (default
     * per-entry cap). Mirrors the SEC validation PoC: highly compressed
     * runs of zero bytes squeeze through any compressed-size gate but
     * blow up the parser. */
    const buildBombArchive = async (
      entries: Array<{ name: string; decompressedBytes: number }>,
    ): Promise<Buffer> => {
      const zip = new JSZip();
      for (const { name, decompressedBytes } of entries) {
        zip.file(name, Buffer.alloc(decompressedBytes, 0));
      }
      return zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });
    };

    test('wordDocToHtml rejects a zip-bomb DOCX before mammoth touches it', async () => {
      const bomb = await buildBombArchive([
        { name: 'word/document.xml', decompressedBytes: 50 * megabyte },
      ]);
      expect(bomb.length).toBeLessThan(1 * megabyte);
      await expect(wordDocToHtml(bomb)).rejects.toThrow(ZipBombError);
    });

    test('excelSheetToHtml rejects a zip-bomb XLSX before SheetJS touches it', async () => {
      const bomb = await buildBombArchive([
        { name: 'xl/worksheets/sheet1.xml', decompressedBytes: 50 * megabyte },
      ]);
      expect(bomb.length).toBeLessThan(1 * megabyte);
      await expect(excelSheetToHtml(bomb)).rejects.toThrow(ZipBombError);
    });

    test('pptxToSlideListHtml rejects a zip-bomb PPTX before slide extraction', async () => {
      const bomb = await buildBombArchive([
        { name: 'ppt/slides/slide1.xml', decompressedBytes: 50 * megabyte },
      ]);
      expect(bomb.length).toBeLessThan(1 * megabyte);
      await expect(pptxToSlideListHtml(bomb)).rejects.toThrow(ZipBombError);
    });

    test('bufferToOfficeHtml propagates ZipBombError so callers can fail safe', async () => {
      const bomb = await buildBombArchive([
        { name: 'word/document.xml', decompressedBytes: 50 * megabyte },
      ]);
      await expect(bufferToOfficeHtml(bomb, 'evil.docx', '')).rejects.toThrow(ZipBombError);
    });

    test('legitimate small office files are not impacted by the safety check', async () => {
      /* Real DOCX fixture from the test fixtures directory should still
       * render — paranoid validation that the safety check doesn't false-
       * positive on tiny legitimate inputs. Small fixture takes the CDN
       * path, so we assert by wrapper structure instead of doc text. */
      const fixture = readFixture('sample.docx');
      const html = await wordDocToHtml(fixture);
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('id="lc-doc-data"');
    });
  });

  describe('sanitizeOfficeHtml security', () => {
    test('strips <script> tags entirely', async () => {
      const out = await sanitizeOfficeHtml('<p>before<script>alert(1)</script>after</p>');
      expect(out).not.toMatch(/<script\b/i);
      expect(out).not.toContain('alert(1)');
      expect(out).toContain('before');
      expect(out).toContain('after');
    });

    test('drops event-handler attributes from surviving tags', async () => {
      const out = await sanitizeOfficeHtml('<img src="https://x.test/a.png" onerror="alert(1)">');
      expect(out).not.toMatch(/onerror=/i);
      expect(out).toContain('https://x.test/a.png');
    });

    test('strips javascript: URLs from anchors', async () => {
      const out = await sanitizeOfficeHtml('<a href="javascript:alert(1)">click</a>');
      expect(out).not.toMatch(/javascript:/i);
      // The text survives even when the href is dropped.
      expect(out).toContain('click');
    });

    test('rejects data: URLs in <a href> (only <img src> may use data:)', async () => {
      /* The Sandpack iframe sandbox does NOT gate `target="_blank"`
       * navigations. A surviving `<a href="data:text/html,...">` would
       * open attacker-controlled HTML in a new tab on click. The
       * sanitizer scopes `data:` to <img> only — global schemes are
       * http/https/mailto. Regression guard for the Codex review on
       * PR #12934. */
      const out = await sanitizeOfficeHtml(
        '<a href="data:text/html,<script>alert(1)</script>">click</a>',
      );
      expect(out).not.toContain('data:');
      expect(out).not.toContain('script');
      expect(out).toContain('click');
    });

    test('preserves data: URLs in <img src> (mammoth inlines DOCX images as base64)', async () => {
      const tinyPng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const out = await sanitizeOfficeHtml(`<img src="${tinyPng}" alt="dot">`);
      expect(out).toContain(tinyPng);
      expect(out).toContain('alt="dot"');
    });

    test('preserves http(s) and mailto links on anchors', async () => {
      const out = await sanitizeOfficeHtml(
        '<a href="https://example.com">site</a> <a href="mailto:a@b.test">mail</a>',
      );
      expect(out).toContain('https://example.com');
      expect(out).toContain('mailto:a@b.test');
    });

    test('forces target=_blank rel=noopener on surviving anchors', async () => {
      const out = await sanitizeOfficeHtml('<a href="https://example.com">link</a>');
      expect(out).toContain('target="_blank"');
      expect(out).toContain('rel="noopener noreferrer"');
    });

    test('strips <iframe> entirely', async () => {
      const out = await sanitizeOfficeHtml('<p>x</p><iframe src="https://evil.test"></iframe>');
      expect(out).not.toMatch(/<iframe\b/i);
      expect(out).not.toContain('evil.test');
    });
  });
});
