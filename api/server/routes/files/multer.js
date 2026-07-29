const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { sanitizeFilename, FILENAME_SEGMENT_MAX_BYTES } = require('@librechat/api');
const {
  mergeFileConfig,
  inferMimeType,
  getEndpointFileConfig,
  fileConfig: defaultFileConfig,
} = require('librechat-data-provider');
const { getAppConfig } = require('~/server/services/Config');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const appConfig = req.config;
    const outputPath = path.join(appConfig.paths.uploads, 'temp', req.user.id);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    cb(null, outputPath);
  },
  filename: function (req, file, cb) {
    req.file_id = crypto.randomUUID();
    file.originalname = decodeURIComponent(file.originalname);
    const sanitizedFilename = sanitizeFilename(file.originalname);
    cb(null, sanitizedFilename);
  },
});

/**
 * Storage for conversation-export uploads. Identical to `storage` except
 * that the stored name is prefixed with the per-upload id: an import job
 * keeps reading its archive long after the upload request ends (inspect →
 * confirm → run, up to the job TTL), so two uploads of the same
 * `conversations.zip` must not resolve to one path — otherwise the second
 * overwrites the archive the first is still importing, and cancelling
 * either deletes the other's file.
 */
const importStorage = multer.diskStorage({
  destination: storage.getDestination,
  filename: function (req, file, cb) {
    req.file_id = crypto.randomUUID();
    file.originalname = decodeURIComponent(file.originalname);
    /** The id prefix has to come out of the same NAME_MAX budget the
     * sanitizer truncates against. Left at the default, a legitimately long
     * export name sanitizes to a full 255 bytes and the prefix then pushes the
     * component past the limit, so multer fails with ENAMETOOLONG. */
    const prefix = `${req.file_id}-`;
    const budget = FILENAME_SEGMENT_MAX_BYTES - Buffer.byteLength(prefix, 'utf8');
    cb(null, `${prefix}${sanitizeFilename(file.originalname, budget)}`);
  },
});

const IMPORT_EXTENSIONS = new Set(['.json', '.zip']);
const IMPORT_MIME_TYPES = new Set(['application/json', 'text/json']);

/**
 * Accepts `.json` and `.zip` conversation exports. The extension is
 * authoritative for `.zip`: browsers frequently send
 * `application/octet-stream` for archives, so trusting the MIME type alone
 * would let any file through under that generic type.
 *
 * A declared JSON MIME type is accepted without the extension, which API
 * clients and some drag-and-drop sources rely on. That is safe because the
 * upload's actual content is inspected before anything is imported — the
 * filter only decides whether the bytes are worth writing to disk.
 */
const importFileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  if (IMPORT_EXTENSIONS.has(extension)) {
    cb(null, true);
    return;
  }
  if (IMPORT_MIME_TYPES.has((file.mimetype || '').toLowerCase())) {
    cb(null, true);
    return;
  }
  cb(new Error('Unsupported import type'), false);
};

const normalizeUploadMimeType = (file) => {
  const mimeType = inferMimeType(file.originalname || '', file.mimetype || '');
  if (mimeType && file.mimetype !== mimeType) {
    file.mimetype = mimeType;
  }
  return mimeType;
};

/**
 *
 * @param {import('librechat-data-provider').FileConfig | undefined} customFileConfig
 */
const createFileFilter = (customFileConfig) => {
  /**
   * @param {ServerRequest} req
   * @param {Express.Multer.File}
   * @param {import('multer').FileFilterCallback} cb
   */
  const fileFilter = (req, file, cb) => {
    if (!file) {
      return cb(new Error('No file provided'), false);
    }

    const mimeType = normalizeUploadMimeType(file);

    if (req.originalUrl.endsWith('/speech/stt') && mimeType.startsWith('audio/')) {
      return cb(null, true);
    }

    const endpoint = req.body.endpoint;
    const endpointType = req.body.endpointType;
    const endpointFileConfig = getEndpointFileConfig({
      fileConfig: customFileConfig,
      endpoint,
      endpointType,
    });

    if (!defaultFileConfig.checkType(mimeType, endpointFileConfig.supportedMimeTypes)) {
      return cb(new Error('Unsupported file type: ' + (file.mimetype || mimeType)), false);
    }

    cb(null, true);
  };

  return fileFilter;
};

const createMulterInstance = async () => {
  const appConfig = await getAppConfig();
  const fileConfig = mergeFileConfig(appConfig?.fileConfig);
  const fileFilter = createFileFilter(fileConfig);
  return multer({
    storage,
    fileFilter,
    limits: { fileSize: fileConfig.serverFileSizeLimit },
  });
};

module.exports = {
  createMulterInstance,
  storage,
  importStorage,
  importFileFilter,
  createFileFilter,
};
