const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { Readable } = require('node:stream');
const { gzipSync } = require('node:zlib');
const axios = require('axios');
const multer = require('multer');
const { z } = require('zod');
const { resolveMediaConfig } = require('librechat-data-provider');
const {
  createMediaStaging,
  createMediaTransport,
  createMediaStrategyObjectStores,
  MediaByteCounter,
} = require('@librechat/api');

// These diagnostics assert the audited defects. Exit 0 does not mean those defects are fixed.
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label) {
  const deadline = Date.now() + 4000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await pause(10);
  }
}
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

async function stagingAbort() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'media-storage-audit-'));
  const originalCreateWriteStream = fs.createWriteStream;
  const writes = [];
  fs.createWriteStream = (...args) => {
    const stream = originalCreateWriteStream(...args);
    if (path.resolve(String(args[0])).startsWith(`${root}${path.sep}`)) writes.push(stream);
    return stream;
  };
  let storageCallbacks = 0;
  let middlewareError;
  let incoming;
  const storage = createMediaStaging({ directory: root, id: () => 'aborted-upload' })
    .storage(resolveMediaConfig());
  const observedStorage = {
    ...storage,
    _handleFile(req, file, callback) {
      incoming = file.stream;
      storage._handleFile(req, file, (...args) => {
        storageCallbacks++;
        callback(...args);
      });
    },
  };
  const receive = multer({ storage: observedStorage }).single('file');
  const server = http.createServer((req, res) => receive(req, res, (error) => {
    middlewareError = error;
    if (!res.destroyed) res.end(error ? 'failed' : 'ok');
  }));
  let request;
  try {
    const port = await listen(server);
    request = http.request({
      host: '127.0.0.1', port, method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=audit-boundary' },
    });
    request.on('error', () => undefined);
    request.write('--audit-boundary\r\nContent-Disposition: form-data; name="file"; filename="audit.png"\r\nContent-Type: image/png\r\n\r\n');
    request.write(Buffer.alloc(65_536, 1));
    await until(async () => (await fsp.stat(path.join(root, 'aborted-upload')).catch(() => null))?.size === 65_536, 'staged bytes');
    request.destroy();
    await until(() => middlewareError, 'Multer abort');
    await pause(100);
    const file = await fsp.stat(path.join(root, 'aborted-upload'));
    const result = {
      scenario: 'real multipart client disconnect after 64 KiB',
      middlewareError: middlewareError.message,
      sourceDestroyed: incoming.destroyed,
      storageCallbacks,
      stagedBytesRemaining: file.size,
      stagedWriteCount: writes.length,
      stagedWriteDestroyed: writes[0]?.destroyed,
      stagedWriteFinished: writes[0]?.writableFinished,
      openFileDescriptor: typeof writes[0]?.fd === 'number',
    };
    assert.equal(result.sourceDestroyed, true);
    assert.equal(result.storageCallbacks, 0);
    assert.equal(result.stagedBytesRemaining, 65_536);
    assert.equal(result.stagedWriteCount, 1);
    assert.equal(result.stagedWriteDestroyed, false);
    assert.equal(result.stagedWriteFinished, false);
    assert.equal(result.openFileDescriptor, true);
    const complete = createMediaStaging({ directory: root, id: () => 'completed-upload' })
      .storage(resolveMediaConfig());
    const completed = await new Promise((resolve, reject) => complete._handleFile({}, {
      mimetype: 'image/png', stream: Readable.from([Buffer.alloc(64)]),
    }, (error, info) => error ? reject(error) : resolve(info)));
    assert.equal(completed.size, 64);
    await new Promise((resolve, reject) => complete._removeFile({}, completed, (error) => error ? reject(error) : resolve()));
    assert.equal(await fsp.stat(completed.path).catch(() => null), null);
    const overLimit = createMediaStaging({ directory: root, id: () => 'oversize-upload' })
      .storage(resolveMediaConfig({ transfers: { maxImageBytes: 1024 } }));
    await assert.rejects(new Promise((resolve, reject) => overLimit._handleFile({}, {
      mimetype: 'image/png', stream: Readable.from([Buffer.alloc(2048)]),
    }, (error, info) => error ? reject(error) : resolve(info))), { status: 413 });
    assert.equal(await fsp.stat(path.join(root, 'oversize-upload')).catch(() => null), null);
    result.completedUploadRemoved = true;
    result.oversizeUploadRejectedAndRemoved = true;
    return result;
  } finally {
    request?.destroy();
    for (const stream of writes) {
      if (stream.closed) continue;
      const closed = once(stream, 'close');
      stream.destroy();
      await closed;
    }
    fs.createWriteStream = originalCreateWriteStream;
    await close(server);
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('media-storage-audit-'));
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function transportLimits() {
  const plain = Buffer.alloc(4096, 97);
  const compressed = gzipSync(plain);
  const server = http.createServer((req, res) => {
    if (req.url === '/declared') {
      res.writeHead(200, { 'Content-Length': plain.length });
      res.end(plain);
    } else if (req.url === '/gzip') {
      res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': compressed.length });
      res.end(compressed);
    } else {
      res.writeHead(200, { 'Transfer-Encoding': 'chunked' });
      res.write(plain.subarray(0, 1024));
      res.end(plain.subarray(1024));
    }
  });
  try {
    const port = await listen(server);
    const transport = createMediaTransport({
      http: axios.create({ proxy: false }),
      allowedAddresses: [`127.0.0.1:${port}`],
    });
    const request = (route) => ({
      url: `http://127.0.0.1:${port}/${route}`, timeoutMs: 1000, maxBytes: 1024,
    });
    const rejected = {};
    for (const route of ['chunked', 'gzip']) {
      let bytes = 0;
      let failure;
      try {
        for await (const chunk of await transport.stream(request(route))) bytes += chunk.length;
      } catch (error) {
        failure = error;
      }
      assert.equal(failure?.code, 'ERR_BAD_RESPONSE');
      assert.equal(failure?.message, 'maxContentLength size of 1024 exceeded');
      assert.ok(bytes <= 1024);
      rejected[route] = { receivedBytes: bytes, code: failure.code, message: failure.message };
    }
    await assert.rejects(transport.stream(request('declared')), { status: 413 });
    await assert.rejects(transport.json(request('chunked'), z.string()));
    const counter = new MediaByteCounter(1024);
    const source = await transport.stream({ ...request('chunked'), maxBytes: 8192 });
    source.pipe(counter);
    await assert.rejects(async () => {
      for await (const _ of counter) { /* drain the real publication limit */ }
    }, { status: 413 });
    source.destroy();
    return {
      scenario: 'actual Axios streaming responses',
      maxBytes: 1024,
      rejected,
      compressedContentLength: compressed.length,
      declaredOversizeRejected: true,
      jsonBodyLimitRejected: true,
      publicationByteCounterRejected: true,
    };
  } finally {
    await close(server);
  }
}

