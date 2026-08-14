const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { sanitizeFilename } = require('@librechat/api');
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
 * Multer forwards file-filter rejections to the shared error handler, which only relays a status and
 * message for errors carrying `statusCode` and `body`. A plain `Error` falls through to a bare 500,
 * so the client can't tell the user why the upload was refused.
 */
const uploadError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.body = { message };
  return error;
};

const importFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json') {
    cb(null, true);
  } else if (path.extname(file.originalname).toLowerCase() === '.json') {
    cb(null, true);
  } else {
    cb(uploadError(415, 'Only JSON files are allowed'), false);
  }
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
      return cb(uploadError(400, 'No file provided'), false);
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
      return cb(uploadError(415, 'Unsupported file type: ' + (file.mimetype || mimeType)), false);
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

module.exports = { createMulterInstance, storage, importFileFilter, createFileFilter };
