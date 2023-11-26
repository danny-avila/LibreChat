const fs = require('fs');
const path = require('path');
const { updateFile } = require('~/models');

function encodeImage(imagePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(imagePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString('base64'));
      }
    });
  });
}

async function updateAndEncode(req, file) {
  const { publicPath, imageOutput } = req.app.locals.config;
  const userPath = path.join(imageOutput, req.user.id);

  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(userPath, { recursive: true });
  }
  const filepath = path.join(publicPath, file.filepath);

  const promises = [];
  promises.push(updateFile({ file_id: file.file_id }));
  promises.push(encodeImage(filepath));
  return await Promise.all(promises);
}

async function encodeAndFormat(req, files) {
  const promises = [];
  for (let file of files) {
    promises.push(updateAndEncode(req, file));
  }

  // TODO: make detail configurable, as of now resizing is done
  // to prefer "high" but "low" may be used if the image is small enough
  const detail = req.body.detail ?? 'auto';
  const encodedImages = await Promise.all(promises);

  const result = {
    files: [],
    image_urls: [],
  };

  for (const [file, base64] of encodedImages) {
    result.image_urls.push({
      type: 'image_url',
      image_url: {
        url: `data:image/webp;base64,${base64}`,
        detail,
      },
    });

    result.files.push({
      file_id: file.file_id,
      filepath: file.filepath,
      filename: file.filename,
      type: file.type,
      height: file.height,
      width: file.width,
    });
  }
  return result;
}

module.exports = {
  encodeImage,
  encodeAndFormat,
};
