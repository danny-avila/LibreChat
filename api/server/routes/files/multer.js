const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const outputPath = path.join(req.app.locals.config.imageOutputPath, 'temp');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    cb(null, outputPath);
  },
  filename: function (req, file, cb) {
    req.file_id = crypto.randomUUID();
    cb(null, req.file_id + '-' + file.originalname);
  },
});

const upload = multer({ storage });

module.exports = upload;
