import path from 'path';
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

const fixture = (name: string, mimetype: string): Express.Multer.File =>
  ({
    originalname: name,
    path: path.join(__dirname, name),
    mimetype,
  }) as Express.Multer.File;

describe('Document Parser', () => {
  beforeEach(() => {
    mockPdfjs.numPages = 1;
    mockPdfjs.pageText = {};
    mockPdfjs.destroy.mockClear();
    mockPdfjs.requestedPages = [];
  });

  test.each([
    [
      'sample.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'This is a sample DOCX file.',
    ],
    [
      'sample.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '| Data | on | first | sheet |',
    ],
    ['sample.xls', 'application/vnd.ms-excel', '| Data | on | first | sheet |'],
    ['sample.ods', 'application/vnd.oasis.opendocument.spreadsheet', '## Second Sheet'],
    ['sample.odt', 'application/vnd.oasis.opendocument.text', 'It has two paragraphs.'],
  ])('routes %s through AnyDoc', async (name, mimetype, expectedText) => {
    const document = await parseDocument({ file: fixture(name, mimetype) });

    expect(document.filepath).toBe('anydoc');
    expect(document.filename).toBe(name);
    expect(document.text).toContain(expectedText);
    expect(document.bytes).toBe(Buffer.byteLength(document.text, 'utf8'));
  });

  test('routes PowerPoint through AnyDoc and preserves table structure', async () => {
    const document = await parseDocument({
      file: fixture(
        'deck.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ),
    });

    expect(document.filepath).toBe('anydoc');
    expect(document.text).toContain('Quarterly Highlights');
    expect(document.text).toContain('| Region |');
  });

  test('routes PDFs through the direct pdf-inspector adapter', async () => {
    const document = await parseDocument({ file: fixture('sample.pdf', 'application/pdf') });

    expect(document.filepath).toBe('pdf_inspector');
    expect(document.filename).toBe('sample.pdf');
    expect(document.text).toContain('# Quarterly Report');
    expect(document.text).toContain('|Region|Units|Revenue|');
    expect(document.pagesNeedingOcr).toBeUndefined();
  });

  test.each(['application/octet-stream', 'binary/octet-stream'])(
    'routes a PDF with generic MIME %s through the direct pdf-inspector adapter',
    async (mimetype) => {
      const document = await parseDocument({ file: fixture('sample.pdf', mimetype) });

      expect(document.filepath).toBe('pdf_inspector');
      expect(document.filename).toBe('sample.pdf');
      expect(document.text).toContain('# Quarterly Report');
    },
  );

  test('reports pages that still need OCR after local PDF extraction', async () => {
    const document = await parseDocument({
      file: fixture('sample-mixed.pdf', 'application/pdf'),
    });

    expect(document.filepath).toBe('pdf_inspector');
    expect(document.text).toContain('Quarterly Report');
    expect(document.pagesNeedingOcr).toEqual([2]);
  });

  test('recovers a page from its raw PDF text layer before requesting OCR', async () => {
    mockPdfjs.pageText = { 2: 'garbled but present ocr layer text' };

    const document = await parseDocument({
      file: fixture('sample-mixed.pdf', 'application/pdf'),
    });

    expect(document.text).toContain('garbled but present ocr layer text');
    expect(document.pagesNeedingOcr).toBeUndefined();
    expect(mockPdfjs.destroy).toHaveBeenCalled();
  });

  test('falls back to pdfjs when pdf-inspector rejects a damaged PDF', async () => {
    mockPdfjs.pageText = { 1: 'Quarterly Report' };

    const document = await parseDocument({
      file: fixture('sample-badxref.pdf', 'application/pdf'),
    });

    expect(document.filepath).toBe('pdf_inspector');
    expect(document.text).toBe('Quarterly Report\n');
    expect(mockPdfjs.destroy).toHaveBeenCalled();
  });

  test('throws when a fully scanned PDF has no local text', async () => {
    await expect(
      parseDocument({ file: fixture('sample-scanned.pdf', 'application/pdf') }),
    ).rejects.toThrow('No text found in document');
  });

  test('returns a provider-specific error for unsupported non-PDF input', async () => {
    const file = {
      ...fixture('nonexistent.file', 'application/invalid'),
      size: 0,
    } as Express.Multer.File;

    await expect(parseDocument({ file })).rejects.toThrow(
      'Unsupported file type in the anydoc parser',
    );
  });

  test('rejects files exceeding the shared local parser size limit', async () => {
    const file = {
      ...fixture(
        'sample.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
      size: 16 * 1024 * 1024,
    } as Express.Multer.File;

    await expect(parseDocument({ file })).rejects.toThrow(
      /exceeds the 15MB document parser limit \(16MB\)/,
    );
  });

  test('allows files exactly at the shared local parser size limit', async () => {
    const file = {
      ...fixture(
        'sample.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
      size: 15 * 1024 * 1024,
    } as Express.Multer.File;

    await expect(parseDocument({ file })).resolves.toEqual(
      expect.objectContaining({ filepath: 'anydoc' }),
    );
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
      const pages = Array.from({ length: 5000 }, (_, index) => index + 1);

      const annotated = annotateMissingPages('body', pages);

      expect(annotated).toContain('Pages 1, 2, 3');
      expect(annotated).toContain('20 and 4980 more');
      expect(annotated).not.toContain('21,');
      expect(annotated.length).toBeLessThan(300);
    });
  });
});
