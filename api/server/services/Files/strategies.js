const { FileSources } = require('librechat-data-provider');
const {
  getFirebaseURL,
  prepareImageURL,
  saveURLToFirebase,
  deleteFirebaseFile,
  saveBufferToFirebase,
  uploadImageToFirebase,
  processFirebaseAvatar,
} = require('./Firebase');
const {
  // saveLocalFile,
  getLocalFileURL,
  saveFileFromURL,
  saveLocalBuffer,
  deleteLocalFile,
  uploadLocalImage,
  prepareImagesLocal,
  processLocalAvatar,
} = require('./Local');
const { uploadOpenAIFile, deleteOpenAIFile } = require('./OpenAI');

// Firebase Strategy Functions
const firebaseStrategy = () => ({
  // saveFile:
  saveURL: saveURLToFirebase,
  getFileURL: getFirebaseURL,
  deleteFile: deleteFirebaseFile,
  saveBuffer: saveBufferToFirebase,
  prepareImagePayload: prepareImageURL,
  processAvatar: processFirebaseAvatar,
  handleImageUpload: uploadImageToFirebase,
});

// Local Strategy Functions
const localStrategy = () => ({
  // saveFile: saveLocalFile,
  saveURL: saveFileFromURL,
  getFileURL: getLocalFileURL,
  saveBuffer: saveLocalBuffer,
  deleteFile: deleteLocalFile,
  processAvatar: processLocalAvatar,
  handleImageUpload: uploadLocalImage,
  prepareImagePayload: prepareImagesLocal,
});

// OpenAI Strategy Functions
const openAIStrategy = () => ({
  saveURL: null,
  getFileURL: null,
  saveBuffer: null,
  processAvatar: null,
  handleImageUpload: null,
  prepareImagePayload: null,
  deleteFile: deleteOpenAIFile,
  handleFileUpload: uploadOpenAIFile,
});

// Strategy Selector
const getStrategyFunctions = (fileSource) => {
  if (fileSource === FileSources.firebase) {
    return firebaseStrategy();
  } else if (fileSource === FileSources.local) {
    return localStrategy();
  } else if (fileSource === FileSources.openai) {
    return openAIStrategy();
  } else {
    throw new Error('Invalid file source');
  }
};

module.exports = {
  getStrategyFunctions,
};
