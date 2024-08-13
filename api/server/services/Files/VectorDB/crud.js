const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { FileSources } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Deletes a file from the vector database. This function takes a file object, constructs the full path, and
 * verifies the path's validity before deleting the file. If the path is invalid, an error is thrown.
 *
 * @param {Express.Request} req - The request object from Express. It should have an `app.locals.paths` object with
 *                       a `publicPath` property.
 * @param {MongoFile} file - The file object to be deleted. It should have a `filepath` property that is
 *                           a string representing the path of the file relative to the publicPath.
 *
 * @returns {Promise<void>}
 *          A promise that resolves when the file has been successfully deleted, or throws an error if the
 *          file path is invalid or if there is an error in deletion.
 */
const deleteVectors = async (req, file) => {
  if (!file.embedded || !process.env.RAG_API_URL) {
    return;
  }
  try {
    const jwtToken = req.headers.authorization.split(' ')[1];
    return await axios.delete(`${process.env.RAG_API_URL}/documents`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      data: [file.file_id],
    });
  } catch (error) {
    logger.error('Error deleting vectors', error);
    throw new Error(error.message || 'An error occurred during file deletion.');
  }
};

/**
 * Uploads a file to the configured Vector database
 *
 * @param {Object} params - The params object.
 * @param {Object} params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user, and an `app.locals.paths` object with an `uploads` path.
 * @param {Express.Multer.File} params.file - The file object, which is part of the request. The file object should
 *                                     have a `path` property that points to the location of the uploaded file.
 * @param {string} params.file_id - The file ID.
 *
 * @returns {Promise<{ filepath: string, bytes: number }>}
 *          A promise that resolves to an object containing:
 *            - filepath: The path where the file is saved.
 *            - bytes: The size of the file in bytes.
 */
/**
async function uploadVectors({ req, file, file_id }) {
  if (!process.env.RAG_API_URL) {
    throw new Error('RAG_API_URL not defined');
  }

  try {
    const jwtToken = req.headers.authorization.split(' ')[1];
    const formData = new FormData();
    formData.append('file_id', file_id);
    formData.append('file', fs.createReadStream(file.path));

    const formHeaders = formData.getHeaders(); // Automatically sets the correct Content-Type

    const response = await axios.post(`${process.env.RAG_API_URL}/embed`, formData, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        accept: 'application/json',
        ...formHeaders,
      },
    });

    const responseData = response.data;
    logger.debug('Response from embedding file', responseData);

    if (responseData.known_type === false) {
      throw new Error(`File embedding failed. The filetype ${file.mimetype} is not supported`);
    }

    if (!responseData.status) {
      throw new Error('File embedding failed.');
    }

    return {
      bytes: file.size,
      filename: file.originalname,
      filepath: FileSources.vectordb,
      embedded: Boolean(responseData.known_type),
    };
  } catch (error) {
    logger.error('Error embedding file', error);
    throw new Error(error.message || 'An error occurred during file upload.');
  }
}
*/
async function uploadVectors({ req, file, file_id }) {
  if (!process.env.RAG_API_URL) {
    const errorMessage = 'RAG_API_URL not defined';
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    console.log('Iniciando proceso de subida de vectores');

    const jwtToken = req.headers.authorization.split(' ')[1];
    console.log('JWT token obtenido:', jwtToken);

    const formData = new FormData();
    formData.append('file_id', file_id);
    formData.append('file', fs.createReadStream(file.path));
    console.log('Form data construida con file_id:', file_id, 'y archivo:', file.path);

    const formHeaders = formData.getHeaders(); // Automatically sets the correct Content-Type
    console.log('Encabezados del formulario obtenidos:', formHeaders);

    console.log('Enviando solicitud POST para incrustar archivo a URL:', process.env.RAG_API_URL);
    const response = await axios.post(`${process.env.RAG_API_URL}/embed`, formData, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        accept: 'application/json',
        ...formHeaders,
      },
    });
    console.log('Respuesta recibida de la API de incrustación');

    const responseData = response.data;
    logger.debug('Datos de respuesta de la API de incrustación:', responseData);

    if (responseData.known_type === false) {
      const errorMessage = `File embedding failed. The filetype ${file.mimetype} is not supported`;
      logger.error(errorMessage, { filetype: file.mimetype });
      throw new Error(errorMessage);
    }

    if (!responseData.status) {
      const errorMessage = 'File embedding failed.';
      logger.error(errorMessage, { status: responseData.status });
      throw new Error(errorMessage);
    }

    console.log('Archivo incrustado con éxito. Detalles:', {
      bytes: file.size,
      filename: file.originalname,
      filepath: FileSources.vectordb,
      embedded: Boolean(responseData.known_type),
    });

    return {
      bytes: file.size,
      filename: file.originalname,
      filepath: FileSources.vectordb,
      embedded: Boolean(responseData.known_type),
    };
  } catch (error) {
    logger.error('Error embedding file:', error, {
      file_id,
      file_path: file.path,
      file_mimetype: file.mimetype,
      file_size: file.size,
    });
    throw new Error(error.message || 'An error occurred during file upload.');
  }
}


module.exports = {
  deleteVectors,
  uploadVectors,
};
