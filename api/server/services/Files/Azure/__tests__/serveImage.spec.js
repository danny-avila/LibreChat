const { Readable, PassThrough } = require('stream');

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  deleteRagFile: jest.fn(),
  getAzureContainerClient: jest.fn(),
  assertRemoteFileURL: jest.fn(),
  getRemoteFileFetchMaxBytes: jest.fn(),
  getRemoteFileFetchTimeoutMs: jest.fn(),
  assertRemoteFileContentLength: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));
jest.mock('~/server/utils/getFileStrategy', () => ({ getFileStrategy: jest.fn() }));

const { FileSources } = require('librechat-data-provider');
const { createAzureBlobImageHandler } = require('../serveImage');

function makeRes() {
  const res = new PassThrough();
  res.headers = {};
  res.setHeader = jest.fn((name, value) => {
    res.headers[name] = value;
  });
  res.status = jest.fn(() => res);
  const end = res.end.bind(res);
  res.end = jest.fn((...args) => end(...args));
  return res;
}

function setup({ publicAccess = false, strategy = FileSources.azure_blob, download } = {}) {
  const blobClient = { download: jest.fn(download) };
  const containerClient = { getBlobClient: jest.fn(() => blobClient) };
  const deps = {
    isPublicAccess: () => publicAccess,
    getAppConfig: jest.fn(async () => ({ fileStrategy: strategy })),
    getFileStrategy: jest.fn((appConfig) => appConfig.fileStrategy),
    getAzureContainerClient: jest.fn(async () => containerClient),
  };
  return { handler: createAzureBlobImageHandler(deps), deps, containerClient, blobClient };
}

describe('createAzureBlobImageHandler', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AZURE_CONTAINER_NAME = 'ai-chat-uploads';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('streams a private blob under /images/{ownerId}/{filename} with private cache headers', async () => {
    const body = Readable.from([Buffer.from('png-bytes')]);
    const { handler, deps, containerClient } = setup({
      download: async () => ({
        readableStreamBody: body,
        contentType: 'image/png',
        contentLength: 9,
      }),
    });
    const res = makeRes();
    const next = jest.fn();
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve) => res.on('end', resolve));

    await handler({ method: 'GET', path: '/0123456789abcdef01234567/img.png' }, res, next);
    await finished;

    expect(next).not.toHaveBeenCalled();
    expect(deps.getAzureContainerClient).toHaveBeenCalledWith('ai-chat-uploads');
    expect(containerClient.getBlobClient).toHaveBeenCalledWith(
      'images/0123456789abcdef01234567/img.png',
    );
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['Content-Length']).toBe('9');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(Buffer.concat(chunks).toString()).toBe('png-bytes');
  });

  it('falls back to the extension when the blob has no content type', async () => {
    const { handler } = setup({
      download: async () => ({ readableStreamBody: Readable.from([Buffer.from('x')]) }),
    });
    const res = makeRes();

    await handler({ method: 'GET', path: '/user1/photo.webp' }, res, jest.fn());

    expect(res.headers['Content-Type']).toBe('image/webp');
  });

  it('passes through when the container is public', async () => {
    const { handler, deps } = setup({ publicAccess: true });
    const next = jest.fn();

    await handler({ method: 'GET', path: '/user1/img.png' }, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(deps.getAppConfig).not.toHaveBeenCalled();
  });

  it('passes through when images are not stored with the azure_blob strategy', async () => {
    const { handler, deps } = setup({ strategy: FileSources.local });
    const next = jest.fn();

    await handler({ method: 'GET', path: '/user1/img.png' }, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(deps.getAzureContainerClient).not.toHaveBeenCalled();
  });

  it('passes through when the blob does not exist', async () => {
    const { handler } = setup({
      download: async () => {
        throw Object.assign(new Error('BlobNotFound'), { statusCode: 404 });
      },
    });
    const next = jest.fn();

    await handler({ method: 'GET', path: '/user1/missing.png' }, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('forwards other storage errors to the error handler', async () => {
    const error = Object.assign(new Error('AuthorizationFailure'), { statusCode: 403 });
    const { handler } = setup({
      download: async () => {
        throw error;
      },
    });
    const next = jest.fn();

    await handler({ method: 'GET', path: '/user1/img.png' }, makeRes(), next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it.each([
    ['nested path', '/user1/sub/img.png'],
    ['traversal', '/../img.png'],
    ['encoded traversal', '/user1/%2e%2e'],
    ['missing filename', '/user1'],
  ])('passes through malformed image paths (%s)', async (_label, path) => {
    const { handler, deps } = setup();
    const next = jest.fn();

    await handler({ method: 'GET', path }, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(deps.getAzureContainerClient).not.toHaveBeenCalled();
  });

  it('ignores non-GET requests', async () => {
    const { handler, deps } = setup();
    const next = jest.fn();

    await handler({ method: 'POST', path: '/user1/img.png' }, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(deps.getAppConfig).not.toHaveBeenCalled();
  });
});
