const sharp = require('sharp');
const { storage, ref, uploadBytes, getDownloadURL } = require('../server/services/firebase');
const fetch = require('node-fetch');

async function convertToWebP(inputBuffer) {
  return sharp(inputBuffer).resize({ width: 150 }).toFormat('webp').toBuffer();
}

async function uploadProfilePictureFromURL(userId, imageUrl) {
  try {
    // Initialize Firebase Storage reference
    const profilePicRef = ref(storage, `users/${userId}/profilePicture`);

    // Check if an image already exists at the specified path
    try {
      const existingUrl = await getDownloadURL(profilePicRef);
      console.log('Image already exists. Returning existing URL:', existingUrl);
      return existingUrl;
    } catch (e) {
      // No existing image, proceed with uploading
    }

    // Fetch the image from the provided URL
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch image. Status: ${response.status}`);
    }

    // Convert the image to a buffer
    const imageBuffer = await response.buffer();

    // Convert and resize the image to WebP
    const webPBuffer = await convertToWebP(imageBuffer);

    // Upload the WebP image to Firebase Storage
    await uploadBytes(profilePicRef, webPBuffer);

    console.log('WebP Image uploaded successfully');

    // Get the download URL
    const url = await getDownloadURL(profilePicRef);

    return url;
  } catch (error) {
    console.error('Error uploading profile picture:', error.message);
    throw error;
  }
}

module.exports = uploadProfilePictureFromURL;
