const fetch = require('node-fetch');
const { ref, uploadBytes, getDownloadURL, deleteObject } = require('firebase/storage');
const { getFirebaseStorage } = require('./initialize');

/**
 * Deletes a file from Firebase Storage.
 * @param {string} directory - The directory name
 * @param {string} fileName - The name of the file to delete.
 * @returns {Promise<void>} A promise that resolves when the file is deleted.
 */
async function deleteFileFromFirebase(basePath, fileName) {
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
 * Saves an image from a given URL to Firebase Storage. The function first initializes the Firebase Storage
 * reference, then uploads the image to a specified basePath in the Firebase Storage. It handles initialization
 * errors and upload errors, logging them to the console. If the upload is successful, the file name is returned.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user's unique identifier. This is used to create a user-specific basePath
 *                                 in Firebase Storage.
 * @param {string} params.URL - The URL of the image to be uploaded. The image at this URL will be fetched
 *                              and uploaded to Firebase Storage.
 * @param {string} params.fileName - The name that will be used to save the image in Firebase Storage. This
 *                                   should include the file extension.
 * @param {string} [params.basePath='images'] - Optional. The base basePath in Firebase Storage where the image will
 *                                          be stored. Defaults to 'images' if not specified.
 *
 * @returns {Promise<string|null>}
 *          A promise that resolves to the file name if the image is successfully uploaded, or null if there
 *          is an error in initialization or upload.
 */
async function saveURLToFirebase({ userId, URL, fileName, basePath = 'images' }) {
  const storage = getFirebaseStorage();
  if (!storage) {
    console.error('Firebase is not initialized. Cannot save image to Firebase Storage.');
    return null;
  }

  const storageRef = ref(storage, `${basePath}/${userId.toString()}/${fileName}`);

  try {
    // Upload image to Firebase Storage using the image URL
    await uploadBytes(storageRef, await fetch(URL).then((response) => response.buffer()));
    return fileName;
  } catch (error) {
    console.error('Error uploading image to Firebase Storage:', error.message);
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

module.exports = {
  saveURLToFirebase,
  getFirebaseURL,
  deleteFileFromFirebase,
};
