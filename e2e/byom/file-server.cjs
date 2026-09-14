const http = require('node:http');
const { randomUUID } = require('node:crypto');

const port = Number(process.env.BYOM_FILE_SERVER_PORT);
const internalToken = process.env.CODEAPI_INTERNAL_SERVICE_TOKEN;
const ioredisPath = process.env.BYOM_IOREDIS_PATH;
if (!Number.isSafeInteger(port) || port < 1 || !internalToken || !ioredisPath) {
  throw new Error(
    'BYOM_FILE_SERVER_PORT, BYOM_IOREDIS_PATH, and CODEAPI_INTERNAL_SERVICE_TOKEN are required',
  );
}
const IORedis = require(ioredisPath);
const redis = new IORedis({
  host: '127.0.0.1',
  port: Number(process.env.REDIS_PORT),
  maxRetriesPerRequest: 3,
});

/** @type {Map<string, Map<string, { body: Buffer, name: string, type: string, readOnly: boolean, version: string, modified: Date }>>} */
const sessions = new Map();

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': String(body.length),
  });
  res.end(body);
}

function object(sessionId, objectId) {
  return sessions.get(sessionId)?.get(objectId);
}

function decodeHeader(value) {
  if (typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { status: 'ok' });
  }
  if (req.headers['x-codeapi-internal-token'] !== internalToken) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const match = /^\/sessions\/([^/]+)\/objects(?:\/([^/]+))?(?:\/(metadata))?$/.exec(url.pathname);
  if (!match) return json(res, 404, { error: 'Not found' });
  const sessionId = decodeURIComponent(match[1]);
  const objectId = match[2] ? decodeURIComponent(match[2]) : undefined;

  if (req.method === 'PUT' && objectId && !match[3]) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const value = {
      body: Buffer.concat(chunks),
      name: decodeHeader(req.headers['x-original-filename']),
      type: req.headers['content-type'] ?? 'application/octet-stream',
      readOnly: String(req.headers['x-read-only']).toLowerCase() === 'true',
      version: randomUUID(),
      modified: new Date(),
    };
    let contents = sessions.get(sessionId);
    if (!contents) sessions.set(sessionId, (contents = new Map()));
    contents.set(objectId, value);
    const sessionKey = await redis.get(`session:${sessionId}`);
    if (!sessionKey) {
      contents.delete(objectId);
      return json(res, 409, { error: 'Upload session is not registered' });
    }
    await redis.set(`upload:${sessionKey}${sessionId}${objectId}`, 'true', 'EX', 3600);
    return json(res, 200, { filename: value.name, fileId: objectId });
  }

  if (req.method === 'GET' && !objectId && url.searchParams.get('detail') === 'normalized') {
    const contents = sessions.get(sessionId) ?? new Map();
    return json(
      res,
      200,
      [...contents].map(([id, value]) => ({
        id,
        name: value.name,
        storage_session_id: sessionId,
        size: value.body.length,
        contentType: value.type,
        lastModified: value.modified,
        ...(value.readOnly ? { read_only: true } : {}),
      })),
    );
  }

  const value = objectId ? object(sessionId, objectId) : undefined;
  if (!value) return json(res, 404, { error: 'File not found' });

  if (req.method === 'GET' && match[3] === 'metadata') {
    return json(res, 200, {
      name: objectId,
      version: value.version,
      originalFilename: value.name,
      size: value.body.length,
      lastModified: value.modified,
      contentType: value.type,
      readOnly: value.readOnly,
    });
  }
  if (req.method === 'GET' && !match[3]) {
    res.writeHead(200, {
      'content-type': value.type,
      'content-length': String(value.body.length),
      'content-disposition': `attachment; filename="${value.name.replace(/["\\]/g, '_')}"`,
      'x-amz-meta-codeapi-version': value.version,
      'x-amz-meta-original-filename': Buffer.from(value.name).toString('base64'),
      'x-amz-meta-original-filename-encoded': 'base64',
      ...(value.readOnly ? { 'x-amz-meta-read-only': 'true' } : {}),
    });
    return res.end(value.body);
  }
  if (req.method === 'DELETE' && !match[3]) {
    sessions.get(sessionId)?.delete(objectId);
    return json(res, 200, {
      message: 'File deleted successfully',
      session_id: sessionId,
      fileId: objectId,
    });
  }
  return json(res, 405, { error: 'Method not allowed' });
});

server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => void redis.quit().then(() => process.exit(0))));
}
