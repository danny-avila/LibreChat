const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { fileConfig } = require('librechat-data-provider');

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
    cb(null, `${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file) {
    return cb(new Error('No file provided'), false);
  }

  if (!fileConfig.checkType(file.mimetype)) {
    return cb(new Error('Unsupported file type: ' + file.mimetype), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: fileConfig.serverFileSizeLimit },
});

module.exports = upload;
