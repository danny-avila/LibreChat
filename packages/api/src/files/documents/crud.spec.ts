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

    test('parseDocument() falls back to the flat extractor when pdf-inspector throws', async () => {
      mockPdfjs.numPages = 1;
      mockPdfjs.pageText = { 1: 'Quarterly Report' };

      const document = await parseDocument({ file: pdfFile('sample-badxref.pdf') });

      expect(document.text).toBe('Quarterly Report\n');
      /** The fallback is the flat extractor, so no structure and no page-level OCR data. */
      expect(document.text).not.toContain('|Region|');
      expect(document.pagesNeedingOcr).toBeUndefined();
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
