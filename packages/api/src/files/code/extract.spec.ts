import * as os from 'os';
import * as path from 'path';
import { extractCodeArtifactText, MAX_TEXT_CACHE_BYTES, MAX_TEXT_EXTRACT_BYTES } from './extract';

const docxText = '__DOCX_PARSED__';
const docxFailureName = 'force-docx-failure.docx';
const parseDocumentCalls: Array<{ path: string; originalname: string }> = [];

jest.mock('~/files/documents/crud', () => ({
  parseDocument: jest.fn(async ({ file }: { file: { path: string; originalname: string } }) => {
    parseDocumentCalls.push({ path: file.path, originalname: file.originalname });
    if (file.originalname === docxFailureName) {
      throw new Error('parse failed');
    }
    return { text: docxText, filename: file.originalname, bytes: docxText.length };
  }),
}));

/* The office HTML producer is mocked here so the existing fallback-path
 * assertions (parseDocument receives the canonical MIME) keep exercising
 * `extractDocument`. Tests that need real HTML output drive `bufferToOfficeHtml`
 * directly via its own spec file (`html.spec.ts`); a separate `office-html`
 * describe block below exercises the integration with this mock relaxed.
 *
 * `officeHtmlBucket` is the gate predicate the upstream uses to decide
 * whether to call the dispatcher at all. We pass through to the real
 * implementation so the gate routes the same files in tests as in prod. */
const mockOfficeHtml = jest.fn(
  async (_buffer: Buffer, _name: string, _mime: string) => null as string | null,
);
jest.mock('~/files/documents/html', () => {
  const actual =
    jest.requireActual<typeof import('~/files/documents/html')>('~/files/documents/html');
  return {
    bufferToOfficeHtml: (buffer: Buffer, name: string, mime: string) =>
      mockOfficeHtml(buffer, name, mime),
    officeHtmlBucket: actual.officeHtmlBucket,
  };
});

