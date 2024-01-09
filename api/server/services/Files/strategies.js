const { FileSources } = require('librechat-data-provider');
const { getFirebaseURL, saveURLToFirebase } = require('./Firebase');
const { getLocalFileURL, saveFileFromURL } = require('./Local');

// Firebase Strategy Functions
const firebaseStrategy = () => ({
  // saveFile:
  saveURL: saveURLToFirebase,
  getFileURL: getFirebaseURL,
});

// Local Strategy Functions
const localStrategy = () => ({
  // saveFile: ,
  saveURL: saveFileFromURL,
  getFileURL: getLocalFileURL,
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
