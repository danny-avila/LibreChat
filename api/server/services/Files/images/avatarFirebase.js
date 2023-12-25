const { storage, ref, uploadBytes, getDownloadURL } = require('./firebase');

async function saveToFirebase(userId, webPBuffer, oldUser, manual) {
  try {
    const avatarRef = ref(storage, `users/${userId.toString()}/avatar`);

    await uploadBytes(avatarRef, webPBuffer);

    const urlFirebase = await getDownloadURL(avatarRef);

    if (manual === 'true') {
      const url = `${urlFirebase}?manual=true`;
      oldUser.avatar = url;
      await oldUser.save();
      return url;
    } else {
      const url = `${urlFirebase}?manual=false`;
      return url;
    }
  } catch (error) {
    console.error('Error uploading profile picture:', error.message);
    throw error;
  }
}

module.exports = { saveToFirebase };
