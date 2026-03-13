const express = require('express');
const request = require('supertest');
const multer = require('multer');

const DEFAULT_IMPORT_MAX_FILE_SIZE = 262144000;

const importFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json') {
    cb(null, true);
  } else {
    cb(new Error('Only JSON files are allowed'), false);
  }
};

function createImportApp(fileSize) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: importFileFilter,
    limits: { fileSize },
  });

  app.post('/import', upload.single('file'), (req, res) => {
    res.status(201).json({ message: 'success', size: req.file.size });
  });

  app.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    res.status(400).json({ error: err.message });
  });

  return app;
}

describe('Conversation Import - Multer File Size Limits', () => {
  const originalEnv = process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = originalEnv;
    } else {
      delete process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES;
    }
  });

  function resolveMaxFileSize() {
    return process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES
      ? parseInt(process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES, 10)
      : DEFAULT_IMPORT_MAX_FILE_SIZE;
  }

  describe('default limit when env var is not set', () => {
    it('resolves to 262144000 (250 MiB)', () => {
      delete process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES;
      expect(resolveMaxFileSize()).toBe(262144000);
    });

    it('resolves to 262144000 when env var is empty string', () => {
      process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '';
      expect(resolveMaxFileSize()).toBe(262144000);
    });
  });

  describe('custom env var value', () => {
    it('respects a custom value when set', () => {
      process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '5242880';
      expect(resolveMaxFileSize()).toBe(5242880);
    });

    it('parses string env var to integer', () => {
      process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '1048576';
      expect(resolveMaxFileSize()).toBe(1048576);
    });
  });

  describe('multer rejects files exceeding the configured limit', () => {
    it('returns 413 for files larger than the limit', async () => {
      const limit = 1024;
      const app = createImportApp(limit);
      const oversized = Buffer.alloc(limit + 512, 'x');

      const res = await request(app)
        .post('/import')
        .attach('file', oversized, { filename: 'import.json', contentType: 'application/json' });

      expect(res.status).toBe(413);
      expect(res.body.error).toBe('File too large');
    });

    it('accepts files within the limit', async () => {
      const limit = 4096;
      const app = createImportApp(limit);
      const valid = Buffer.from(JSON.stringify({ title: 'test' }));

      const res = await request(app)
        .post('/import')
        .attach('file', valid, { filename: 'import.json', contentType: 'application/json' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('success');
    });

    it('rejects at the exact boundary (limit + 1 byte)', async () => {
      const limit = 512;
      const app = createImportApp(limit);
      const boundary = Buffer.alloc(limit + 1, 'a');

      const res = await request(app)
        .post('/import')
        .attach('file', boundary, { filename: 'import.json', contentType: 'application/json' });

      expect(res.status).toBe(413);
    });

    it('accepts a file just under the limit', async () => {
      const limit = 512;
      const app = createImportApp(limit);
      const underLimit = Buffer.alloc(limit - 1, 'b');

      const res = await request(app)
        .post('/import')
        .attach('file', underLimit, { filename: 'import.json', contentType: 'application/json' });

      expect(res.status).toBe(201);
    });
  });
});
