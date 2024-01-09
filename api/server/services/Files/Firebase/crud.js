const fetch = require('node-fetch');
const { ref, uploadBytes, getDownloadURL, deleteObject } = require('firebase/storage');
const { getFirebaseStorage } = require('./initialize');

/**
 * Deletes a file from Firebase Storage.
 * @param {string} directory - The directory name
 * @param {string} fileName - The name of the file to delete.
 * @returns {Promise<void>} A promise that resolves when the file is deleted.
 */
async function deleteFile(basePath, fileName) {
  const storage = getFirebaseStorage();
  if (!storage) {
    console.error('Firebase is not initialized. Cannot delete file from Firebase Storage.');
    throw new Error('Firebase is not initialized');
  }

  const storageRef = ref(storage, `${basePath}/${fileName}`);

  try {
    await deleteObject(storageRef);
    console.log('File deleted successfully from Firebase Storage');
  } catch (error) {
    console.error('Error deleting file from Firebase Storage:', error.message);
    throw error;
  }
}

/**
 * Saves an file from a given URL to Firebase Storage. The function first initializes the Firebase Storage
 * reference, then uploads the file to a specified basePath in the Firebase Storage. It handles initialization
 * errors and upload errors, logging them to the console. If the upload is successful, the file name is returned.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user's unique identifier. This is used to create a user-specific basePath
 *                                 in Firebase Storage.
 * @param {string} params.URL - The URL of the file to be uploaded. The file at this URL will be fetched
 *                              and uploaded to Firebase Storage.
 * @param {string} params.fileName - The name that will be used to save the file in Firebase Storage. This
 *                                   should include the file extension.
 * @param {string} [params.basePath='images'] - Optional. The base basePath in Firebase Storage where the file will
 *                                          be stored. Defaults to 'images' if not specified.
 *
 * @returns {Promise<string|null>}
 *          A promise that resolves to the file name if the file is successfully uploaded, or null if there
 *          is an error in initialization or upload.
 */
async function saveURLToFirebase({ userId, URL, fileName, basePath = 'images' }) {
  const storage = getFirebaseStorage();
  if (!storage) {
    console.error('Firebase is not initialized. Cannot save file to Firebase Storage.');
    return null;
  }

  const storageRef = ref(storage, `${basePath}/${userId.toString()}/${fileName}`);

  try {
    await uploadBytes(storageRef, await fetch(URL).then((response) => response.buffer()));
    return fileName;
  } catch (error) {
    console.error('Error uploading file to Firebase Storage:', error.message);
    return null;
  }
}

/**
 * Retrieves the download URL for a specified file from Firebase Storage. This function initializes the
 * Firebase Storage and generates a reference to the file based on the provided basePath and file name. If
 * Firebase Storage is not initialized or if there is an error in fetching the URL, the error is logged
 * to the console.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.fileName - The name of the file for which the URL is to be retrieved. This should
 *                                   include the file extension.
 * @param {string} [params.basePath='images'] - Optional. The base basePath in Firebase Storage where the file is
 *                                          stored. Defaults to 'images' if not specified.
 *
 * @returns {Promise<string|null>}
 *          A promise that resolves to the download URL of the file if successful, or null if there is an
 *          error in initialization or fetching the URL.
 */
async function getFirebaseURL({ fileName, basePath = 'images' }) {
  const storage = getFirebaseStorage();
  if (!storage) {
    console.error('Firebase is not initialized. Cannot get image URL from Firebase Storage.');
    return null;
  }

  const storageRef = ref(storage, `${basePath}/${fileName}`);

  try {
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.error('Error fetching file URL from Firebase Storage:', error.message);
    return null;
  }
}

/**
 * Uploads a buffer to Firebase Storage.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user's unique identifier. This is used to create a user-specific basePath
 *                                 in Firebase Storage.
 * @param {string} params.fileName - The name of the file to be saved in Firebase Storage.
 * @param {string} params.buffer - The buffer to be uploaded.
 * @param {string} [params.basePath='images'] - Optional. The base basePath in Firebase Storage where the file will
 *                                          be stored. Defaults to 'images' if not specified.
 *
 * @returns {Promise<string>} - A promise that resolves to the download URL of the uploaded file.
 */
async function saveBufferToFirebase({ userId, buffer, fileName, basePath = 'images' }) {
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error('Firebase is not initialized');
  }

  const storageRef = ref(storage, `${basePath}/${userId}/${fileName}`);
  await uploadBytes(storageRef, buffer);

  // Assuming you have a function to get the download URL
  return await getFirebaseURL({ fileName, basePath: `${basePath}/${userId}` });
}

/**
 * Extracts and decodes the file path from a Firebase Storage URL.
 *
 * @param {string} urlString - The Firebase Storage URL.
 * @returns {string} The decoded file path.
 */
function extractFirebaseFilePath(urlString) {
  try {
    const url = new URL(urlString);
    const pathRegex = /\/o\/(.+?)(\?|$)/;
    const match = url.pathname.match(pathRegex);

    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }

    return '';
  } catch (error) {
    // If URL parsing fails, return an empty string
    return '';
  }
}

/**
 * Deletes a file from Firebase storage. This function determines the filepath from the
 * Firebase storage URL via regex for deletion. Validated by the user's ID.
 *
 * @param {Express.Request} req - The request object from Express.
 * It should contain a `user` object with an `id` property.
 * @param {MongoFile} file - The file object to be deleted.
 *
 * @returns {Promise<void>}
 *          A promise that resolves when the file has been successfully deleted from Firebase storage.
 *          Throws an error if there is an issue with deletion.
 */
const deleteFirebaseFile = async (req, file) => {
  const fileName = extractFirebaseFilePath(file.filepath);
  if (!fileName.includes(req.user.id)) {
    throw new Error('Invalid file path');
  }
  await deleteFile('', fileName);
};

module.exports = {
  deleteFile,
  getFirebaseURL,
  saveURLToFirebase,
  deleteFirebaseFile,
  saveBufferToFirebase,
};
