import path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import { parseDocument, annotateMissingPages } from './crud';

/**
 * pdfjs ships ESM this Jest setup cannot load, so the suite stubs it wholesale.
 * Per-test behavior is driven through these knobs; the default of no text models
 * pages with no readable layer, which is what image-only fixtures contain.
 */
const mockPdfjs: {
  numPages: number;
  pageText: Record<number, string>;
  destroy: jest.Mock<Promise<void>, []>;
  /** 1-indexed pages pdfjs was asked for, so tests can prove the walk is bounded. */
  requestedPages: number[];
} = {
  numPages: 1,
  pageText: {},
  destroy: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  requestedPages: [],
};

jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: () => ({
    destroy: () => mockPdfjs.destroy(),
    promise: Promise.resolve({
      get numPages() {
        return mockPdfjs.numPages;
      },
      getPage: (pageNumber: number) => {
        mockPdfjs.requestedPages.push(pageNumber);
        return Promise.resolve({
          getTextContent: () =>
            Promise.resolve({
              items: (mockPdfjs.pageText[pageNumber] ?? '')
                .split(' ')
                .filter(Boolean)
                .map((str) => ({ str })),
            }),
        });
      },
    }),
  }),
}));

describe('Document Parser', () => {
  test('parseDocument() parses text from docx', async () => {
    const file = {
      originalname: 'sample.docx',
      path: path.join(__dirname, 'sample.docx'),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    } as Express.Multer.File;

    const document = await parseDocument({ file });

    expect(document).toEqual({
      bytes: 29,
      filename: 'sample.docx',
      filepath: 'document_parser',
      images: [],
      text: 'This is a sample DOCX file.\n\n',
    });
  });

  test('parseDocument() parses text from xlsx', async () => {
    const file = {
      originalname: 'sample.xlsx',
      path: path.join(__dirname, 'sample.xlsx'),
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as Express.Multer.File;

    const document = await parseDocument({ file });

    expect(document).toEqual({
      bytes: 66,
      filename: 'sample.xlsx',
      filepath: 'document_parser',
      images: [],
      text: 'Sheet One:\nData,on,first,sheet\nSecond Sheet:\nData,On\nSecond,Sheet\n',
    });
  });

  test('parseDocument() parses text from xls', async () => {
    const file = {
      originalname: 'sample.xls',
      path: path.join(__dirname, 'sample.xls'),
      mimetype: 'application/vnd.ms-excel',
    } as Express.Multer.File;

    const document = await parseDocument({ file });

    expect(document).toEqual({
      bytes: 31,
      filename: 'sample.xls',
      filepath: 'document_parser',
      images: [],
      text: 'Sheet One:\nData,on,first,sheet\n',
    });
  });

  test('parseDocument() parses text from ods', async () => {
    const file = {
      originalname: 'sample.ods',
      path: path.join(__dirname, 'sample.ods'),
      mimetype: 'application/vnd.oasis.opendocument.spreadsheet',
    } as Express.Multer.File;

    const document = await parseDocument({ file });

    expect(document).toEqual({
      bytes: 66,
      filename: 'sample.ods',
      filepath: 'document_parser',
      images: [],
      text: 'Sheet One:\nData,on,first,sheet\nSecond Sheet:\nData,On\nSecond,Sheet\n',
    });
  });

  test('parseDocument() parses text from odt', async () => {
    const file = {
      originalname: 'sample.odt',
      path: path.join(__dirname, 'sample.odt'),
      mimetype: 'application/vnd.oasis.opendocument.text',
    } as Express.Multer.File;

    const document = await parseDocument({ file });

    expect(document).toEqual({
      bytes: 50,
      filename: 'sample.odt',
      filepath: 'document_parser',
      images: [],
      text: 'This is a sample ODT file.\n\nIt has two paragraphs.',
    });
  });

  test('parseDocument() throws for odt with no extractable text', async () => {
    const file = {
      originalname: 'empty.odt',
      path: path.join(__dirname, 'empty.odt'),
      mimetype: 'application/vnd.oasis.opendocument.text',
    } as Express.Multer.File;

    await expect(parseDocument({ file })).rejects.toThrow('No text found in document');
  });

  test('parseDocument() aborts decompression when content.xml exceeds the size limit', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
    zip.file('content.xml', 'x'.repeat(51 * 1024 * 1024), { compression: 'DEFLATE' });
    const buf = await zip.generateAsync({ type: 'nodebuffer' });

    const tmpPath = path.join(__dirname, 'bomb.odt');
    await fs.promises.writeFile(tmpPath, buf);
    try {
      const file = {
        originalname: 'bomb.odt',
        path: tmpPath,
        mimetype: 'application/vnd.oasis.opendocument.text',
      } as Express.Multer.File;
      await expect(parseDocument({ file })).rejects.toThrow(/exceeds the 50MB decompressed limit/);
    } finally {
      await fs.promises.unlink(tmpPath);
    }
  });

  test('parseDocument() decodes XML entities and normalizes tab and spacing elements to spaces from odt', async () => {
    const file = {
      originalname: 'sample-entities.odt',
      path: path.join(__dirname, 'sample-entities.odt'),
      mimetype: 'application/vnd.oasis.opendocument.text',
    } as Express.Multer.File;

    const document = await parseDocument({ file });

    expect(document).toEqual({
      bytes: 19,
      filename: 'sample-entities.odt',
      filepath: 'document_parser',
      images: [],
      text: 'AT&T and A>B\n\nx y z',
    });
  });

  test.each([
    'application/msexcel',
    'application/x-msexcel',
    'application/x-ms-excel',
    'application/x-excel',
    'application/x-dos_ms_excel',
    'application/xls',
    'application/x-xls',
  ])('parseDocument() parses xls with variant MIME type: %s', async (mimetype) => {
    const file = {
      originalname: 'sample.xls',
      path: path.join(__dirname, 'sample.xls'),
      mimetype,
    } as Express.Multer.File;

    const document = await parseDocument({ file });

    expect(document).toEqual({
      bytes: 31,
      filename: 'sample.xls',
      filepath: 'document_parser',
      images: [],
      text: 'Sheet One:\nData,on,first,sheet\n',
    });
  });

  test('parseDocument() throws error for unhandled document type', async () => {
    const file = {
      originalname: 'nonexistent.file',
      path: path.join(__dirname, 'nonexistent.file'),
      mimetype: 'application/invalid',
    } as Express.Multer.File;

    await expect(parseDocument({ file })).rejects.toThrow(
      'Unsupported file type in document parser: application/invalid',
    );
  });

  test('parseDocument() throws error for empty document', async () => {
    const file = {
      originalname: 'empty.docx',
      path: path.join(__dirname, 'empty.docx'),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    } as Express.Multer.File;

    await expect(parseDocument({ file })).rejects.toThrow('No text found in document');
  });

  test('parseDocument() rejects files exceeding the pre-parse size limit', async () => {
    const file = {
      originalname: 'oversized.docx',
      path: path.join(__dirname, 'sample.docx'),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 16 * 1024 * 1024,
    } as Express.Multer.File;

    await expect(parseDocument({ file })).rejects.toThrow(
      /exceeds the 15MB document parser limit \(16MB\)/,
    );
  });

  test('parseDocument() allows files exactly at the size limit boundary', async () => {
    const file = {
      originalname: 'sample.docx',
      path: path.join(__dirname, 'sample.docx'),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 15 * 1024 * 1024,
    } as Express.Multer.File;

    await expect(parseDocument({ file })).resolves.toBeDefined();
  });

  test('parseDocument() parses empty xlsx with only sheet name', async () => {
    const file = {
      originalname: 'empty.xlsx',
      path: path.join(__dirname, 'empty.xlsx'),
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as Express.Multer.File;

    const document = await parseDocument({ file });

    expect(document).toEqual({
      bytes: 8,
      filename: 'empty.xlsx',
      filepath: 'document_parser',
      images: [],
      text: 'Empty:\n\n',
    });
  });

  test('xlsx exports read and utils as named imports', async () => {
    const { read, utils } = await import('xlsx');
    expect(typeof read).toBe('function');
    expect(typeof utils?.sheet_to_csv).toBe('function');
  });

  describe('PDF', () => {
    const pdfFile = (name: string): Express.Multer.File =>
      ({
        originalname: name,
        path: path.join(__dirname, name),
        mimetype: 'application/pdf',
      }) as Express.Multer.File;

    beforeEach(() => {
      mockPdfjs.numPages = 1;
      mockPdfjs.pageText = {};
      mockPdfjs.destroy.mockClear();
      mockPdfjs.requestedPages = [];
    });

    test('parseDocument() recovers layout structure from a text-based pdf', async () => {
      const document = await parseDocument({ file: pdfFile('sample.pdf') });

      expect(document.filepath).toBe('document_parser');
      expect(document.filename).toBe('sample.pdf');
      /** Headings and tables are the structure the flat pdfjs extractor cannot express. */
      expect(document.text).toContain('# Quarterly Report');
      expect(document.text).toContain('|Region|Units|Revenue|');
      expect(document.text).toContain('|North|1200|48000|');
      expect(document.pagesNeedingOcr).toBeUndefined();
    });

    test('parseDocument() reports the scanned pages of a part-scanned pdf', async () => {
      const document = await parseDocument({ file: pdfFile('sample-mixed.pdf') });

      /** Page 1 is real text; page 2 has no text layer in either engine and must be
       * called out, not dropped silently. */
      expect(document.text).toContain('Quarterly Report');
      expect(document.pagesNeedingOcr).toEqual([2]);
    });

    test('parseDocument() recovers pages pdf-inspector drops, from the raw text layer', async () => {
      /* pdf-inspector's quality heuristics reject poor embedded OCR layers outright:
       * on a 157-page scanned press kit it kept 5 pages and silently dropped 152.
       * A page it drops must fall back to whatever the raw text layer holds, and only
       * pages where both engines find nothing belong in the omission notice. */
      mockPdfjs.pageText = { 2: 'garbled but present ocr layer text' };

      const document = await parseDocument({ file: pdfFile('sample-mixed.pdf') });

      expect(document.text).toContain('Quarterly Report');
      expect(document.text).toContain('garbled but present ocr layer text');
      expect(document.pagesNeedingOcr).toBeUndefined();
    });

    test('parseDocument() ignores garbled-text flags that are not scanned pages', async () => {
      /* pdf-inspector also flags pages via a suspected_garbled_text heuristic that
       * false-positives on dot leaders and other dense punctuation. Those pages keep
       * their text, so reporting them would claim content was dropped when none was.
       * Only a 'scanned' reason means the page genuinely has nothing to extract. */
      const { processPdf } = await import('@firecrawl/pdf-inspector');
      const raw = processPdf(fs.readFileSync(path.join(__dirname, 'sample.pdf')));
      const reasons = (raw.ocrReasonsByPage ?? []).flatMap((entry) => entry.reasons ?? []);

      expect(reasons).not.toContain('scanned');

      const document = await parseDocument({ file: pdfFile('sample.pdf') });

      expect(document.pagesNeedingOcr).toBeUndefined();
    });

    test('parseDocument() throws for a fully scanned pdf', async () => {
      await expect(parseDocument({ file: pdfFile('sample-scanned.pdf') })).rejects.toThrow(
        'No text found in document',
      );
    });

    test('pdf-inspector rejects a document with a corrupted xref table', async () => {
      /* The reason the pdfjs fallback has to survive: pdfjs rebuilds a damaged xref
       * table, pdf-inspector does not. Without the fallback these documents, which
       * parse today, would start failing. */
      const { processPdf } = await import('@firecrawl/pdf-inspector');

      expect(() => processPdf(fs.readFileSync(path.join(__dirname, 'sample-badxref.pdf')))).toThrow(
        /Invalid PDF structure/,
      );
    });

    test('parseDocument() bounds the pdfjs recovery walk on a page-flooded document', async () => {
      /* Recovery is one sequential pdfjs read per dropped page (~20ms), while a page
       * object costs an attacker ~110 bytes, so an unbounded walk turns a single
       * upload into hours of CPU on the request path. Past the cap the pages are
       * reported as needing OCR instead of probed. */
      const flooded = Array.from({ length: 4000 }, (_, page) => ({ page, markdown: '' }));
      /* Every page carries a readable layer, so an unbounded walk would recover all
       * 4000 and report none. What the cap costs is visible in the assertions below. */
      mockPdfjs.pageText = Object.fromEntries(
        Array.from({ length: 4000 }, (_, i) => [i + 1, 'recovered line']),
      );
      try {
        await jest.isolateModulesAsync(async () => {
          jest.doMock('@firecrawl/pdf-inspector', () => ({
            extractPagesMarkdown: () => ({ pages: flooded }),
            extractText: () => '',
          }));

          const { parseDocument: parseIsolated } = await import('./crud');
          const document = await parseIsolated({ file: pdfFile('sample.pdf') });

          expect(mockPdfjs.requestedPages).toHaveLength(250);
          /* Unprobed pages are reported rather than silently dropped, so the count
           * still accounts for the whole document. */
          expect(document.pagesNeedingOcr).toHaveLength(3750);
          /** The pages that were probed still contribute their text. */
          expect(document.text).toContain('recovered line');
        });
      } finally {
        jest.dontMock('@firecrawl/pdf-inspector');
      }
    });

    test('parseDocument() ships whole-document plain text when most pages are dropped', async () => {
      /* Letter-spacing in poor OCR layers lives inside the item strings, so pdfjs
       * assembly outputs mush ("m i s s i o n"). pdf-inspector's plain-text extractor
       * re-segments words from glyph positions; when structure survived on only a
       * sliver of pages, the whole document goes through it instead. The omission
       * notice still comes from the empirical per-page probe. */
      try {
        await jest.isolateModulesAsync(async () => {
          jest.doMock('@firecrawl/pdf-inspector', () => ({
            extractPagesMarkdown: () => ({
              pages: [
                { page: 0, markdown: '# Only structured page' },
                { page: 1, markdown: '' },
                { page: 2, markdown: '' },
              ],
            }),
            extractText: () => 'clean whole document text',
          }));
          mockPdfjs.pageText = { 2: 'm u s h y r e c o v e r y' };

          const { parseDocument: parseIsolated } = await import('./crud');
          const document = await parseIsolated({ file: pdfFile('sample.pdf') });

          expect(document.text).toBe('clean whole document text');
          /** Page 3 had nothing in either engine, and stays reported despite the swap. */
          expect(document.pagesNeedingOcr).toEqual([3]);
        });
      } finally {
        /* isolateModulesAsync scopes the module registry but not doMock itself. */
        jest.dontMock('@firecrawl/pdf-inspector');
      }
    });

    test('parseDocument() falls back to the flat extractor when pdf-inspector throws', async () => {
      mockPdfjs.numPages = 1;
      mockPdfjs.pageText = { 1: 'Quarterly Report' };

      const document = await parseDocument({ file: pdfFile('sample-badxref.pdf') });

      expect(document.text).toBe('Quarterly Report\n');
      /** The fallback is the flat extractor, so no structure and no page-level OCR data. */
      expect(document.text).not.toContain('|Region|');
      expect(document.pagesNeedingOcr).toBeUndefined();
    });

    test('parseDocument() falls back to pdfjs when pdf-inspector reports no pages', async () => {
      /* An empty page list is not an empty document: joining zero pages yields '',
       * which would surface as "No text found in document" and never reach pdfjs.
       * A PDF that parses on the flat extractor has to keep parsing. */
      try {
        await jest.isolateModulesAsync(async () => {
          jest.doMock('@firecrawl/pdf-inspector', () => ({
            extractPagesMarkdown: () => ({ pages: [] }),
            extractText: () => '',
          }));
          mockPdfjs.numPages = 1;
          mockPdfjs.pageText = { 1: 'Quarterly Report' };

          const { parseDocument: parseIsolated } = await import('./crud');
          const document = await parseIsolated({ file: pdfFile('sample.pdf') });

          expect(document.text).toBe('Quarterly Report\n');
        });
      } finally {
        jest.dontMock('@firecrawl/pdf-inspector');
      }
    });

    test('parseDocument() keeps per-page interleaving when exactly half the pages drop', async () => {
      /* Pins the majority threshold as a strict '>': at exactly 50% dropped the
       * per-page path still wins. Without this a '>=' would pass every other
       * assertion in the suite, since the mixed fixture is itself exactly 50%. */
      try {
        await jest.isolateModulesAsync(async () => {
          jest.doMock('@firecrawl/pdf-inspector', () => ({
            extractPagesMarkdown: () => ({
              pages: [
                { page: 0, markdown: '# Structured page' },
                { page: 1, markdown: '' },
              ],
            }),
            extractText: () => 'WHOLE_DOCUMENT_SENTINEL',
          }));
          mockPdfjs.pageText = { 2: 'recovered second page' };

          const { parseDocument: parseIsolated } = await import('./crud');
          const document = await parseIsolated({ file: pdfFile('sample.pdf') });

          expect(document.text).not.toContain('WHOLE_DOCUMENT_SENTINEL');
          expect(document.text).toBe('# Structured page\n\nrecovered second page');
        });
      } finally {
        jest.dontMock('@firecrawl/pdf-inspector');
      }
    });

    test('parseDocument() interleaves pages when the whole-document extractor throws', async () => {
      /* The plain-text extractor is an optimization, not a dependency: if it fails
       * on a majority-dropped document the per-page assembly still has to ship. */
      try {
        await jest.isolateModulesAsync(async () => {
          jest.doMock('@firecrawl/pdf-inspector', () => ({
            extractPagesMarkdown: () => ({
              pages: [
                { page: 0, markdown: '# Only structured page' },
                { page: 1, markdown: '' },
                { page: 2, markdown: '' },
              ],
            }),
            extractText: () => {
              throw new Error('plain-text extraction failed');
            },
          }));
          mockPdfjs.pageText = { 2: 'recovered second page' };

          const { parseDocument: parseIsolated } = await import('./crud');
          const document = await parseIsolated({ file: pdfFile('sample.pdf') });

          expect(document.text).toBe('# Only structured page\n\nrecovered second page');
          /** Page 3 had nothing in either engine and is still reported. */
          expect(document.pagesNeedingOcr).toEqual([3]);
        });
      } finally {
        jest.dontMock('@firecrawl/pdf-inspector');
      }
    });

    test('parseDocument() releases the pdfjs document after page recovery', async () => {
      /* pdfjs pins the decoded document and its worker until the loading task is
       * destroyed, so an undestroyed task holds the buffer for the whole request. */
      await parseDocument({ file: pdfFile('sample-mixed.pdf') });

      expect(mockPdfjs.destroy).toHaveBeenCalled();
    });

    test('parseDocument() releases the pdfjs document on the flat-extractor path', async () => {
      mockPdfjs.pageText = { 1: 'Quarterly Report' };

      await parseDocument({ file: pdfFile('sample-badxref.pdf') });

      expect(mockPdfjs.destroy).toHaveBeenCalled();
    });
  });

  describe('PPTX', () => {
    const pptxFile = (): Express.Multer.File =>
      ({
        originalname: 'deck.pptx',
        path: path.join(__dirname, 'deck.pptx'),
        mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }) as Express.Multer.File;

    afterEach(() => {
      delete process.env.DOCUMENT_PARSER_ANYDOC;
    });

    test('extracts slide titles and body text with the built-in parser', async () => {
      const document = await parseDocument({ file: pptxFile() });

      expect(document.filepath).toBe('document_parser');
      expect(document.text).toContain('Slide 2: Quarterly Highlights');
      expect(document.text).toContain('Revenue up 12 percent');
      /* PPTX table cells are ordinary paragraphs, so the built-in reader returns
       * them as loose lines with the table structure gone. */
      expect(document.text).toContain('Region');
      expect(document.text).not.toContain('| Region |');
    });

    test('recovers slide headings, bullets and tables with anydoc enabled', async () => {
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';

      const document = await parseDocument({ file: pptxFile() });

      expect(document.text).toContain('## Quarterly Highlights');
      expect(document.text).toContain('- Revenue up 12 percent');
      expect(document.text).toContain('| Region | Units | Revenue |');
      expect(document.text).toContain('| North | 1200 | 48000 |');
    });
  });

  describe('anydoc (DOCUMENT_PARSER_ANYDOC)', () => {
    const docxFile = (name: string): Express.Multer.File =>
      ({
        originalname: name,
        path: path.join(__dirname, name),
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }) as Express.Multer.File;

    afterEach(() => {
      delete process.env.DOCUMENT_PARSER_ANYDOC;
    });

    test('is off by default, leaving the built-in extractors in place', async () => {
      const document = await parseDocument({ file: docxFile('sample.docx') });

      expect(document.text).toBe('This is a sample DOCX file.\n\n');
    });

    test('recovers headings, tables and emphasis when enabled', async () => {
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';

      const document = await parseDocument({ file: docxFile('structured.docx') });

      expect(document.text).toContain('# Quarterly Report');
      expect(document.text).toContain('## Regional Totals');
      expect(document.text).toContain('| Region | Units | Revenue |');
      expect(document.text).toContain('**Totals are unaudited.**');
    });

    test('the built-in extractor drops that same structure', async () => {
      /* Guards the premise of the flag: without it, mammoth returns the cell values
       * as loose lines with no table, no heading levels and no emphasis. */
      const document = await parseDocument({ file: docxFile('structured.docx') });

      expect(document.text).toContain('Quarterly Report');
      expect(document.text).not.toContain('# Quarterly Report');
      expect(document.text).not.toContain('| Region |');
      expect(document.text).not.toContain('**');
    });

    /**
     * Runs `body` with `@firecrawl/anydoc` stubbed by a spy, in a scoped module
     * registry. The finally is load-bearing: `doMock` outlives `isolateModulesAsync`,
     * so a failing assertion would otherwise leak the stub into every later test.
     */
    const withAnydocSpy = async (
      toMarkdownBytes: jest.Mock,
      body: (parse: typeof parseDocument) => Promise<void>,
    ): Promise<void> => {
      try {
        await jest.isolateModulesAsync(async () => {
          jest.doMock('@firecrawl/anydoc', () => ({ toMarkdownBytes, formatFromPath: () => null }));
          const { parseDocument: parseWithSpy } = await import('./crud');
          await body(parseWithSpy);
        });
      } finally {
        jest.dontMock('@firecrawl/anydoc');
      }
    };

    test('rejects a zip bomb without handing it to anydoc', async () => {
      /* anydoc applies no decompression cap of its own: measured on this fixture it
       * returns 80MB of Markdown at ~400MB RSS from 158KB on disk. Asserting only
       * that parseDocument rejects would pass even if anydoc had already inflated
       * the file, because the fallback parser throws too. What has to hold is that
       * anydoc is never handed the bytes at all. */
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';
      const toMarkdownBytes = jest.fn();

      await withAnydocSpy(toMarkdownBytes, async (parse) => {
        await expect(parse({ file: docxFile('bomb.docx') })).rejects.toThrow(
          /exceeds the 25MB per-entry decompressed cap/,
        );
        expect(toMarkdownBytes).not.toHaveBeenCalled();
      });
    });

    test('rejects a zip bomb padded with junk bytes ahead of the archive', async () => {
      /* The bypass a leading-magic-byte check cannot see. anydoc's zip reader finds
       * the central directory from the tail and tolerates prepended data, exactly as
       * self-extracting archives rely on, so eight junk bytes made the old guard
       * report "not a zip" while anydoc still inflated 162KB into 80MB of Markdown
       * at ~336MB RSS. Detection now scans the tail, and because yauzl does not
       * compensate for the offset shift, the refusal surfaces as a malformed
       * central directory rather than the cap message. Either way it must not
       * fall through to the parser. */
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';
      const bomb = await fs.promises.readFile(path.join(__dirname, 'bomb.docx'));
      const paddedPath = path.join(__dirname, 'bomb-padded.docx');
      await fs.promises.writeFile(paddedPath, Buffer.concat([Buffer.from('JUNKJUNK'), bomb]));

      const toMarkdownBytes = jest.fn();
      try {
        await withAnydocSpy(toMarkdownBytes, async (parse) => {
          const file = {
            originalname: 'bomb-padded.docx',
            path: paddedPath,
            mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          } as Express.Multer.File;

          await expect(parse({ file })).rejects.toThrow(/central directory/i);
          expect(toMarkdownBytes).not.toHaveBeenCalled();
        });
      } finally {
        await fs.promises.unlink(paddedPath);
      }
    });

    test('hands a safe document to anydoc', async () => {
      /* The counterpart to the bomb case: proves the spy above would have fired,
       * so "not called" there is a real guarantee and not a broken mock. */
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';
      const toMarkdownBytes = jest.fn().mockResolvedValue('# stubbed');

      await withAnydocSpy(toMarkdownBytes, async (parse) => {
        const document = await parse({ file: docxFile('structured.docx') });

        expect(toMarkdownBytes).toHaveBeenCalledTimes(1);
        expect(document.text).toBe('# stubbed');
      });
    });

    test('falls back to the built-in parser when anydoc returns empty text', async () => {
      /* anydoc can succeed and still produce nothing. That is a fallback case, not
       * a document with no text, so the built-in extractor still gets its turn. */
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';
      const toMarkdownBytes = jest.fn().mockResolvedValue('   ');

      await withAnydocSpy(toMarkdownBytes, async (parse) => {
        const document = await parse({ file: docxFile('structured.docx') });

        expect(toMarkdownBytes).toHaveBeenCalledTimes(1);
        expect(document.text).toContain('Quarterly Report');
        /** mammoth's output, not anydoc's: no heading levels, no table. */
        expect(document.text).not.toContain('# Quarterly Report');
      });
    });

    test('never routes PDF through anydoc, even when enabled', async () => {
      /* pdf-inspector is the same engine anydoc would use, and only the direct path
       * reports pagesNeedingOcr. Routing PDF through anydoc would silently drop the
       * omission notice for every scanned document. */
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';
      const toMarkdownBytes = jest.fn().mockResolvedValue('# should never be used');

      await withAnydocSpy(toMarkdownBytes, async (parse) => {
        const file = {
          originalname: 'sample-mixed.pdf',
          path: path.join(__dirname, 'sample-mixed.pdf'),
          mimetype: 'application/pdf',
        } as Express.Multer.File;

        const document = await parse({ file });

        expect(toMarkdownBytes).not.toHaveBeenCalled();
        expect(document.pagesNeedingOcr).toEqual([2]);
      });
    });

    test('falls back to the built-in parser when anydoc cannot read the file', async () => {
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';
      const file = {
        originalname: 'sample.xls',
        path: path.join(__dirname, 'sample.xls'),
        mimetype: 'application/vnd.ms-excel',
      } as Express.Multer.File;

      const document = await parseDocument({ file });

      expect(document.text.length).toBeGreaterThan(0);
    });
  });

  describe('spreadsheet zip guard', () => {
    /** Reachable with no feature flag: XLSX/ODS always go through SheetJS. */
    const bombWorkbook = async (): Promise<Buffer> => {
      const zip = new JSZip();
      zip.file('xl/worksheets/sheet1.xml', 'x'.repeat(26 * 1024 * 1024), {
        compression: 'DEFLATE',
      });
      return zip.generateAsync({ type: 'nodebuffer' });
    };

    const parseBuffer = async (buffer: Buffer, name: string): Promise<void> => {
      const tmpPath = path.join(__dirname, name);
      await fs.promises.writeFile(tmpPath, buffer);
      try {
        const file = {
          originalname: name,
          path: tmpPath,
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        } as Express.Multer.File;
        await parseDocument({ file });
      } finally {
        await fs.promises.unlink(tmpPath);
      }
    };

    test('rejects a zip-bomb workbook before SheetJS reads it', async () => {
      await expect(parseBuffer(await bombWorkbook(), 'bomb.xlsx')).rejects.toThrow(
        /exceeds the 25MB per-entry decompressed cap/,
      );
    });

    test('rejects a zip-bomb workbook padded with junk bytes ahead of the archive', async () => {
      /* Same tail-scan bypass as the DOCX case, on a path that needs no flag:
       * measured at 60KB on disk to ~520MB RSS when the guard was skipped. */
      const padded = Buffer.concat([Buffer.from('JUNKJUNK'), await bombWorkbook()]);

      await expect(parseBuffer(padded, 'bomb-padded.xlsx')).rejects.toThrow(/central directory/i);
    });

    test('leaves a legitimate non-zip .xls alone', async () => {
      /* `.xls` is a CFB container, not a ZIP. yauzl rejects it outright, so the
       * guard has to skip it rather than run unconditionally. */
      const file = {
        originalname: 'sample.xls',
        path: path.join(__dirname, 'sample.xls'),
        mimetype: 'application/vnd.ms-excel',
      } as Express.Multer.File;

      const document = await parseDocument({ file });

      expect(document.text).toBe('Sheet One:\nData,on,first,sheet\n');
    });
  });

  describe('annotateMissingPages()', () => {
    test('returns text unchanged when no pages are missing', () => {
      expect(annotateMissingPages('body', undefined)).toBe('body');
      expect(annotateMissingPages('body', [])).toBe('body');
    });

    test('names a single missing page in the singular', () => {
      const annotated = annotateMissingPages('body', [3]);

      expect(annotated).toContain('[Page 3 of this document contains no extractable text');
      expect(annotated).toContain('requires an OCR service');
      expect(annotated.startsWith('body')).toBe(true);
    });

    test('names every missing page', () => {
      const annotated = annotateMissingPages('body', [2, 5, 9]);

      expect(annotated).toContain('Pages 2, 5, 9');
      expect(annotated).toContain('require an OCR service');
    });

    test('caps the enumeration on a mostly-scanned document', () => {
      /* The notice is persisted on the record and re-sent to the model every turn,
       * so an uncapped list turns 100k dropped pages into ~673KB of pure enumeration. */
      const pages = Array.from({ length: 5000 }, (_, index) => index + 1);

      const annotated = annotateMissingPages('body', pages);

      expect(annotated).toContain('Pages 1, 2, 3');
      expect(annotated).toContain('20 and 4980 more');
      expect(annotated).not.toContain('21,');
      expect(annotated.length).toBeLessThan(300);
    });
  });
});
