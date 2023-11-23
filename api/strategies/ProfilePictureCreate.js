const { storage, ref, uploadBytes, getDownloadURL } = require('../server/services/firebase');
const fetch = require('node-fetch');

async function uploadProfilePictureFromURL(userId, imageUrl) {
  try {
    // Fetch the image from the provided URL
    const response = await fetch(imageUrl);

    console.log('Response:', response);

    if (!response.ok) {
      throw new Error(`Failed to fetch image. Status: ${response.status}`);
    }

    // Convert the image to a buffer
    const imageBuffer = await response.buffer();
    console.log('Image buffer:', imageBuffer);

    // Initialize Firebase Storage reference
    const profilePicRef = ref(storage, `profile_pictures/${userId}`);

    console.log('Profile picture reference:', profilePicRef);

    // Upload the image to Firebase Storage
    await uploadBytes(profilePicRef, imageBuffer);

    console.log('Image uploaded successfully');
    // Get the download URL
    const url = await getDownloadURL(profilePicRef);

    return url;
  } catch (error) {
    console.error('Error uploading profile picture:', error.message);
    throw error;
  }
}

module.exports = uploadProfilePictureFromURL;
