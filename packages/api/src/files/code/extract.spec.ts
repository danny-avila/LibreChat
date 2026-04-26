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
    it('returns null for pptx', async () => {
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
});
