const express = require('express');
const request = require('supertest');
const multer = require('multer');

const importFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json') {
    cb(null, true);
  } else {
    cb(new Error('Only JSON files are allowed'), false);
  }
};

/** Proxy app that mirrors the production multer + error-handling pattern */
function createImportApp(fileSize) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: importFileFilter,
    limits: { fileSize },
  });
  const uploadSingle = upload.single('file');

  function handleUpload(req, res, next) {
    uploadSingle(req, res, (err) => {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File exceeds the maximum allowed size' });
      }
      if (err) {
        return next(err);
      }
      next();
    });
  }

  app.post('/import', handleUpload, (req, res) => {
    res.status(201).json({ message: 'success', size: req.file.size });
  });

  app.use((err, _req, res, _next) => {
    res.status(400).json({ error: err.message });
  });

  return app;
}

describe('Conversation Import - Multer File Size Limits', () => {
  describe('multer rejects files exceeding the configured limit', () => {
    it('returns 413 for files larger than the limit', async () => {
      const limit = 1024;
      const app = createImportApp(limit);
      const oversized = Buffer.alloc(limit + 512, 'x');

      const res = await request(app)
        .post('/import')
        .attach('file', oversized, { filename: 'import.json', contentType: 'application/json' });

      expect(res.status).toBe(413);
      expect(res.body.message).toBe('File exceeds the maximum allowed size');
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
