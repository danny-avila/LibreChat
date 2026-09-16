jest.mock('@librechat/api', () => ({ deleteRagFile: jest.fn() }));
jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

const mockTmpBase = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'local-cache-bust-'),
);

jest.mock('~/config/paths', () => {
  const path = require('path');
  return {
    publicPath: path.join(mockTmpBase, 'public'),
    uploads: path.join(mockTmpBase, 'uploads'),
    imageOutput: path.join(mockTmpBase, 'public', 'images'),
  };
});

const fs = require('fs');
const path = require('path');
const { stripCacheBust } = require('../paths');
const { getLocalFileStream } = require('../crud');

const imageOutput = path.join(mockTmpBase, 'public', 'images');
const uploads = path.join(mockTmpBase, 'uploads');

const makeReq = () => ({
  user: { id: 'user-1' },
  config: { paths: { publicPath: path.join(mockTmpBase, 'public'), uploads, imageOutput } },
});

const readStream = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });

describe('stripCacheBust', () => {
  it('removes a cache-busting query string', () => {
    expect(stripCacheBust('/images/user-1/chart.png?v=1789460622697')).toBe(
      '/images/user-1/chart.png',
    );
  });

  it('removes everything from the first question mark onward', () => {
    expect(stripCacheBust('/uploads/user-1/doc.pdf?manual=true&v=2')).toBe(
      '/uploads/user-1/doc.pdf',
    );
  });

  it('leaves a filepath without a query string untouched', () => {
    expect(stripCacheBust('/images/user-1/chart.png')).toBe('/images/user-1/chart.png');
  });

  it('passes through non-string input', () => {
    expect(stripCacheBust(undefined)).toBeUndefined();
  });
});

describe('getLocalFileStream cache-busted filepaths', () => {
  beforeAll(() => {
    fs.mkdirSync(path.join(imageOutput, 'user-1'), { recursive: true });
    fs.mkdirSync(path.join(uploads, 'user-1'), { recursive: true });
    fs.writeFileSync(path.join(imageOutput, 'user-1', 'chart.png'), 'image-bytes');
    fs.writeFileSync(path.join(uploads, 'user-1', 'doc.pdf'), 'upload-bytes');
  });

  afterAll(() => {
    fs.rmSync(mockTmpBase, { recursive: true, force: true });
  });

  it('streams a reused code-output image whose filepath carries `?v=`', async () => {
    const stream = await getLocalFileStream(makeReq(), '/images/user-1/chart.png?v=1789460622697');

    await expect(readStream(stream)).resolves.toBe('image-bytes');
  });

  it('streams an upload whose filepath carries a query string', async () => {
    const stream = await getLocalFileStream(makeReq(), '/uploads/user-1/doc.pdf?manual=true');

    await expect(readStream(stream)).resolves.toBe('upload-bytes');
  });

  it('still streams a filepath without a query string', async () => {
    const stream = await getLocalFileStream(makeReq(), '/images/user-1/chart.png');

    await expect(readStream(stream)).resolves.toBe('image-bytes');
  });

  it('still rejects traversal hidden behind a query string', async () => {
    await expect(getLocalFileStream(makeReq(), '/images/../../../etc/passwd?v=1')).rejects.toThrow(
      'Invalid file path',
    );
  });
});
