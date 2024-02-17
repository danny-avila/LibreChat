const fs = require('fs');

/**
 * Uploads a file that can be used across various OpenAI services.
 *
 * @param {Express.Request} req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user, and an `app.locals.paths` object with an `imageOutput` path.
 * @param {Express.Multer.File} file - The file uploaded to the server via multer.
 * @param {OpenAI} openai - The initialized OpenAI client.
 * @returns {Promise<OpenAIFile>}
 */
async function uploadOpenAIFile(req, file, openai) {
  try {
    const uploadedFile = await openai.files.create({
      file: fs.createReadStream(file.path),
      purpose: 'assistants',
    });

    console.log('File uploaded successfully to OpenAI');

    return uploadedFile;
  } catch (error) {
    console.error('Error uploading file to OpenAI:', error.message);
    throw error;
  }
}

/**
 * Deletes a file previously uploaded to OpenAI.
 *
 * @param {Express.Request} req - The request object from Express.
 * @param {MongoFile} file - The database representation of the uploaded file.
 * @param {OpenAI} openai - The initialized OpenAI client.
 * @returns {Promise<void>}
 */
async function deleteOpenAIFile(req, file, openai) {
  try {
    const res = await openai.files.del(file.file_id);
    if (!res.deleted) {
      throw new Error('OpenAI returned `false` for deleted status');
    }
    console.log('File deleted successfully from OpenAI');
  } catch (error) {
    console.error('Error deleting file from OpenAI:', error.message);
    throw error;
  }
}

module.exports = { uploadOpenAIFile, deleteOpenAIFile };
