const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { sanitizeFilename, createCustomError } = require('@librechat/api');
const {
  mergeFileConfig,
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
    /* The principal-merged config, which `configMiddleware` puts on the request before
     * this route runs. The instance-level one was resolved once at startup, so a tenant,
     * role or user override would be invisible here and the upload refused before the
     * post-upload gate could apply the configuration that actually governs it. */
    const effectiveFileConfig = req.config?.fileConfig
      ? mergeFileConfig(req.config.fileConfig)
      : customFileConfig;
    const endpointFileConfig = getEndpointFileConfig({
      fileConfig: effectiveFileConfig,
      endpoint,
      endpointType,
    });

    /* An admin who names a type in `documentParser.supportedMimeTypes` has said the
     * server parses it, so this filter admits those too. Deliberately not scoped to
     * context uploads here: this runs while the file part is still streaming, before the
     * fields that follow it have been parsed, and a multipart client may legally send
     * `tool_resource` after the file. `filterFile` applies that scope on a complete body
     * a moment later, before any provider is handed the upload, so the only thing this
     * admits is a temporary file that the next gate deletes. */
    const parserTypes = effectiveFileConfig?.documentParser?.supportedMimeTypes;
    const admitted =
      defaultFileConfig.checkType(mimeType, endpointFileConfig.supportedMimeTypes) ||
      (parserTypes != null && defaultFileConfig.checkType(mimeType, parserTypes));

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
