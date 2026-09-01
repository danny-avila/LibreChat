const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { sanitizeFilename, createCustomError } = require('@librechat/api');
const {
  mergeFileConfig,
  inferMimeType,
  isAgentsEndpoint,
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

/** Every type some configured endpoint accepts, for a request whose real endpoint is only
 *  known after an agent read this filter cannot make. */
const collectSupportedMimeTypes = (customFileConfig, endpointFileConfig) => {
  const merged = [...(endpointFileConfig.supportedMimeTypes ?? [])];
  for (const config of Object.values(customFileConfig?.endpoints ?? {})) {
    for (const mimeType of config?.supportedMimeTypes ?? []) {
      merged.push(mimeType);
    }
  }
  return merged;
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

    /* An agent upload is validated again under the agent's own provider once the route
     * has resolved and authorized it. That provider's allowlist can be wider than the
     * `agents` entry, and this filter is synchronous so it cannot resolve it, so here the
     * question is only whether any configured endpoint accepts the type. Narrowing to
     * `agents` would make the later provider check able to reject but never to permit. */
    const supportedMimeTypes = isAgentsEndpoint(endpoint)
      ? collectSupportedMimeTypes(customFileConfig, endpointFileConfig)
      : endpointFileConfig.supportedMimeTypes;

    if (!defaultFileConfig.checkType(mimeType, supportedMimeTypes)) {
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
