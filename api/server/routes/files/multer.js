const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { sanitizeFilename } = require('@librechat/api');
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

    if (req.originalUrl.endsWith('/speech/stt') && file.mimetype.startsWith('audio/')) {
      return cb(null, true);
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

/**
 * Create a multer instance for secure uploads that allows all file types
 */
const createSecureUploadMulterInstance = async () => {
  const customConfig = await getCustomConfig();
  const fileConfig = mergeFileConfig(customConfig?.fileConfig);

  // Create a permissive file filter for secure uploads
  const secureFileFilter = (req, file, cb) => {
    if (!file) {
      return cb(new Error('No file provided'), false);
    }

    // Basic security checks - reject potentially dangerous files
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.js', '.jar'];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    if (dangerousExtensions.includes(fileExtension)) {
      return cb(new Error(`File type ${fileExtension} is not allowed for security reasons`), false);
    }

    // Check for null bytes in filename (security measure)
    if (file.originalname.includes('\0')) {
      return cb(new Error('Invalid filename: contains null bytes'), false);
    }

    // Validate filename length
    if (file.originalname.length > 255) {
      return cb(new Error('Filename too long (max 255 characters)'), false);
    }

    cb(null, true);
  };

  return multer({
    storage,
    fileFilter: secureFileFilter,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for secure uploads
  });
};

module.exports = { createMulterInstance, createSecureUploadMulterInstance, storage, importFileFilter };
