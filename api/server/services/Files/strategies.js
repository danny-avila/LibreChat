const { FileSources } = require('librechat-data-provider');
const {
  getFirebaseURL,
  prepareImageURL,
  saveURLToFirebase,
  deleteFirebaseFile,
  saveBufferToFirebase,
  uploadFileToFirebase,
  uploadImageToFirebase,
  processFirebaseAvatar,
  getFirebaseFileStream,
} = require('./Firebase');
const {
  uploadLocalFile,
  getLocalFileURL,
  saveFileFromURL,
  saveLocalBuffer,
  deleteLocalFile,
  uploadLocalImage,
  prepareImagesLocal,
  processLocalAvatar,
  getLocalFileStream,
} = require('./Local');
const {
  getS3URL,
  saveURLToS3,
  saveBufferToS3,
  getS3FileStream,
  uploadImageToS3,
  prepareImageURLS3,
  deleteFileFromS3,
  processS3Avatar,
  uploadFileToS3,
} = require('./S3');
const { uploadOpenAIFile, deleteOpenAIFile, getOpenAIFileStream } = require('./OpenAI');
const { getCodeOutputDownloadStream, uploadCodeEnvFile } = require('./Code');
const { uploadVectors, deleteVectors } = require('./VectorDB');
const { uploadMistralOCR } = require('./MistralOCR');

// Import Azure functions
const {
  saveBufferToAzure,
  saveURLToAzure,
  getAzureURL,
  deleteFileFromAzure,
  uploadFileToAzure,
  getAzureFileStream,
  uploadImageToAzure,
  prepareAzureImageURL,
  processAzureAvatar,
} = require('./Azure');

/**
 * Firebase Storage Strategy Functions
 */
const firebaseStrategy = () => ({
  handleFileUpload: uploadFileToFirebase,
  saveURL: saveURLToFirebase,
  getFileURL: getFirebaseURL,
  deleteFile: deleteFirebaseFile,
  saveBuffer: saveBufferToFirebase,
  prepareImagePayload: prepareImageURL,
  processAvatar: processFirebaseAvatar,
  handleImageUpload: uploadImageToFirebase,
  getDownloadStream: getFirebaseFileStream,
});

/**
 * Local Server Storage Strategy Functions
 */
const localStrategy = () => ({
  handleFileUpload: uploadLocalFile,
  saveURL: saveFileFromURL,
  getFileURL: getLocalFileURL,
  saveBuffer: saveLocalBuffer,
  deleteFile: deleteLocalFile,
  processAvatar: processLocalAvatar,
  handleImageUpload: uploadLocalImage,
  prepareImagePayload: prepareImagesLocal,
  getDownloadStream: getLocalFileStream,
});

/**
 * S3 Storage Strategy Functions
 * */
const s3Strategy = () => ({
  handleFileUpload: uploadFileToS3,
  saveURL: saveURLToS3,
  getFileURL: getS3URL,
  deleteFile: deleteFileFromS3,
  saveBuffer: saveBufferToS3,
  prepareImagePayload: prepareImageURLS3,
  processAvatar: processS3Avatar,
  handleImageUpload: uploadImageToS3,
  getDownloadStream: getS3FileStream,
});

/**
 * Azure Blob Storage Strategy Functions
 */
const azureStrategy = () => ({
  handleFileUpload: uploadFileToAzure,
  saveURL: saveURLToAzure,
  getFileURL: getAzureURL,
  deleteFile: deleteFileFromAzure,
  saveBuffer: saveBufferToAzure,
  prepareImagePayload: prepareAzureImageURL,
  processAvatar: processAzureAvatar,
  handleImageUpload: uploadImageToAzure,
  getDownloadStream: getAzureFileStream,
 });

/**
 * VectorDB Storage Strategy Functions
 */
