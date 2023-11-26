const sharp = require('sharp');
const { storage, ref, uploadBytes, getDownloadURL } = require('./firebase');
const fetch = require('node-fetch');
const fs = require('fs').promises; // Aggiunta per gestire i file

async function convertToWebP(inputBuffer) {
  return sharp(inputBuffer).resize({ width: 150 }).toFormat('webp').toBuffer();
}

async function uploadProfilePicture(userId, input) {
  try {
    if (userId === undefined) {
      throw new Error('User ID is undefined');
    }

    const profilePicRef = ref(storage, `users/${userId.toString()}/profilePicture`);
    let imageBuffer;

    if (typeof input === 'string') {
      const response = await fetch(input);

      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL. Status: ${response.status}`);
      }

      imageBuffer = await response.buffer();
    } else if (input instanceof Buffer) {
      imageBuffer = input;
    } else if (typeof input === 'object' && input instanceof File) {
      // Se l'input è un oggetto File, leggi il suo contenuto come buffer
      const fileContent = await fs.readFile(input.path);
      imageBuffer = Buffer.from(fileContent);
    } else {
      throw new Error('Invalid input type. Expected URL, Buffer, or File.');
    }

    const webPBuffer = await convertToWebP(imageBuffer);

    await uploadBytes(profilePicRef, webPBuffer);

    console.log('WebP Image uploaded successfully');

    const url = await getDownloadURL(profilePicRef);

    return url;
  } catch (error) {
    console.error('Error uploading profile picture:', error.message);
    throw error;
  }
}

module.exports = uploadProfilePicture;
