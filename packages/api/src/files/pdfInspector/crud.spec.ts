import path from 'path';
import * as fs from 'fs';
import { parseWithPdfInspector, pdfInspectorSupportedMimeTypes } from './crud';

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

describe('pdf-inspector local parser', () => {
  const pdfFile = (name: string, mimetype = 'application/pdf'): Express.Multer.File =>
    ({
      originalname: name,
      path: path.join(__dirname, '..', 'documents', name),
      mimetype,
    }) as Express.Multer.File;

  const context = (file: Express.Multer.File) => file;

  beforeEach(() => {
    mockPdfjs.numPages = 1;
    mockPdfjs.pageText = {};
    mockPdfjs.destroy.mockClear();
    mockPdfjs.requestedPages = [];
  });

  describe('supported types', () => {
    test('declares PDF as its only supported type', () => {
      expect(pdfInspectorSupportedMimeTypes).toHaveLength(1);
      expect(pdfInspectorSupportedMimeTypes[0].test('application/pdf')).toBe(true);
      expect(pdfInspectorSupportedMimeTypes[0].test('application/pdfx')).toBe(false);
    });

    test('rejects a non-PDF with a message naming the provider and the type', async () => {
      /* Direct callers can still pass a DOCX, so the refusal has to say which engine
       * refused and what it was handed. */
      const file = pdfFile(
        'sample.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      await expect(parseWithPdfInspector(context(file))).rejects.toThrow(
        /pdf-inspector only extracts PDF files, but received "application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document"/,
      );
    });

    test('rejects a missing mimetype rather than attempting a parse', async () => {
      const file = pdfFile('sample.pdf', '');

      await expect(parseWithPdfInspector(context(file))).rejects.toThrow(
        'pdf-inspector only extracts PDF files, but received "unknown".',
      );
    });
  });

  test('recovers layout structure from a text-based pdf', async () => {
    const result = await parseWithPdfInspector(context(pdfFile('sample.pdf')));

    expect(result.filepath).toBe('pdf_inspector');
    expect(result.filename).toBe('sample.pdf');
    expect(result.images).toEqual([]);
    expect(result.bytes).toBe(Buffer.byteLength(result.text, 'utf8'));
    /** Headings and tables are the structure the flat pdfjs extractor cannot express. */
    expect(result.text).toContain('# Quarterly Report');
    expect(result.text).toContain('|Region|Units|Revenue|');
    expect(result.text).toContain('|North|1200|48000|');
    expect(result.pagesNeedingOcr).toBeUndefined();
  });

  test('reports the scanned pages of a part-scanned pdf', async () => {
    const result = await parseWithPdfInspector(context(pdfFile('sample-mixed.pdf')));

    /** Page 1 is real text; page 2 has no text layer in either engine and must be
     * called out, not dropped silently. */
    expect(result.text).toContain('Quarterly Report');
    expect(result.pagesNeedingOcr).toEqual([2]);
  });

  test('recovers pages pdf-inspector drops, from the raw text layer', async () => {
    /* pdf-inspector's quality heuristics reject poor embedded OCR layers outright:
     * on a 157-page scanned press kit it kept 5 pages and silently dropped 152.
     * A page it drops must fall back to whatever the raw text layer holds, and only
     * pages where both engines find nothing belong in the omission notice. */
    mockPdfjs.pageText = { 2: 'garbled but present ocr layer text' };

    const result = await parseWithPdfInspector(context(pdfFile('sample-mixed.pdf')));

    expect(result.text).toContain('Quarterly Report');
    expect(result.text).toContain('garbled but present ocr layer text');
    expect(result.pagesNeedingOcr).toBeUndefined();
  });

  test('ignores garbled-text flags that are not scanned pages', async () => {
    /* pdf-inspector also flags pages via a suspected_garbled_text heuristic that
     * false-positives on dot leaders and other dense punctuation. Those pages keep
     * their text, so reporting them would claim content was dropped when none was.
     * Only the empirical two-engine probe decides what needs OCR. */
    const { processPdf } = await import('@firecrawl/pdf-inspector');
    const raw = processPdf(fs.readFileSync(path.join(__dirname, '..', 'documents', 'sample.pdf')));
    const reasons = (raw.ocrReasonsByPage ?? []).flatMap((entry) => entry.reasons ?? []);

    expect(reasons).not.toContain('scanned');

    const result = await parseWithPdfInspector(context(pdfFile('sample.pdf')));

    expect(result.pagesNeedingOcr).toBeUndefined();
  });

  test('returns no text and reports every page for a fully scanned pdf', async () => {
    /* Neither engine finds a text layer, so the document is empty and every page is
     * accounted for. Deciding what an empty extraction means belongs to the caller. */
    const result = await parseWithPdfInspector(context(pdfFile('sample-scanned.pdf')));

    expect(result.text).toBe('');
    expect(result.pagesNeedingOcr).toEqual([1]);
  });

  test('falls back to pdfjs for a document with a corrupted xref table', async () => {
    mockPdfjs.pageText = { 1: 'Quarterly Report' };

    const result = await parseWithPdfInspector(context(pdfFile('sample-badxref.pdf')));

    expect(result.filepath).toBe('pdf_inspector');
    expect(result.text).toBe('Quarterly Report\n');
    expect(mockPdfjs.destroy).toHaveBeenCalled();
  });

  test('falls back to pdfjs when pdf-inspector reports no pages', async () => {
    mockPdfjs.pageText = { 1: 'Recovered flat text' };
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('./native', () => ({
          extractPagesMarkdownIsolated: async () => [],
          extractTextIsolated: async () => '',
        }));

        const { parseWithPdfInspector: uploadIsolated } = await import('./crud');

        const result = await uploadIsolated(context(pdfFile('sample.pdf')));

        expect(result.text).toBe('Recovered flat text\n');
      });
    } finally {
      jest.dontMock('./native');
    }
  });

  test('reports image-only pages when the whole-document pdfjs fallback reads mixed content', async () => {
    mockPdfjs.numPages = 2;
    mockPdfjs.pageText = { 1: 'Recovered text page' };
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('./native', () => ({
          extractPagesMarkdownIsolated: async () => {
            throw new Error('native parser rejected the document');
          },
          extractTextIsolated: async () => '',
        }));

        const { parseWithPdfInspector: uploadIsolated } = await import('./crud');
        const result = await uploadIsolated(context(pdfFile('sample.pdf')));

        expect(result.text).toBe('Recovered text page\n\n');
        expect(result.pagesNeedingOcr).toEqual([2]);
      });
    } finally {
      jest.dontMock('./native');
    }
  });

  test('bounds the whole-document pdfjs fallback on a page-flooded document', async () => {
    mockPdfjs.numPages = 4000;
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('./native', () => ({
          extractPagesMarkdownIsolated: async () => {
            throw new Error('native parser rejected the document');
          },
          extractTextIsolated: async () => '',
        }));

        const { parseWithPdfInspector: uploadIsolated } = await import('./crud');

        await expect(uploadIsolated(context(pdfFile('sample.pdf')))).rejects.toThrow(
          'PDF contains 4000 pages, exceeding the 250-page fallback limit',
        );
        expect(mockPdfjs.requestedPages).toHaveLength(0);
        expect(mockPdfjs.destroy).toHaveBeenCalled();
      });
    } finally {
      jest.dontMock('./native');
    }
  });

  test('bounds the pdfjs recovery walk on a page-flooded document', async () => {
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
        jest.doMock('./native', () => ({
          extractPagesMarkdownIsolated: async () => flooded,
          extractTextIsolated: async () => '',
        }));

        const { parseWithPdfInspector: uploadIsolated } = await import('./crud');
        const result = await uploadIsolated(context(pdfFile('sample.pdf')));

        expect(mockPdfjs.requestedPages).toHaveLength(250);
        /* Unprobed pages are reported rather than silently dropped, so the count
         * still accounts for the whole document. */
        expect(result.pagesNeedingOcr).toHaveLength(3750);
        /** The pages that were probed still contribute their text. */
        expect(result.text).toContain('recovered line');
      });
    } finally {
      jest.dontMock('./native');
    }
  });

  test('ships whole-document plain text when most pages are dropped', async () => {
    /* Letter-spacing in poor OCR layers lives inside the item strings, so pdfjs
     * assembly outputs mush ("m i s s i o n"). pdf-inspector's plain-text extractor
     * re-segments words from glyph positions; when structure survived on only a
     * sliver of pages, the whole document goes through it instead. The omission
     * notice still comes from the empirical per-page probe. */
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('./native', () => ({
          extractPagesMarkdownIsolated: async () => [
            { page: 0, markdown: '# Only structured page' },
            { page: 1, markdown: '' },
            { page: 2, markdown: '' },
          ],
          extractTextIsolated: async () => 'clean whole document text',
        }));
        mockPdfjs.pageText = { 2: 'm u s h y r e c o v e r y' };

        const { parseWithPdfInspector: uploadIsolated } = await import('./crud');
        const result = await uploadIsolated(context(pdfFile('sample.pdf')));

        expect(result.text).toBe('clean whole document text');
        /** Page 3 had nothing in either engine, and stays reported despite the swap. */
        expect(result.pagesNeedingOcr).toEqual([3]);
      });
    } finally {
      /* isolateModulesAsync scopes the module registry but not doMock itself. */
      jest.dontMock('./native');
    }
  });

  test('keeps per-page interleaving when exactly half the pages drop', async () => {
    /* Pins the majority threshold as a strict '>': at exactly 50% dropped the
     * per-page path still wins. Without this a '>=' would pass every other
     * assertion in the suite, since the mixed fixture is itself exactly 50%. */
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('./native', () => ({
          extractPagesMarkdownIsolated: async () => [
            { page: 0, markdown: '# Structured page' },
            { page: 1, markdown: '' },
          ],
          extractTextIsolated: async () => 'WHOLE_DOCUMENT_SENTINEL',
        }));
        mockPdfjs.pageText = { 2: 'recovered second page' };

        const { parseWithPdfInspector: uploadIsolated } = await import('./crud');
        const result = await uploadIsolated(context(pdfFile('sample.pdf')));

        expect(result.text).not.toContain('WHOLE_DOCUMENT_SENTINEL');
        expect(result.text).toBe('# Structured page\n\nrecovered second page');
      });
    } finally {
      jest.dontMock('./native');
    }
  });

  test('interleaves pages when the whole-document extractor throws', async () => {
    /* The plain-text extractor is an optimization, not a dependency: if it fails
     * on a majority-dropped document the per-page assembly still has to ship. */
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('./native', () => ({
          extractPagesMarkdownIsolated: async () => [
            { page: 0, markdown: '# Only structured page' },
            { page: 1, markdown: '' },
            { page: 2, markdown: '' },
          ],
          extractTextIsolated: async () => {
            throw new Error('plain-text extraction failed');
          },
        }));
        mockPdfjs.pageText = { 2: 'recovered second page' };

        const { parseWithPdfInspector: uploadIsolated } = await import('./crud');
        const result = await uploadIsolated(context(pdfFile('sample.pdf')));

        expect(result.text).toBe('# Only structured page\n\nrecovered second page');
        /** Page 3 had nothing in either engine and is still reported. */
        expect(result.pagesNeedingOcr).toEqual([3]);
      });
    } finally {
      jest.dontMock('./native');
    }
  });

  test('releases the pdfjs document after page recovery', async () => {
    /* pdfjs pins the decoded document and its worker until the loading task is
     * destroyed, so an undestroyed task holds the buffer for the whole request. */
    await parseWithPdfInspector(context(pdfFile('sample-mixed.pdf')));

    expect(mockPdfjs.destroy).toHaveBeenCalled();
  });
});
