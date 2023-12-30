const fetch = require('node-fetch');
const { ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const { getFirebaseStorage } = require('./initialize');

async function saveImageToFirebaseStorage(userId, imageUrl, imageName) {
  const storage = getFirebaseStorage();
  if (!storage) {
    console.error('Firebase is not initialized. Cannot save image to Firebase Storage.');
    return null;
  }

  const storageRef = ref(storage, `images/${userId.toString()}/${imageName}`);

  try {
    // Upload image to Firebase Storage using the image URL
    await uploadBytes(storageRef, await fetch(imageUrl).then((response) => response.buffer()));
    return imageName;
  } catch (error) {
    console.error('Error uploading image to Firebase Storage:', error.message);
    return null;
  }
}

async function getFirebaseStorageImageUrl(imageName) {
  const storage = getFirebaseStorage();
  if (!storage) {
    console.error('Firebase is not initialized. Cannot get image URL from Firebase Storage.');
    return null;
  }

  const storageRef = ref(storage, `images/${imageName}`);

  try {
    // Get the download URL for the image from Firebase Storage
    return `![generated image](${await getDownloadURL(storageRef)})`;
  } catch (error) {
    console.error('Error fetching image URL from Firebase Storage:', error.message);
    return null;
  }
}

module.exports = {
  saveImageToFirebaseStorage,
  getFirebaseStorageImageUrl,
};
