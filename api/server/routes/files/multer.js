const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { fileConfig } = require('librechat-data-provider');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const outputPath = path.join(req.app.locals.paths.imageOutput, 'temp');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    cb(null, outputPath);
  },
  filename: function (req, file, cb) {
    req.file_id = crypto.randomUUID();
    const fileExt = path.extname(file.originalname);
    cb(null, `img-${req.file_id}${fileExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!fileConfig.checkType(file.mimetype)) {
    return cb(new Error('Unsupported file type: ' + file.mimetype), false);
  }

  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: fileConfig.sizeLimit } });

module.exports = upload;
