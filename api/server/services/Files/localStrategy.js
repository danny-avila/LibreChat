const { createFile } = require('~/models');
const { convertToWebP } = require('./images/convert');

/**
 * Applies the local strategy for image uploads.
 * Saves file metadata to the database with an expiry TTL.
 * Files must be deleted from the server filesystem manually.
 *
 * @param {Object} params - The parameters object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {Express.Multer.File} params.file - The uploaded file.
 * @param {ImageMetadata} params.metadata - Additional metadata for the file.
 * @returns {Promise<void>}
 */
const localStrategy = async ({ res, file, metadata }) => {
  const { file_id, temp_file_id } = metadata;
  const { filepath, bytes, width, height } = await convertToWebP(file.path);
  const result = await createFile(
    {
      file_id,
      temp_file_id,
      bytes,
      filepath,
      filename: file.originalname,
      type: 'image/webp',
      width,
      height,
    },
    true,
  );
  res.status(200).json({ message: 'File uploaded and processed successfully', ...result });
};

module.exports = localStrategy;
