const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const sizeLimit = 20 * 1024 * 1024; // 20 MB

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
  if (!supportedTypes.includes(file.mimetype)) {
    return cb(
      new Error('Unsupported file type. Only JPEG, JPG, PNG, and WEBP files are allowed.'),
      false,
    );
  }

  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: sizeLimit } });

module.exports = upload;
