const fs = require('fs');
const path = require('path');
const { updateFile } = require('~/models/File');

/**
 * Encodes a file to base64.
 * @param {string} filePath - The path to the image file.
 * @returns {Promise<string>} A promise that resolves with the base64 encoded image data.
 */
function encodeFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString('base64'));
      }
    });
  });
}

/**
 * Local: Updates the file and encodes the file to base64,
 * for file payload handling: tuple order of [filepath, base64].
 * @param {Object} req - The request object.
 * @param {MongoFile} file - The file object.
 * @param {Object} outputPaths - The output paths for public and the file(or image) object.
 * @returns {Promise<[MongoFile, string]>} - A promise that resolves to an array of results from updateFile and encodeFile.
 */
async function prepareFileLocal(req, file, outputPaths) {
  const { publicPath, fileOutput } = outputPaths;
  const userPath = path.join(fileOutput, req.user.id);

  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(userPath, { recursive: true });
  }
  const filepath = path.join(publicPath, file.filepath);

  const promises = [];
  promises.push(updateFile({ file_id: file.file_id }));

  promises.push(encodeFile(filepath));
  return await Promise.all(promises);
}

module.exports = { encodeFile, prepareFileLocal };
