import { PassThrough, Readable } from 'stream';
import type { Response } from 'express';
import { getTextDownloadFilename, pipeDownloadStream } from './download';

describe('getTextDownloadFilename', () => {
  describe('renames when the extension promises something the text payload is not', () => {
    /** The OCR, STT, document-parser and configured-text paths all persist extracted text
     *  under the upload's original name. */
    test.each([
      ['report.pdf', 'report.txt'],
      ['meeting.mp3', 'meeting.txt'],
      ['notes.docx', 'notes.txt'],
      ['slides.pptx', 'slides.txt'],
      ['sheet.xlsx', 'sheet.txt'],
      ['scan.png', 'scan.txt'],
      ['bundle.zip', 'bundle.txt'],
      ['quarterly report.v2.pdf', 'quarterly report.v2.txt'],
      /** OCR reads images, STT reads audio; neither survives as its own bytes. */
      ['invoice.png', 'invoice.txt'],
      ['scan.HEIC', 'scan.txt'],
      ['standup.m4a', 'standup.txt'],
      ['manual.epub', 'manual.txt'],
      ['memo.rtf', 'memo.txt'],
    ])('%s -> %s', (filename, expected) => {
      expect(getTextDownloadFilename(filename)).toBe(expected);
    });
  });

  describe('keeps names that do not misrepresent text', () => {
    test.each([
      'notes.txt',
      'librechat.yaml',
      'config.toml',
      'settings.ini',
      'main.go',
      'app.ts',
      'App.tsx',
      'script.py',
      'notes.md',
      'data.json',
      'schema.proto',
      'deploy.sh',
      'query.sql',
      'style.css',
      /** `parseTextNative` stores a `.eml` as its own RFC 822 source, which is text. */
      'mail.eml',
      /** Uncatalogued extensions are far likelier to be text formats nobody listed than
       *  binaries, so they keep their name rather than being assumed binary. */
      'README.rst',
      'notes.adoc',
      'main.tf',
      'main.hcl',
      'default.nix',
      'events.jsonl',
      'init.vim',
      /** No extension promises nothing, so there is nothing to correct. */
      'Dockerfile',
      'Makefile',
      'README',
    ])('%s', (filename) => {
      expect(getTextDownloadFilename(filename)).toBe(filename);
    });
  });

  test('is case-insensitive about the extension', () => {
    expect(getTextDownloadFilename('REPORT.PDF')).toBe('REPORT.txt');
    expect(getTextDownloadFilename('NOTES.YAML')).toBe('NOTES.YAML');
  });

  test('passes an empty filename through untouched', () => {
    expect(getTextDownloadFilename('')).toBe('');
  });
});

describe('pipeDownloadStream', () => {
  const createResponse = () => {
    const headers = new Map<string, string>();
    const res = new PassThrough() as unknown as Response & {
      statusCode?: number;
      body?: string;
      destroyedWith?: Error;
    };
    res.headersSent = false;
    res.removeHeader = ((name: string) =>
      headers.delete(name.toLowerCase())) as Response['removeHeader'];
    res.setHeader = ((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
      return res;
    }) as Response['setHeader'];
    res.status = ((code: number) => {
      res.statusCode = code;
      return res;
    }) as Response['status'];
    res.send = ((body: string) => {
      res.body = body;
      return res;
    }) as Response['send'];
    res.destroy = ((error?: Error) => {
      res.destroyedWith = error;
      return res;
    }) as Response['destroy'];
    return { res, headers };
  };

  test('pipes a healthy stream through untouched', async () => {
    const { res } = createResponse();
    const chunks: Buffer[] = [];
    (res as unknown as PassThrough).on('data', (chunk: Buffer) => chunks.push(chunk));

    pipeDownloadStream(Readable.from(['file ', 'content']), res);
    await new Promise((resolve) => (res as unknown as PassThrough).on('end', resolve));

    expect(Buffer.concat(chunks).toString()).toBe('file content');
    expect(res.statusCode).toBeUndefined();
  });

  test('answers 500 and clears the abandoned download headers before any bytes', async () => {
    const { res, headers } = createResponse();
    res.setHeader('Content-Disposition', 'attachment; filename="plot.pdf"');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('X-File-Metadata', 'encoded');
    res.setHeader('X-Request-Id', 'keep-me');

    const stream = new Readable({
      read() {
        this.destroy(new Error('ENOENT: no such file or directory'));
      },
    });
    pipeDownloadStream(stream, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(500);
    expect(res.body).toBe('Error downloading file');
    expect(headers.has('content-disposition')).toBe(false);
    expect(headers.has('transfer-encoding')).toBe(false);
    expect(headers.has('content-encoding')).toBe(false);
    expect(headers.has('x-file-metadata')).toBe(false);
    /** Unrelated headers set by middleware are none of this helper's business. */
    expect(headers.get('x-request-id')).toBe('keep-me');
  });

  test('destroys the response once the body has started, rather than ending it cleanly', async () => {
    const { res } = createResponse();
    res.headersSent = true;

    const truncation = new Error('connection reset mid-transfer');
    const stream = new Readable({
      read() {
        this.destroy(truncation);
      },
    });
    pipeDownloadStream(stream, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.destroyedWith).toBe(truncation);
    expect(res.statusCode).toBeUndefined();
    expect(res.body).toBeUndefined();
  });
});
