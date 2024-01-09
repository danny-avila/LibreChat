const { FileSources } = require('librechat-data-provider');
const {
  getFirebaseURL,
  saveURLToFirebase,
  deleteFirebaseFile,
  uploadImageToFirebase,
} = require('./Firebase');
const { getLocalFileURL, saveFileFromURL, deleteLocalFile, uploadLocalImage } = require('./Local');

// Firebase Strategy Functions
const firebaseStrategy = () => ({
  // saveFile:
  saveURL: saveURLToFirebase,
  getFileURL: getFirebaseURL,
  deleteFile: deleteFirebaseFile,
  handleImageUpload: uploadImageToFirebase,
});

// Local Strategy Functions
const localStrategy = () => ({
  // saveFile: ,
  saveURL: saveFileFromURL,
  getFileURL: getLocalFileURL,
  deleteFile: deleteLocalFile,
  handleImageUpload: uploadLocalImage,
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
