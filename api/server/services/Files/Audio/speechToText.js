const { Readable } = require('stream');
const axios = require('axios');
const { extractEnvVariable, STTProviders } = require('librechat-data-provider');
const getCustomConfig = require('~/server/services/Config/getCustomConfig');
const { genAzureEndpoint } = require('~/utils');
const { logger } = require('~/config');

/**
 * Handle the response from the STT API
 * @param {Object} response - The response from the STT API
 *
 * @returns {string} The text from the response data
 *
 * @throws Will throw an error if the response status is not 200 or the response data is missing
 */
async function handleResponse(response) {
  if (response.status !== 200) {
    throw new Error('Invalid response from the STT API');
  }

  if (!response.data || !response.data.text) {
    throw new Error('Missing data in response from the STT API');
  }

  return response.data.text.trim();
}

/**
 * getProviderSchema function
 * This function takes the customConfig object and returns the name of the provider and its schema
 * If more than one provider is set or no provider is set, it throws an error
 *
 * @param {Object} customConfig - The custom configuration containing the STT schema
 * @returns {Promise<[string, Object]>} The name of the provider and its schema
 * @throws {Error} Throws an error if multiple providers are set or no provider is set
 */
async function getProviderSchema(customConfig) {
  const sttSchema = customConfig.speech.stt;

  if (!sttSchema) {
    throw new Error(`No STT schema is set. Did you configure STT in the custom config (librechat.yaml)?
    
    https://www.librechat.ai/docs/configuration/stt_tts#stt`);
  }

  const providers = Object.entries(sttSchema).filter(([, value]) => Object.keys(value).length > 0);

  if (providers.length > 1) {
    throw new Error('Multiple providers are set. Please set only one provider.');
  } else if (providers.length === 0) {
    throw new Error('No provider is set. Please set a provider.');
  } else {
    const provider = providers[0][0];
    return [provider, sttSchema[provider]];
  }
}

function removeUndefined(obj) {
  Object.keys(obj).forEach((key) => {
    if (obj[key] && typeof obj[key] === 'object') {
      removeUndefined(obj[key]);
      if (Object.keys(obj[key]).length === 0) {
        delete obj[key];
      }
    } else if (obj[key] === undefined) {
      delete obj[key];
    }
  });
}

/**
 * This function prepares the necessary data and headers for making a request to the OpenAI API
 * It uses the provided speech-to-text schema and audio stream to create the request
 *
 * @param {Object} sttSchema - The speech-to-text schema containing the OpenAI configuration
 * @param {Stream} audioReadStream - The audio data to be transcribed
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request
 * If an error occurs, it returns an array with three null values and logs the error with logger
 */
function openAIProvider(sttSchema, audioReadStream) {
  try {
    const url = sttSchema.openai?.url || 'https://api.openai.com/v1/audio/transcriptions';
    const apiKey = sttSchema.openai.apiKey ? extractEnvVariable(sttSchema.openai.apiKey) : '';

    let data = {
      file: audioReadStream,
      model: sttSchema.openai.model,
    };

    let headers = {
      'Content-Type': 'multipart/form-data',
    };

    [headers].forEach(removeUndefined);

    if (apiKey) {
      headers.Authorization = 'Bearer ' + apiKey;
    }

    return [url, data, headers];
  } catch (error) {
    logger.error('An error occurred while preparing the OpenAI API STT request: ', error);
    return [null, null, null];
  }
}

/**
 * Prepares the necessary data and headers for making a request to the Azure API.
 * It uses the provided Speech-to-Text (STT) schema and audio file to create the request.
 *
 * @param {Object} sttSchema - The STT schema object, which should contain instanceName, deploymentName, apiVersion, and apiKey.
 * @param {Buffer} audioBuffer - The audio data to be transcribed
 * @param {Object} audioFile - The audio file object, which should contain originalname, mimetype, and size.
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request.
 * If an error occurs, it logs the error with logger and returns an array with three null values.
 */
function azureOpenAIProvider(sttSchema, audioBuffer, audioFile) {
  try {
    const instanceName = sttSchema?.instanceName;
    const deploymentName = sttSchema?.deploymentName;
    const apiVersion = sttSchema?.apiVersion;

    const url =
      genAzureEndpoint({
        azureOpenAIApiInstanceName: instanceName,
        azureOpenAIApiDeploymentName: deploymentName,
      }) +
      '/audio/transcriptions?api-version=' +
      apiVersion;

    const apiKey = sttSchema.apiKey ? extractEnvVariable(sttSchema.apiKey) : '';

    if (audioBuffer.byteLength > 25 * 1024 * 1024) {
      throw new Error('The audio file size exceeds the limit of 25MB');
    }
    const acceptedFormats = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'];
    const fileFormat = audioFile.mimetype.split('/')[1];
    if (!acceptedFormats.includes(fileFormat)) {
      throw new Error(`The audio file format ${fileFormat} is not accepted`);
    }

    const formData = new FormData();

    const audioBlob = new Blob([audioBuffer], { type: audioFile.mimetype });

    formData.append('file', audioBlob, audioFile.originalname);

    let data = formData;

    let headers = {
      'Content-Type': 'multipart/form-data',
    };

    [headers].forEach(removeUndefined);

    if (apiKey) {
      headers['api-key'] = apiKey;
    }

    return [url, data, headers];
  } catch (error) {
    logger.error('An error occurred while preparing the Azure OpenAI API STT request: ', error);
    throw error;
  }
}

/**
 * Convert speech to text
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 *
 * @returns {Object} The response object with the text from the STT API
 *
 * @throws Will throw an error if an error occurs while processing the audio
 */

async function speechToText(req, res) {
  const customConfig = await getCustomConfig();
  if (!customConfig) {
    return res.status(500).send('Custom config not found');
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'No audio file provided in the FormData' });
  }

  const audioBuffer = req.file.buffer;
  const audioReadStream = Readable.from(audioBuffer);
  audioReadStream.path = 'audio.wav';

  const [provider, sttSchema] = await getProviderSchema(customConfig);

  let [url, data, headers] = [];

  switch (provider) {
    case STTProviders.OPENAI:
      [url, data, headers] = openAIProvider(sttSchema, audioReadStream);
      break;
    case STTProviders.AZURE_OPENAI:
      [url, data, headers] = azureOpenAIProvider(sttSchema, audioBuffer, req.file);
      break;
    default:
      throw new Error('Invalid provider');
  }

  if (!Readable.from) {
    const audioBlob = new Blob([audioBuffer], { type: req.file.mimetype });
    delete data['file'];
    data['file'] = audioBlob;
  }

  try {
    const response = await axios.post(url, data, { headers: headers });
    const text = await handleResponse(response);

    res.json({ text });
  } catch (error) {
    logger.error('An error occurred while processing the audio:', error);
    res.sendStatus(500);
  }
}

module.exports = speechToText;
