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

async function encodeAndMove(req, file) {
  const { publicPath, imageOutput } = req.app.locals.config;
  const userPath = path.join(imageOutput, req.user.id);

  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(userPath, { recursive: true });
  }
  const filepath = path.join(publicPath, file.filepath);

  if (!filepath.includes('temp')) {
    return await encodeImage(newPath);
  }

  const newPath = path.join(userPath, path.basename(file.filepath));
  await fs.promises.rename(filepath, newPath);
  const newFilePath = path.posix.join('/', 'images', req.user.id, path.basename(file.filepath));
  await updateFile({ file_id: file.file_id, filepath: newFilePath });
  return await encodeImage(newPath);
}

async function encodeAndFormat(req, files) {
  const promises = [];
  for (let file of files) {
    promises.push(encodeAndMove(req, file));
  }

  // TODO: make detail configurable, as of now resizing is done
  // to prefer "high" but "low" may be used if the image is small enough
  const detail = req.body.detail ?? 'auto';
  const encodedImages = await Promise.all(promises);
  return [
    ...encodedImages.map((base64) => ({
      type: 'image_url',
      image_url: {
        url: `data:image/webp;base64,${base64}`,
        detail,
      },
    })),
  ];
}

module.exports = {
  encodeImage,
  encodeAndFormat,
};
