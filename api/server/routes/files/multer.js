const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { sanitizeFilename, createCustomError } = require('@librechat/api');
const {
  mergeFileConfig,
  EToolResources,
  resolveEffectiveMimeType,
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

const importFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json') {
    cb(null, true);
  } else if (path.extname(file.originalname).toLowerCase() === '.json') {
    cb(null, true);
  } else {
    cb(createCustomError(415, 'Only JSON files are allowed'), false);
  }
};

/**
 * Admission reads the upload exactly as routing does. A client that types by magic bytes
 * calls a `.docx` an archive, and resolving that here keeps a narrowed endpoint allowlist
 * from refusing a document the parser downstream would have accepted.
 */
const normalizeUploadMimeType = (file) => {
  const mimeType = resolveEffectiveMimeType(file.originalname || '', file.mimetype || '');
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
      return cb(createCustomError(400, 'No file provided'), false);
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

    /* An admin who names a type in `documentParser.supportedMimeTypes` has said the
     * server parses it, and both the client's upload options and the routing act on
     * that. Scoped to context uploads, which is the only path that reaches the parser:
     * widening every route would let a caller past an endpoint's MIME restriction and
     * hand the file to a provider that was never meant to see it. */
    const parserTypes = customFileConfig?.documentParser?.supportedMimeTypes;
    const isContextUpload = req.body.tool_resource === EToolResources.context;
    const admitted =
      defaultFileConfig.checkType(mimeType, endpointFileConfig.supportedMimeTypes) ||
      (isContextUpload &&
        parserTypes != null &&
        defaultFileConfig.checkType(mimeType, parserTypes));

    if (!admitted) {
      return cb(
        createCustomError(415, 'Unsupported file type: ' + (file.mimetype || mimeType)),
        false,
      );
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