const vectorStrategy = () => ({
  /** @type {typeof saveFileFromURL | null} */
  saveURL: null,
  /** @type {typeof getLocalFileURL | null} */
  getFileURL: null,
  /** @type {typeof saveLocalBuffer | null} */
  saveBuffer: null,
  /** @type {typeof processLocalAvatar | null} */
  processAvatar: null,
  /** @type {typeof uploadLocalImage | null} */
  handleImageUpload: null,
  /** @type {typeof prepareImagesLocal | null} */
  prepareImagePayload: null,
  /** @type {typeof getLocalFileStream | null} */
  getDownloadStream: null,
  handleFileUpload: uploadVectors,
  deleteFile: deleteVectors,
});

/**
 * OpenAI Strategy Functions
 *
 * Note: null values mean that the strategy is not supported.
 */
const openAIStrategy = () => ({
  /** @type {typeof saveFileFromURL | null} */
  saveURL: null,
  /** @type {typeof getLocalFileURL | null} */
  getFileURL: null,
  /** @type {typeof saveLocalBuffer | null} */
  saveBuffer: null,
  /** @type {typeof processLocalAvatar | null} */
  processAvatar: null,
  /** @type {typeof uploadLocalImage | null} */
  handleImageUpload: null,
  /** @type {typeof prepareImagesLocal | null} */
  prepareImagePayload: null,
  deleteFile: deleteOpenAIFile,
  handleFileUpload: uploadOpenAIFile,
  getDownloadStream: getOpenAIFileStream,
});

/**
 * Code Output Strategy Functions
 *
 * Note: null values mean that the strategy is not supported.
 */
const codeOutputStrategy = () => ({
  /** @type {typeof saveFileFromURL | null} */
  saveURL: null,
  /** @type {typeof getLocalFileURL | null} */
  getFileURL: null,
  /** @type {typeof saveLocalBuffer | null} */
  saveBuffer: null,
  /** @type {typeof processLocalAvatar | null} */
  processAvatar: null,
  /** @type {typeof uploadLocalImage | null} */
  handleImageUpload: null,
  /** @type {typeof prepareImagesLocal | null} */
  prepareImagePayload: null,
  /** @type {typeof deleteLocalFile | null} */
  deleteFile: null,
  handleFileUpload: uploadCodeEnvFile,
  getDownloadStream: getCodeOutputDownloadStream,
});

const mistralOCRStrategy = () => ({
  /** @type {typeof saveFileFromURL | null} */
  saveURL: null,
  /** @type {typeof getLocalFileURL | null} */
  getFileURL: null,
  /** @type {typeof saveLocalBuffer | null} */
  saveBuffer: null,
  /** @type {typeof processLocalAvatar | null} */
  processAvatar: null,
  /** @type {typeof uploadLocalImage | null} */
  handleImageUpload: null,
  /** @type {typeof prepareImagesLocal | null} */
  prepareImagePayload: null,
  /** @type {typeof deleteLocalFile | null} */
  deleteFile: null,
  /** @type {typeof getLocalFileStream | null} */
  getDownloadStream: null,
  handleFileUpload: uploadMistralOCR,
});

// Strategy Selector
const getStrategyFunctions = (fileSource) => {
  if (fileSource === FileSources.firebase) {
    return firebaseStrategy();
  } else if (fileSource === FileSources.local) {
    return localStrategy();
  } else if (fileSource === FileSources.openai) {
    return openAIStrategy();
  } else if (fileSource === FileSources.azure) {
    return azureStrategy();
  } else if (fileSource === FileSources.vectordb) {
    return vectorStrategy();
  } else if (fileSource === FileSources.s3) {
    return s3Strategy();
  } else if (fileSource === FileSources.execute_code) {
    return codeOutputStrategy();
  } else if (fileSource === FileSources.mistral_ocr) {
    return mistralOCRStrategy();
  } else {
    throw new Error('Invalid file source');
  }
};

module.exports = {
  getStrategyFunctions,
};
