const sharp = require('sharp');
const { storage, ref, uploadBytes, getDownloadURL } = require('./firebase');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const User = require('~/models/User');

async function convertToWebP(inputBuffer) {
  return sharp(inputBuffer).resize({ width: 150 }).toFormat('webp').toBuffer();
}

async function uploadProfilePicture(userId, input, manual) {
  try {
    if (userId === undefined) {
      throw new Error('User ID is undefined');
    }
    const _id = userId;
    const oldUser = await User.findOne({ _id });

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
      const fileContent = await fs.readFile(input.path);
      imageBuffer = Buffer.from(fileContent);
    } else {
      throw new Error('Invalid input type. Expected URL, Buffer, or File.');
    }

    const { width, height } = await sharp(imageBuffer).metadata();
    const minSize = Math.min(width, height);
    const squaredBuffer = await sharp(imageBuffer)
      .extract({
        left: Math.floor((width - minSize) / 2),
        top: Math.floor((height - minSize) / 2),
        width: minSize,
        height: minSize,
      })
      .toBuffer();

    const webPBuffer = await convertToWebP(squaredBuffer);

    await uploadBytes(profilePicRef, webPBuffer);

    console.log('WebP Image uploaded successfully');

    const urlFirebase = await getDownloadURL(profilePicRef);

    if (manual === 'true') {
      const url = `${urlFirebase}?manual=true`;
      oldUser.avatar = url;
      await oldUser.save();
    } else {
      const url = `${urlFirebase}?manual=false`;
      return url;
    }
  } catch (error) {
    console.error('Error uploading profile picture:', error.message);
    throw error;
  }
}

module.exports = uploadProfilePicture;
