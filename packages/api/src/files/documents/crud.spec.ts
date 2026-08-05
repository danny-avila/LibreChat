import path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import { parseDocument, annotateMissingPages } from './crud';

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

      /** Page 1 is real text; page 2 is image-only and must be called out, not dropped silently. */
      expect(document.text).toContain('Quarterly Report');
      expect(document.pagesNeedingOcr).toEqual([2]);
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
      /* pdfjs ships ESM that Jest cannot load in this project, which is why the real
       * import stays lazy. Only that loader is stubbed here; the assertion is on our
       * own wiring, that a pdf-inspector failure routes to the legacy extractor and
       * its text is what comes back. */
      jest.doMock(
        'pdfjs-dist/legacy/build/pdf.mjs',
        () => ({
          getDocument: () => ({
            promise: Promise.resolve({
              numPages: 1,
              getPage: () =>
                Promise.resolve({
                  getTextContent: () =>
                    Promise.resolve({ items: [{ str: 'Quarterly' }, { str: 'Report' }] }),
                }),
            }),
          }),
        }),
        { virtual: true },
      );

      jest.resetModules();
      const { parseDocument: parseWithStub } = await import('./crud');
      const document = await parseWithStub({ file: pdfFile('sample-badxref.pdf') });

      expect(document.text).toBe('Quarterly Report\n');
      /** The fallback is the flat extractor, so no structure and no page-level OCR data. */
      expect(document.text).not.toContain('|Region|');
      expect(document.pagesNeedingOcr).toBeUndefined();

      jest.dontMock('pdfjs-dist/legacy/build/pdf.mjs');
      jest.resetModules();
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

    test('rejects a zip bomb without handing it to anydoc', async () => {
      /* anydoc applies no decompression cap of its own: measured on this fixture it
       * returns 80MB of Markdown at ~400MB RSS from 158KB on disk. Asserting only
       * that parseDocument rejects would pass even if anydoc had already inflated
       * the file, because the fallback parser throws too. What has to hold is that
       * anydoc is never handed the bytes at all. */
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';
      const toMarkdownBytes = jest.fn();
      jest.doMock('@firecrawl/anydoc', () => ({ toMarkdownBytes, formatFromPath: () => null }));
      jest.resetModules();
      const { parseDocument: parseWithSpy } = await import('./crud');

      await expect(parseWithSpy({ file: docxFile('bomb.docx') })).rejects.toThrow(
        /exceeds the 25MB per-entry decompressed cap/,
      );
      expect(toMarkdownBytes).not.toHaveBeenCalled();

      jest.dontMock('@firecrawl/anydoc');
      jest.resetModules();
    });

    test('hands a safe document to anydoc', async () => {
      /* The counterpart to the bomb case: proves the spy above would have fired,
       * so "not called" there is a real guarantee and not a broken mock. */
      process.env.DOCUMENT_PARSER_ANYDOC = 'true';
      const toMarkdownBytes = jest.fn().mockResolvedValue('# stubbed');
      jest.doMock('@firecrawl/anydoc', () => ({ toMarkdownBytes, formatFromPath: () => null }));
      jest.resetModules();
      const { parseDocument: parseWithSpy } = await import('./crud');

      const document = await parseWithSpy({ file: docxFile('structured.docx') });

      expect(toMarkdownBytes).toHaveBeenCalledTimes(1);
      expect(document.text).toBe('# stubbed');

      jest.dontMock('@firecrawl/anydoc');
      jest.resetModules();
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
  });
});
