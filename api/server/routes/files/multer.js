const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { fileConfig: defaultFileConfig, mergeFileConfig } = require('librechat-data-provider');
const { getCustomConfig } = require('~/server/services/Config');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const outputPath = path.join(req.app.locals.paths.uploads, 'temp', req.user.id);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    cb(null, outputPath);
  },
  filename: function (req, file, cb) {
    req.file_id = crypto.randomUUID();
    file.originalname = decodeURIComponent(file.originalname);
    const sanitizedFilename = path.basename(file.originalname);
    cb(null, sanitizedFilename);
  },
});

const importFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json') {
    cb(null, true);
  } else if (path.extname(file.originalname).toLowerCase() === '.json') {
    cb(null, true);
  } else {
    cb(new Error('Only JSON files are allowed'), false);
  }
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

    const endpoint = req.body.endpoint;
    const supportedTypes =
      customFileConfig?.endpoints?.[endpoint]?.supportedMimeTypes ??
      customFileConfig?.endpoints?.default.supportedMimeTypes ??
      defaultFileConfig?.endpoints?.[endpoint]?.supportedMimeTypes;

    if (!defaultFileConfig.checkType(file.mimetype, supportedTypes)) {
      return cb(new Error('Unsupported file type: ' + file.mimetype), false);
    }

    cb(null, true);
  };

  return fileFilter;
};

const createMulterInstance = async () => {
  const customConfig = await getCustomConfig();
  const fileConfig = mergeFileConfig(customConfig?.fileConfig);
  const fileFilter = createFileFilter(fileConfig);
  return multer({
    storage,
    fileFilter,
    limits: { fileSize: fileConfig.serverFileSizeLimit },
  });
};

module.exports = { createMulterInstance, storage, importFileFilter };
