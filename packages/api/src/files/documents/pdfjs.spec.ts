import { extractDocumentTextWithPages, extractPageText } from './pdfjs';

const mockGetDocument = jest.fn();

jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
}));

describe('pdfjs cancellation', () => {
  beforeEach(() => {
    mockGetDocument.mockReset();
  });

  test.each([
    [
      'page recovery',
      (signal: AbortSignal) => extractPageText(Buffer.alloc(0), [0], undefined, signal),
    ],
    [
      'whole-document extraction',
      (signal: AbortSignal) =>
        extractDocumentTextWithPages(Buffer.alloc(0), undefined, undefined, signal),
    ],
  ])('stops %s when cancellation occurs during module loading', async (_label, extract) => {
    const cancellation = new AbortController();

    const extraction = extract(cancellation.signal);
    cancellation.abort();

    await expect(extraction).rejects.toMatchObject({ code: 'PARSE_ABORTED' });
    expect(mockGetDocument).not.toHaveBeenCalled();
  });
});
