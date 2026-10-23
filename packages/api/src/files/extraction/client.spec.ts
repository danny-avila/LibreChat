import { createDocumentExtractor, ExtractionServiceError } from './client';
import { capabilities, fixture, reply, result } from './fixture.helper';

const bytes = Buffer.from('%PDF-exact bytes');

describe('document extraction Unix-socket client', () => {
  let server: Awaited<ReturnType<typeof fixture>> | undefined;
  beforeEach(() => {
    server = undefined;
  });
  afterEach(async () => server?.close());

  it.each(['pdf', 'docx'] as const)(
    'sends fixed raw-byte %s framing and preserves segments',
    async (format) => {
      const posts: Buffer[] = [];
      server = await fixture((req, res) => {
        if (req.url === '/v1/capabilities') return reply(res, capabilities);
        expect(req.method).toBe('POST');
        expect(req.url).toBe('/v1/extract-text');
        expect(req.headers['content-type']).toBe('application/octet-stream');
        expect(req.headers['content-length']).toBe(String(bytes.length));
        expect(req.headers['transfer-encoding']).toBeUndefined();
        expect(req.headers['x-extraction-version']).toBe('1');
        expect(req.headers['x-extraction-format']).toBe(format);
        req.on('data', (chunk: Buffer) => posts.push(chunk));
        req.on('end', () => reply(res, result(Buffer.concat(posts), format)));
      });
      const client = createDocumentExtractor({ enabled: true, socketPath: server.socketPath })!;
      await expect(client.extract(bytes, format)).resolves.toEqual(result(bytes, format));
      expect(Buffer.concat(posts)).toEqual(bytes);
    },
  );

  it('snapshots mutable input before negotiating capabilities', async () => {
    const input = Buffer.from(bytes);
    server = await fixture((req, res) => {
      if (req.url === '/v1/capabilities') {
        input.fill(0);
        return reply(res, capabilities);
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => reply(res, result(Buffer.concat(chunks))));
    });
    await expect(
      createDocumentExtractor({ enabled: true, socketPath: server.socketPath })!.extract(
        input,
        'pdf',
      ),
    ).resolves.toEqual(result(bytes));
  });

  it.each([
    { ...capabilities, version: 2 },
    { ...capabilities, operation: 'exec' },
    { ...capabilities, formats: ['pdf'] },
    { ...capabilities, structure: null },
    { ...capabilities, limitations: { pdf: '', docx: 'body' } },
    { ...capabilities, limits: { ...capabilities.limits, inputBytes: 10485761 } },
    { ...capabilities, limits: { ...capabilities.limits, concurrency: 0 } },
  ])('rejects incompatible capabilities before upload: %j', async (caps) => {
    let posts = 0;
    server = await fixture((req, res) => {
      if (req.method === 'POST') posts++;
      reply(res, caps);
    });
    await expect(
      createDocumentExtractor({ enabled: true, socketPath: server.socketPath })!.extract(
        bytes,
        'pdf',
      ),
    ).rejects.toMatchObject({ code: 'INCOMPATIBLE_SERVICE' });
    expect(posts).toBe(0);
  });

  it.each([
    ['BUSY', 429],
    ['UNSUPPORTED_CONTENT', 422],
    ['UNAVAILABLE', 503],
    ['DEADLINE', 504],
    ['INPUT_LIMIT', 413],
    ['INVALID_REQUEST', 400],
  ] as const)('exposes only approved %s errors without retries', async (code, status) => {
    let posts = 0;
    server = await fixture((req, res) => {
      if (req.method === 'GET') return reply(res, capabilities);
      posts++;
      req.resume();
      reply(res, { error: { code } }, status);
    });
    await expect(
      createDocumentExtractor({ enabled: true, socketPath: server.socketPath })!.extract(
        bytes,
        'pdf',
      ),
    ).rejects.toMatchObject({ code });
    expect(posts).toBe(1);
  });

  const valid = result(bytes);
  it.each([
    { ...valid, inputSha256: '0'.repeat(64) },
    { ...valid, version: 2 },
    { ...valid, operation: 'exec' },
    { ...valid, format: 'docx' },
    { ...valid, path: '/secret' },
    { ...valid, textBytes: 3 },
    { ...valid, textBytes: 0, segments: [] },
    { ...valid, segments: [{ ...valid.segments[0], index: 0 }] },
    { ...valid, segments: [{ ...valid.segments[0], kind: 'document' }] },
    { ...valid, segments: [{ ...valid.segments[0], text: '\ud800' }] },
    { ...valid, segments: [{ ...valid.segments[0], text: '\udc00' }] },
    { ...valid, segments: [{ ...valid.segments[0], extra: true }] },
    Buffer.from([0xff]),
    Buffer.from('{'),
  ])('rejects malformed or unbound results: %j', async (value) => {
    server = await fixture((req, res) => {
      req.resume();
      reply(res, req.method === 'GET' ? capabilities : value);
    });
    await expect(
      createDocumentExtractor({ enabled: true, socketPath: server.socketPath })!.extract(
        bytes,
        'pdf',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it.each([{ maxTextBytes: 6 }, { maxResponseBytes: 32 }, { maxSegments: 1 }])(
    'enforces lowered client output limits %j',
    async (limits) => {
      const value = {
        ...valid,
        textBytes: 14,
        segments: [valid.segments[0], { ...valid.segments[0], index: 2 }],
      };
      server = await fixture((req, res) => {
        req.resume();
        reply(res, req.method === 'GET' ? capabilities : value);
      });
      await expect(
        createDocumentExtractor({
          enabled: true,
          socketPath: server.socketPath,
          ...limits,
        })!.extract(bytes, 'pdf'),
      ).rejects.toBeInstanceOf(ExtractionServiceError);
    },
  );

  it('rejects DOCX multi-segment output', async () => {
    const value = result(bytes, 'docx');
    value.segments.push({ ...value.segments[0], index: 2 });
    server = await fixture((req, res) => {
      req.resume();
      reply(res, req.method === 'GET' ? capabilities : value);
    });
    await expect(
      createDocumentExtractor({ enabled: true, socketPath: server.socketPath })!.extract(
        bytes,
        'docx',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects empty/oversized inputs and unsupported format before connecting', async () => {
    const client = createDocumentExtractor({ enabled: true, maxInputBytes: 2 })!;
    await expect(client.extract(Buffer.alloc(0), 'pdf')).rejects.toMatchObject({
      code: 'INPUT_LIMIT',
    });
    await expect(client.extract(bytes, 'pdf')).rejects.toMatchObject({ code: 'INPUT_LIMIT' });
    await expect(client.extract(Buffer.from('x'), 'odt' as 'pdf')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
  });

  it.each(['capabilities', 'upload', 'delivery'])(
    'bounds the full %s stage with a deadline',
    async (stage) => {
      server = await fixture((req, res) => {
        if (req.method === 'GET') {
          if (stage !== 'capabilities') reply(res, capabilities);
          return;
        }
        if (stage === 'upload') return req.pause();
        req.resume();
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': 1000,
        });
        res.write('{');
      });
      await expect(
        createDocumentExtractor({
          enabled: true,
          socketPath: server.socketPath,
          deadlineMs: 100,
        })!.extract(Buffer.alloc(stage === 'upload' ? 10485760 : 1, 1), 'pdf'),
      ).rejects.toMatchObject({ code: 'DEADLINE' });
    },
  );

  it.each(['capabilities', 'upload', 'delivery'])(
    'cancels during %s without retry',
    async (stage) => {
      const controller = new AbortController();
      server = await fixture((req, res) => {
        if (req.method === 'GET') {
          if (stage === 'capabilities') controller.abort();
          else reply(res, capabilities);
          return;
        }
        if (stage === 'delivery') {
          req.resume();
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': 1000,
          });
          res.write('{');
        }
        controller.abort();
      });
      await expect(
        createDocumentExtractor({ enabled: true, socketPath: server.socketPath })!.extract(
          Buffer.alloc(stage === 'upload' ? 10485760 : 1, 1),
          'pdf',
          controller.signal,
        ),
      ).rejects.toMatchObject({ code: 'CANCELLED' });
    },
  );

  it('never forwards arbitrary provider details', async () => {
    server = await fixture((req, res) => {
      req.resume();
      reply(
        res,
        req.method === 'GET' ? capabilities : { error: { code: 'SECRET-content' } },
        req.method === 'GET' ? 200 : 500,
      );
    });
    await expect(
      createDocumentExtractor({ enabled: true, socketPath: server.socketPath })!.extract(
        bytes,
        'pdf',
      ),
    ).rejects.toThrow('Document extraction failed (INVALID_RESPONSE).');
  });
});
