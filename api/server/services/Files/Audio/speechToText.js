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

  const azureConfig = req.app.locals.azureOpenAI;

  let apiKey, instanceName, whisperModel, apiVersion;

  if (azureConfig) {
    const azureDetails = Object.entries(azureConfig.groupMap).reduce((acc, [, value]) => {
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

    if (azureDetails) {
      apiKey = azureDetails.apiKey;
      instanceName = azureDetails.instanceName;
      whisperModel = azureDetails.whisperModel;
      apiVersion = azureDetails.apiVersion;
    }
  }

  const resolvedApiKey = extractEnvVariable(customConfig?.stt?.apiKey);

  const url = whisperModel
    ? `https://${instanceName}.openai.azure.com/openai/deployments/${whisperModel}/audio/transcriptions?api-version=${apiVersion}`
    : customConfig?.stt?.url || 'https://api.openai.com/v1/audio/transcriptions';

  const headers = {
    'Content-Type': 'multipart/form-data',
    Authorization: 'Bearer ' + (apiKey || resolvedApiKey),
  };

  const data = {
    file: audioReadStream,
    model: customConfig?.stt?.model,
  };

  if (!Readable.from) {
    // If Readable.from is not supported
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
