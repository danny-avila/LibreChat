const { FileSources } = require('librechat-data-provider');
const {
  getFirebaseURL,
  prepareImageURL,
  saveURLToFirebase,
  deleteFirebaseFile,
  uploadImageToFirebase,
  processFirebaseAvatar,
} = require('./Firebase');
const {
  getLocalFileURL,
  saveFileFromURL,
  deleteLocalFile,
  uploadLocalImage,
  prepareImagesLocal,
  processLocalAvatar,
} = require('./Local');

// Firebase Strategy Functions
const firebaseStrategy = () => ({
  // saveFile:
  saveURL: saveURLToFirebase,
  getFileURL: getFirebaseURL,
  deleteFile: deleteFirebaseFile,
  prepareImagePayload: prepareImageURL,
  processAvatar: processFirebaseAvatar,
  handleImageUpload: uploadImageToFirebase,
});

// Local Strategy Functions
const localStrategy = () => ({
  // saveFile: ,
  saveURL: saveFileFromURL,
  getFileURL: getLocalFileURL,
  deleteFile: deleteLocalFile,
  processAvatar: processLocalAvatar,
  handleImageUpload: uploadLocalImage,
  prepareImagePayload: prepareImagesLocal,
});

// Strategy Selector
const getStrategyFunctions = (fileSource) => {
  if (fileSource === FileSources.firebase) {
    return firebaseStrategy();
  } else if (fileSource === FileSources.local) {
    return localStrategy();
  } else {
    throw new Error('Invalid file source');
  }
};

module.exports = {
  getStrategyFunctions,
};
