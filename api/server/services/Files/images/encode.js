const fs = require('fs');
const path = require('path');

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
  const newPath = path.join(userPath, path.basename(file.filepath));
  await fs.promises.rename(filepath, newPath);
  return await encodeImage(newPath);
}

async function encodeAndFormat(req, files) {
  const promises = [];
  for (let file of files) {
    promises.push(encodeAndMove(req, file));
  }

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