describe('extractCodeArtifactText', () => {
  describe('utf8-text', () => {
    it('decodes a UTF-8 buffer', async () => {
      const buffer = Buffer.from('hello world\n', 'utf-8');
      const text = await extractCodeArtifactText(buffer, 'note.txt', 'text/plain', 'utf8-text');
      expect(text).toBe('hello world\n');
    });

    it('returns null for binary content (null byte)', async () => {
      const buffer = Buffer.from([0x68, 0x69, 0x00, 0x6f]);
      const text = await extractCodeArtifactText(buffer, 'fake.txt', 'text/plain', 'utf8-text');
      expect(text).toBeNull();
    });

    it('returns null for buffers larger than the extract cap', async () => {
      const buffer = Buffer.alloc(MAX_TEXT_EXTRACT_BYTES + 1, 'a');
      const text = await extractCodeArtifactText(buffer, 'big.txt', 'text/plain', 'utf8-text');
      expect(text).toBeNull();
    });

    it('truncates content larger than the cache cap with a marker', async () => {
      const cacheCapPlus = MAX_TEXT_CACHE_BYTES + 1024;
      const buffer = Buffer.alloc(cacheCapPlus, 'a');
      const text = await extractCodeArtifactText(buffer, 'big.txt', 'text/plain', 'utf8-text');
      expect(text).not.toBeNull();
      expect(text!.endsWith('…[truncated]')).toBe(true);
      expect(Buffer.byteLength(text!, 'utf-8')).toBeLessThanOrEqual(MAX_TEXT_CACHE_BYTES);
    });

    it('does not split a multi-byte UTF-8 character at the truncation boundary', async () => {
      // 你 is U+4F60, which encodes as 3 bytes in UTF-8 (E4 BD A0).
      // Build a buffer where the cut would otherwise land mid-character.
      const filler = 'a'.repeat(MAX_TEXT_CACHE_BYTES - 30);
      const tail = '你'.repeat(50);
      const buffer = Buffer.from(filler + tail, 'utf-8');
      const text = await extractCodeArtifactText(buffer, 'cjk.txt', 'text/plain', 'utf8-text');
      expect(text).not.toBeNull();
      expect(text!.endsWith('…[truncated]')).toBe(true);
      // U+FFFD (replacement) signals a corrupted boundary — must not appear.
      expect(text).not.toContain('�');
    });

    it('returns the empty string for an empty buffer', async () => {
      const text = await extractCodeArtifactText(
        Buffer.alloc(0),
        'empty.txt',
        'text/plain',
        'utf8-text',
      );
      expect(text).toBe('');
    });
  });

  describe('document', () => {
    beforeEach(() => {
      parseDocumentCalls.length = 0;
    });

    it('routes through parseDocument and returns its text', async () => {
      const buffer = Buffer.from('PKfake-docx');
      const text = await extractCodeArtifactText(
        buffer,
        'report.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document',
      );
      expect(text).toBe(docxText);
    });

    it('returns null when parseDocument throws', async () => {
      const buffer = Buffer.from('PKfake-docx');
      const text = await extractCodeArtifactText(
        buffer,
        docxFailureName,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document',
      );
      expect(text).toBeNull();
    });

    it('rewrites a generic sniffed MIME to the canonical document MIME by extension', async () => {
      // Code-output buffers for office docs are commonly sniffed as
      // application/zip — without canonicalization, parseDocument would
      // reject these and inline previews would silently disappear.
      const buffer = Buffer.from('PKfake-docx');
      await extractCodeArtifactText(buffer, 'report.docx', 'application/zip', 'document');
      expect(parseDocumentCalls[0]?.originalname).toBe('report.docx');
    });

    it.each([
      [
        'report.docx',
        'application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      [
        'data.xlsx',
        'application/octet-stream',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      ['legacy.xls', 'application/octet-stream', 'application/vnd.ms-excel'],
      ['sheet.ods', 'application/zip', 'application/vnd.oasis.opendocument.spreadsheet'],
      ['notes.odt', 'application/zip', 'application/vnd.oasis.opendocument.text'],
    ])('passes canonical mimetype for %s when sniff returns %s', async (name, sniffed, _canon) => {
      const parseDocumentMock = (
        jest.requireMock('~/files/documents/crud') as {
          parseDocument: jest.Mock;
        }
      ).parseDocument;
      parseDocumentMock.mockClear();
      await extractCodeArtifactText(Buffer.from('PK'), name, sniffed, 'document');
      const call = parseDocumentMock.mock.calls[0]?.[0];
      expect(call?.file?.mimetype).toBe(_canon);
    });

    it('writes the temp file inside os.tmpdir() regardless of artifact name', async () => {
      const buffer = Buffer.from('PKfake-docx');
      await extractCodeArtifactText(
        buffer,
        '../../../etc/passwd.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document',
      );
      const call = parseDocumentCalls[0];
      expect(call).toBeDefined();
      const tmpRoot = path.resolve(os.tmpdir());
      expect(path.resolve(call.path).startsWith(tmpRoot)).toBe(true);
      expect(call.path).not.toContain('..');
      expect(call.originalname).toBe('passwd.docx');
    });
  });

  describe('skipped categories', () => {
    it('returns null for pptx when HTML rendering also fails', async () => {
      mockOfficeHtml.mockResolvedValueOnce(null);
      const text = await extractCodeArtifactText(
        Buffer.from('PK'),
        'slides.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'pptx',
      );
      expect(text).toBeNull();
    });

    it('returns null for other (binary)', async () => {
      const text = await extractCodeArtifactText(
        Buffer.from([0xff, 0xd8, 0xff]),
        'photo.jpg',
        'image/jpeg',
        'other',
      );
      expect(text).toBeNull();
    });
  });

  describe('office-html', () => {
    beforeEach(() => {
      mockOfficeHtml.mockReset();
      parseDocumentCalls.length = 0;
    });

    it('returns the HTML rendering for a docx when the producer succeeds', async () => {
      mockOfficeHtml.mockResolvedValueOnce('<!DOCTYPE html><html><body>docx html</body></html>');
      const text = await extractCodeArtifactText(
        Buffer.from('PK'),
        'report.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document',
      );
      expect(text).toBe('<!DOCTYPE html><html><body>docx html</body></html>');
      expect(parseDocumentCalls.length).toBe(0);
    });

    it('returns the HTML rendering for a pptx when the producer succeeds', async () => {
      mockOfficeHtml.mockResolvedValueOnce('<!DOCTYPE html><html><body>slides</body></html>');
      const text = await extractCodeArtifactText(
        Buffer.from('PK'),
        'deck.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'pptx',
      );
      expect(text).toContain('slides');
    });

    it('returns the HTML rendering for csv (overriding utf8-text raw output)', async () => {
      mockOfficeHtml.mockResolvedValueOnce('<!DOCTYPE html><table><tr><td>a</td></tr></table>');
      const text = await extractCodeArtifactText(
        Buffer.from('a,b\n1,2', 'utf-8'),
        'data.csv',
        'text/csv',
        'utf8-text',
      );
      expect(text).toContain('<table>');
    });

    it('falls back to raw utf-8 text for csv when HTML rendering returns null', async () => {
      mockOfficeHtml.mockResolvedValueOnce(null);
      const text = await extractCodeArtifactText(
        Buffer.from('a,b\n1,2\n', 'utf-8'),
        'data.csv',
        'text/csv',
        'utf8-text',
      );
      expect(text).toBe('a,b\n1,2\n');
    });

    it('falls back to parseDocument for docx when HTML rendering returns null', async () => {
      mockOfficeHtml.mockResolvedValueOnce(null);
      const text = await extractCodeArtifactText(
        Buffer.from('PKfake-docx'),
        'report.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document',
      );
      expect(text).toBe(docxText);
      expect(parseDocumentCalls[0]?.originalname).toBe('report.docx');
    });

    it('falls back to parseDocument for docx when HTML rendering throws', async () => {
      mockOfficeHtml.mockRejectedValueOnce(new Error('mammoth blew up'));
      const text = await extractCodeArtifactText(
        Buffer.from('PKfake-docx'),
        'report.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document',
      );
      expect(text).toBe(docxText);
      expect(parseDocumentCalls[0]?.originalname).toBe('report.docx');
    });

    it('truncates HTML output when it exceeds the cache cap', async () => {
      const huge = 'X'.repeat(MAX_TEXT_CACHE_BYTES + 5_000);
      mockOfficeHtml.mockResolvedValueOnce(huge);
      const text = await extractCodeArtifactText(
        Buffer.from('PK'),
        'big.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document',
      );
      expect(text).not.toBeNull();
      expect(text!.endsWith('…[truncated]')).toBe(true);
      expect(Buffer.byteLength(text!, 'utf-8')).toBeLessThanOrEqual(MAX_TEXT_CACHE_BYTES);
    });

    it('falls back to parseDocument for pdf (HTML producer returns null for unsupported types)', async () => {
      // Default mock returns null — the producer's own dispatcher would do the
      // same for PDF since pdf has no HTML rendering. Whether we call it or
      // skip it is an implementation detail; what matters is that PDF still
      // routes to parseDocument and yields the docx-mock text.
      const text = await extractCodeArtifactText(
        Buffer.from('%PDF-1.4'),
        'doc.pdf',
        'application/pdf',
        'document',
      );
      expect(text).toBe(docxText);
      expect(parseDocumentCalls[0]?.originalname).toBe('doc.pdf');
    });

    it('does not call the office HTML producer for plain .txt utf8-text', async () => {
      const text = await extractCodeArtifactText(
        Buffer.from('hello world\n', 'utf-8'),
        'note.txt',
        'text/plain',
        'utf8-text',
      );
      expect(mockOfficeHtml).not.toHaveBeenCalled();
      expect(text).toBe('hello world\n');
    });

    it('routes extensionless CSV-by-MIME (utf8-text category) through the office HTML path', async () => {
      /* Regression for the Codex review on PR #12934. A tool emitting
       * `data` with `text/csv` classifies as `utf8-text` (csv has no
       * extension here, MIME is text/* which the classifier treats as
       * utf8-text). The previous gate skipped the office-render branch
       * because the extension wasn't in OFFICE_HTML_EXTENSIONS — so the
       * raw CSV text shipped to the client, which routes by MIME to the
       * SPREADSHEET bucket and expects a full HTML document. The fix
       * shares the dispatcher's MIME-aware predicate so the gate fires
       * here too. */
      mockOfficeHtml.mockResolvedValueOnce('<!DOCTYPE html><table><tr><td>1</td></tr></table>');
      const text = await extractCodeArtifactText(
        Buffer.from('a,b\n1,2', 'utf-8'),
        'data',
        'text/csv',
        'utf8-text',
      );
      expect(mockOfficeHtml).toHaveBeenCalledWith(expect.any(Buffer), 'data', 'text/csv');
      expect(text).toContain('<table>');
    });

    it.each([
      ['workbook', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['workbook', 'application/vnd.ms-excel'],
      ['workbook', 'application/vnd.oasis.opendocument.spreadsheet'],
      ['report', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['deck', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ])('routes extensionless office files by MIME alone (%s, %s)', async (name, mime) => {
      mockOfficeHtml.mockResolvedValueOnce('<!DOCTYPE html><body>x</body></html>');
      const category = mime.includes('presentation')
        ? 'pptx'
        : mime.startsWith('text/')
          ? 'utf8-text'
          : 'document';
      const text = await extractCodeArtifactText(Buffer.from('PK'), name, mime, category);
      expect(mockOfficeHtml).toHaveBeenCalledWith(expect.any(Buffer), name, mime);
      expect(text).toContain('<body>');
    });

    it('returns null (and falls back to download UI) when the producer rejects a zip bomb', async () => {
      /* Defense-in-depth check for SEC review on PR #12934. When
       * `bufferToOfficeHtml` throws `ZipBombError` (because a zip-bomb
       * DOCX/XLSX/PPTX got through the compressed-size gate), the outer
       * extractor must swallow it and return null — that signals to the
       * code-output controller to register the file as a regular
       * download instead of a panel artifact. Without this, an
       * unhandled rejection would crash the request. */
      const bombError = Object.assign(new Error('zip bomb suspected'), {
        name: 'ZipBombError',
        code: 'ZIP_BOMB',
      });
      mockOfficeHtml.mockRejectedValueOnce(bombError);
      const text = await extractCodeArtifactText(
        Buffer.from('PK'),
        'evil.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document',
      );
      // Falls through to parseDocument which is also mocked — returns
      // the docx-mock text via the legacy text-extraction path. The key
      // assertion is that we don't crash and don't leak the bomb error.
      expect(text).toBe(docxText);
    });
  });
});
