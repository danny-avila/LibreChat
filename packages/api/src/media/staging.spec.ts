import fs from 'node:fs';
import multer from 'multer';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { resolveMediaConfig } from 'librechat-data-provider';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import type { WriteStream } from 'node:fs';
import { createMediaStaging } from './staging';

async function eventually(check: () => Promise<boolean> | boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The upload did not settle.');
}

describe('media upload staging', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'librechat-staging-'));
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('settles an interrupted multipart upload once, closes its file and removes partial bytes', async () => {
    const writes: WriteStream[] = [];
    const createWriteStream = fs.createWriteStream;
    jest.spyOn(fs, 'createWriteStream').mockImplementation((...args) => {
      const stream = createWriteStream(...args);
      writes.push(stream);
      return stream;
    });
    const storage = createMediaStaging({ directory, id: () => 'interrupted' }).storage(
      resolveMediaConfig(),
    );
    let callbacks = 0;
    let failed = false;
    const app = express();
    app.post('/', (req, res) =>
      multer({
        storage: {
          ...storage,
          _handleFile(incoming, file, callback) {
            storage._handleFile(incoming, file, (error, info) => {
              callbacks++;
              callback(error, info);
            });
          },
        },
      }).single('file')(req, res, (error) => {
        failed = !!error;
        if (!res.destroyed) res.sendStatus(error ? 400 : 204);
      }),
    );
    const server = createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    const client = httpRequest({
      host: '127.0.0.1',
      port: address.port,
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=staging-test' },
    });
    client.on('error', () => undefined);
    try {
      client.write(
        '--staging-test\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n',
      );
      client.write(Buffer.alloc(65_536));
      await eventually(
        async () =>
          (await stat(path.join(directory, 'interrupted')).catch(() => null))?.size === 65_536,
      );
      client.destroy();
      await eventually(
        async () => callbacks === 1 && failed && (await readdir(directory)).length === 0,
      );
      expect(writes).toHaveLength(1);
      expect(writes[0].closed).toBe(true);
      expect(writes[0].destroyed).toBe(true);
      expect(callbacks).toBe(1);
    } finally {
      client.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('keeps completed files until removal and discards oversized uploads', async () => {
    let id = 0;
    const storage = createMediaStaging({ directory, id: () => `upload-${++id}` }).storage(
      resolveMediaConfig({ transfers: { maxImageBytes: 1024 } }),
    );
    const app = express();
    app.post('/', (req, res) =>
      multer({ storage }).single('file')(req, res, (error) => {
        if (error) {
          res.sendStatus(413);
          return;
        }
        res.json({ size: req.file?.size });
      }),
    );
    await request(app)
      .post('/')
      .attach('file', Buffer.alloc(64), 'image.png')
      .expect(200, { size: 64 });
    await request(app).post('/').attach('file', Buffer.alloc(2048), 'image.png').expect(413);
    expect(await readdir(directory)).toEqual(['upload-1']);
  });

  it('does not delete an existing file when exclusive creation fails', async () => {
    await writeFile(path.join(directory, 'existing'), 'preserved');
    const storage = createMediaStaging({ directory, id: () => 'existing' }).storage(
      resolveMediaConfig(),
    );
    const app = express();
    app.post('/', (req, res) =>
      multer({ storage }).single('file')(req, res, (error) => {
        res.sendStatus(error ? 409 : 204);
      }),
    );
    await request(app).post('/').attach('file', Buffer.alloc(64), 'image.png').expect(409);
    expect(await fs.promises.readFile(path.join(directory, 'existing'), 'utf8')).toBe('preserved');
  });
});
