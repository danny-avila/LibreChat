import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileSources } from 'librechat-data-provider';
import type { OCRContext } from '~/types';
import { uploadCustomOCR } from './custom';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-ocr-'));
const createdModules: string[] = [];

function writeModule(contents: string): string {
  const modulePath = path.join(tmpRoot, `ocr-${createdModules.length}-${Date.now()}.js`);
  fs.writeFileSync(modulePath, contents);
  createdModules.push(modulePath);
  return modulePath;
}

function buildContext(customStrategyModule?: string): OCRContext {
  return {
    req: {
      user: { id: 'user-1' },
      config: { ocr: { customStrategyModule } },
    },
    file: {
      originalname: 'invoice.pdf',
      path: '/tmp/invoice.pdf',
      mimetype: 'application/pdf',
    },
    loadAuthValues: jest.fn(async () => ({})),
  } as unknown as OCRContext;
}

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('uploadCustomOCR', () => {
  it('invokes a module exporting a handleFileUpload function and normalizes the result', async () => {
    const modulePath = writeModule(`
      module.exports.handleFileUpload = async ({ file }) => ({
        text: 'extracted ' + file.originalname,
        images: ['img1'],
      });
    `);

    const result = await uploadCustomOCR(buildContext(modulePath));

    expect(result.text).toBe('extracted invoice.pdf');
    expect(result.filename).toBe('invoice.pdf');
    expect(result.filepath).toBe(FileSources.custom_ocr);
    expect(result.images).toEqual(['img1']);
    expect(result.bytes).toBe(Buffer.byteLength('extracted invoice.pdf', 'utf8'));
  });

  it('supports a module that exports the handler as the module itself', async () => {
    const modulePath = writeModule(`
      module.exports = async () => ({ text: 'hello', filename: 'x.txt', bytes: 5, filepath: 'p', images: [] });
    `);

    const result = await uploadCustomOCR(buildContext(modulePath));

    expect(result).toEqual({
      text: 'hello',
      filename: 'x.txt',
      bytes: 5,
      filepath: 'p',
      images: [],
    });
  });

  it('resolves the module path from an environment variable placeholder', async () => {
    const modulePath = writeModule(`
      module.exports.handleFileUpload = async () => ({ text: 'from-env' });
    `);
    process.env.CUSTOM_OCR_TEST_MODULE = modulePath;

    const result = await uploadCustomOCR(buildContext('${CUSTOM_OCR_TEST_MODULE}'));

    expect(result.text).toBe('from-env');
    delete process.env.CUSTOM_OCR_TEST_MODULE;
  });

  it('throws when no module is configured', async () => {
    await expect(uploadCustomOCR(buildContext(undefined))).rejects.toThrow(
      /No custom OCR strategy module configured/,
    );
  });

  it('throws when the env placeholder cannot be resolved', async () => {
    await expect(uploadCustomOCR(buildContext('${UNRESOLVED_OCR_MODULE}'))).rejects.toThrow(
      /empty or unresolved/,
    );
  });

  it('throws when the module does not export a function', async () => {
    const modulePath = writeModule(`module.exports = { notAHandler: true };`);

    await expect(uploadCustomOCR(buildContext(modulePath))).rejects.toThrow(
      /must export a function/,
    );
  });

  it('throws when the handler result lacks a text string', async () => {
    const modulePath = writeModule(`
      module.exports.handleFileUpload = async () => ({ images: [] });
    `);

    await expect(uploadCustomOCR(buildContext(modulePath))).rejects.toThrow(
      /must resolve to an object containing a `text` string/,
    );
  });

  it('throws a descriptive error when the module cannot be loaded', async () => {
    const missingPath = path.join(tmpRoot, 'does-not-exist.js');

    await expect(uploadCustomOCR(buildContext(missingPath))).rejects.toThrow(
      /Failed to load custom OCR strategy module/,
    );
  });
});
