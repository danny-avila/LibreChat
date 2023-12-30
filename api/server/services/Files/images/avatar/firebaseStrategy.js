const { ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const { getFirebaseStorage } = require('~/server/services/Files/Firebase/initialize');
const { logger } = require('~/config');

async function firebaseStrategy(userId, webPBuffer, oldUser, manual) {
  try {
    const storage = getFirebaseStorage();
    if (!storage) {
      throw new Error('Firebase is not initialized.');
    }
    const avatarRef = ref(storage, `images/${userId.toString()}/avatar`);

    await uploadBytes(avatarRef, webPBuffer);
    const urlFirebase = await getDownloadURL(avatarRef);
    const isManual = manual === 'true';

    const url = `${urlFirebase}?manual=${isManual}`;
    if (isManual) {
      oldUser.avatar = url;
      await oldUser.save();
    }
    return url;
  } catch (error) {
    logger.error('Error uploading profile picture:', error);
    throw error;
  }
}

module.exports = firebaseStrategy;