async function cloudRanges() {
  const size = 8 * 1024 * 1024;
  const requested = { start: size - 32, end: size - 1 };
  const results = [];
  for (const source of ['s3', 'cloudfront', 'azure_blob', 'firebase']) {
    let downloaded = 0;
    let passedOptions;
    let raw;
    const strategy = {
      async getDownloadStream(_req, _path, options) {
        passedOptions = options;
        raw = Readable.from((async function* () {
          for (let offset = 0; offset < size; offset += 65_536) {
            downloaded += 65_536;
            yield Buffer.alloc(65_536, 7);
          }
        })());
        return raw;
      },
    };
    const store = createMediaStrategyObjectStores(() => strategy).find((entry) => entry.source === source);
    const abort = new AbortController();
    let delivered = 0;
    const sliced = await store.open({ ownerId: 'audit-owner', tenantId: null }, {
      source, storageKey: 'images/audit-owner/video.mp4', filepath: 'https://objects.test/video.mp4',
    }, { range: requested, signal: abort.signal });
    for await (const chunk of sliced) delivered += chunk.length;
    assert.equal(delivered, 32);
    assert.equal(downloaded, size);
    assert.equal(passedOptions.range, undefined);
    assert.equal(passedOptions.signal, abort.signal);
    assert.equal(raw.destroyed, true);
    results.push({ source, delivered, downloaded, requestedRangePassedToStrategy: false, underlyingStreamClosed: true });
  }
  return { scenario: 'tail range against existing cloud strategy adapter', results };
}

(async () => {
  const results = [];
  results.push(await stagingAbort());
  results.push(await transportLimits());
  results.push(await cloudRanges());
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
