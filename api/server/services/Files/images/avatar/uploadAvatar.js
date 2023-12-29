const sharp = require('sharp');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const User = require('~/models/User');
const { getFirebaseStorage } = require('~/server/services/Files/Firebase/initialize');
const firebaseStrategy = require('./firebaseStrategy');
const localStrategy = require('./localStrategy');
const { logger } = require('~/config');

async function convertToWebP(inputBuffer) {
  return sharp(inputBuffer).resize({ width: 150 }).toFormat('webp').toBuffer();
}

async function uploadAvatar(userId, input, manual) {
  try {
    if (userId === undefined) {
      throw new Error('User ID is undefined');
    }
    const _id = userId;
    // TODO: remove direct use of Model, `User`
    const oldUser = await User.findOne({ _id });
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
    const storage = getFirebaseStorage();
    if (storage) {
      const url = await firebaseStrategy(userId, webPBuffer, oldUser, manual);
      return url;
    }

    const url = await localStrategy(userId, webPBuffer, oldUser, manual);
    return url;
  } catch (error) {
    logger.error('Error uploading the avatar:', error);
    throw error;
  }
}

module.exports = uploadAvatar;
