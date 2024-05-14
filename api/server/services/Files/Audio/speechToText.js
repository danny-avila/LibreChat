const axios = require('axios');
const { Readable } = require('stream');
const { logger } = require('~/config');
const getCustomConfig = require('~/server/services/Config/getCustomConfig');
const { extractEnvVariable } = require('librechat-data-provider');

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

function getProvider(sttSchema) {
  if (sttSchema.openai) {
    return 'openai';
  }

  throw new Error('Invalid provider');
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
 * This function prepares the necessary data and headers for making a request to the Azure API
 * It uses the provided request and audio stream to create the request
 *
 * @param {Object} req - The request object, which should contain the endpoint in its body
 * @param {Stream} audioReadStream - The audio data to be transcribed
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request
 * If an error occurs, it returns an array with three null values and logs the error with logger
 */
function azureProvider(req, audioReadStream) {
  try {
    const { endpoint } = req.body;
    const azureConfig = req.app.locals[endpoint];

    if (!azureConfig) {
      throw new Error(`No configuration found for endpoint: ${endpoint}`);
    }

    const { apiKey, instanceName, whisperModel, apiVersion } = Object.entries(
      azureConfig.groupMap,
    ).reduce((acc, [, value]) => {
      if (acc) {
        return acc;
      }

      const whisperKey = Object.keys(value.models).find((modelKey) =>
        modelKey.startsWith('whisper'),
      );

      if (whisperKey) {
        return {
          apiVersion: value.version,
          apiKey: value.apiKey,
          instanceName: value.instanceName,
          whisperModel: value.models[whisperKey]['deploymentName'],
        };
      }

      return null;
    }, null);

    if (!apiKey || !instanceName || !whisperModel || !apiVersion) {
      throw new Error('Required Azure configuration values are missing');
    }

    const baseURL = `https://${instanceName}.openai.azure.com`;

    const url = `${baseURL}/openai/deployments/${whisperModel}/audio/transcriptions?api-version=${apiVersion}`;

    let data = {
      file: audioReadStream,
      filename: 'audio.wav',
      contentType: 'audio/wav',
      knownLength: audioReadStream.length,
    };

    const headers = {
      ...data.getHeaders(),
      'Content-Type': 'multipart/form-data',
      'api-key': apiKey,
    };

    return [url, data, headers];
  } catch (error) {
    logger.error('An error occurred while preparing the Azure API STT request: ', error);
    return [null, null, null];
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

  const provider = getProvider(customConfig.stt);

  let [url, data, headers] = [];

  switch (provider) {
    case 'openai':
      [url, data, headers] = openAIProvider(customConfig.stt, audioReadStream);
      break;
    case 'azure':
      [url, data, headers] = azureProvider(req, audioReadStream);
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
