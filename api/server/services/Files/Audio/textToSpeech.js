const axios = require('axios');
const getCustomConfig = require('~/server/services/Config/getCustomConfig');
const { getRandomVoiceId, createChunkProcessor } = require('./streamAudio');
const { extractEnvVariable } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * getProvider function
 * This function takes the ttsSchema object and returns the name of the provider
 * If more than one provider is set or no provider is set, it throws an error
 *
 * @param {Object} ttsSchema - The TTS schema containing the provider configuration
 * @returns {string} The name of the provider
 * @throws {Error} Throws an error if multiple providers are set or no provider is set
 */
function getProvider(ttsSchema) {
  if (!ttsSchema) {
    throw new Error(`No TTS schema is set. Did you configure TTS in the custom config (librechat.yaml)?
# Example TTS configuration`);
  }
  const providers = Object.entries(ttsSchema).filter(([, value]) => Object.keys(value).length > 0);

  if (providers.length > 1) {
    throw new Error('Multiple providers are set. Please set only one provider.');
  } else if (providers.length === 0) {
    throw new Error('No provider is set. Please set a provider.');
  } else {
    return providers[0][0];
  }
}

/**
 * removeUndefined function
 * This function takes an object and removes all keys with undefined values
 * It also removes keys with empty objects as values
 *
 * @param {Object} obj - The object to be cleaned
 * @returns {void} This function does not return a value. It modifies the input object directly
 */
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
 * This function prepares the necessary data and headers for making a request to the OpenAI TTS
 * It uses the provided TTS schema, input text, and voice to create the request
 *
 * @param {Object} ttsSchema - The TTS schema containing the OpenAI configuration
 * @param {string} input - The text to be converted to speech
 * @param {string} voice - The voice to be used for the speech
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request
 * If an error occurs, it throws an error with a message indicating that the selected voice is not available
 */
function openAIProvider(ttsSchema, input, voice) {
  const url = ttsSchema.openai?.url || 'https://api.openai.com/v1/audio/speech';

  if (
    ttsSchema.openai?.voices &&
    ttsSchema.openai.voices.length > 0 &&
    !ttsSchema.openai.voices.includes(voice) &&
    !ttsSchema.openai.voices.includes('ALL')
  ) {
    throw new Error(`Voice ${voice} is not available.`);
  }

  let data = {
    input,
    model: ttsSchema.openai?.model,
    voice: ttsSchema.openai?.voices && ttsSchema.openai.voices.length > 0 ? voice : undefined,
    backend: ttsSchema.openai?.backend,
  };

  let headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + extractEnvVariable(ttsSchema.openai?.apiKey),
  };

  [data, headers].forEach(removeUndefined);

  return [url, data, headers];
}

/**
 * elevenLabsProvider function
 * This function prepares the necessary data and headers for making a request to the Eleven Labs TTS
 * It uses the provided TTS schema, input text, and voice to create the request
 *
 * @param {Object} ttsSchema - The TTS schema containing the Eleven Labs configuration
 * @param {string} input - The text to be converted to speech
 * @param {string} voice - The voice to be used for the speech
 * @param {boolean} stream - Whether to stream the audio or not
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request
 * @throws {Error} Throws an error if the selected voice is not available
 */
function elevenLabsProvider(ttsSchema, input, voice, stream) {
  let url =
    ttsSchema.elevenlabs?.url ||
    `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}${stream ? '/stream' : ''}`;

  if (
    !ttsSchema.elevenlabs?.voices.includes(voice) &&
    !ttsSchema.elevenlabs?.voices.includes('ALL')
  ) {
    throw new Error(`Voice ${voice} is not available.`);
  }

  url = url.replace('{voice_id}', voice);

  let data = {
    model_id: ttsSchema.elevenlabs?.model,
    text: input,
    // voice_id: voice,
    voice_settings: {
      similarity_boost: ttsSchema.elevenlabs?.voice_settings?.similarity_boost,
      stability: ttsSchema.elevenlabs?.voice_settings?.stability,
      style: ttsSchema.elevenlabs?.voice_settings?.style,
      use_speaker_boost: ttsSchema.elevenlabs?.voice_settings?.use_speaker_boost || undefined,
    },
    pronunciation_dictionary_locators: ttsSchema.elevenlabs?.pronunciation_dictionary_locators,
  };

  let headers = {
    'Content-Type': 'application/json',
    'xi-api-key': extractEnvVariable(ttsSchema.elevenlabs?.apiKey),
    Accept: 'audio/mpeg',
  };

  [data, headers].forEach(removeUndefined);

  return [url, data, headers];
}

/**
 * localAIProvider function
 * This function prepares the necessary data and headers for making a request to the LocalAI TTS
 * It uses the provided TTS schema, input text, and voice to create the request
 *
 * @param {Object} ttsSchema - The TTS schema containing the LocalAI configuration
 * @param {string} input - The text to be converted to speech
 * @param {string} voice - The voice to be used for the speech
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request
 * @throws {Error} Throws an error if the selected voice is not available
 */
function localAIProvider(ttsSchema, input, voice) {
  let url = ttsSchema.localai?.url;

  if (
    ttsSchema.localai?.voices &&
    ttsSchema.localai.voices.length > 0 &&
    !ttsSchema.localai.voices.includes(voice) &&
    !ttsSchema.localai.voices.includes('ALL')
  ) {
    throw new Error(`Voice ${voice} is not available.`);
  }

  let data = {
    input,
    model: ttsSchema.localai?.voices && ttsSchema.localai.voices.length > 0 ? voice : undefined,
    backend: ttsSchema.localai?.backend,
  };

  let headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + extractEnvVariable(ttsSchema.localai?.apiKey),
  };

  [data, headers].forEach(removeUndefined);

  if (extractEnvVariable(ttsSchema.localai.apiKey) === '') {
    delete headers.Authorization;
  }

  return [url, data, headers];
}

/* not used */
/*
async function streamAudioFromWebSocket(req, res) {
  const { voice } = req.body;
  const customConfig = await getCustomConfig();

  if (!customConfig) {
    return res.status(500).send('Custom config not found');
  }

  const ttsSchema = customConfig.tts;
  const provider = getProvider(ttsSchema);

  if (provider !== 'elevenlabs') {
    return res.status(400).send('WebSocket streaming is only supported for Eleven Labs');
  }

  const url =
    ttsSchema.elevenlabs.websocketUrl ||
    'wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id={model}'
      .replace('{voice_id}', voice)
      .replace('{model}', ttsSchema.elevenlabs.model);
  const ws = new WebSocket(url);

  ws.onopen = () => {
    logger.debug('WebSocket connection opened');
    sendTextToWebsocket(ws, (data) => {
      res.write(data); // Stream data directly to the response
    });
  };

  ws.onclose = () => {
    logger.debug('WebSocket connection closed');
    res.end(); // End the response when the WebSocket is closed
  };

  ws.onerror = (error) => {
    logger.error('WebSocket error:', error);
    res.status(500).send('WebSocket error');
  };
}
*/

/**
 *
 * @param {TCustomConfig} customConfig
 * @param {string} voice
 * @returns {Promise<ArrayBuffer>}
 */
async function ttsRequest(
  customConfig,
  { input, voice: _v, stream = true } = { input: '', stream: true },
) {
  const ttsSchema = customConfig.tts;
  const provider = getProvider(ttsSchema);
  const voices = ttsSchema[provider].voices.filter(
    (voice) => voice && voice.toUpperCase() !== 'ALL',
  );
  let voice = _v;
  if (!voice || !voices.includes(voice) || (voice.toUpperCase() === 'ALL' && voices.length > 1)) {
    voice = getRandomVoiceId(voices);
  }

  let [url, data, headers] = [];

  switch (provider) {
    case 'openai':
      [url, data, headers] = openAIProvider(ttsSchema, input, voice);
      break;
    case 'elevenlabs':
      [url, data, headers] = elevenLabsProvider(ttsSchema, input, voice, stream);
      break;
    case 'localai':
      [url, data, headers] = localAIProvider(ttsSchema, input, voice);
      break;
    default:
      throw new Error('Invalid provider');
  }

  if (stream) {
    return await axios.post(url, data, { headers, responseType: 'stream' });
  }

  return await axios.post(url, data, { headers, responseType: 'arraybuffer' });
}

/**
 * Handles a text-to-speech request. Extracts input and voice from the request, retrieves the TTS configuration,
 * and sends a request to the appropriate provider. The resulting audio data is sent in the response
 *
 * @param {Object} req - The request object, which should contain the input text and voice in its body
 * @param {Object} res - The response object, used to send the audio data or an error message
 *
 * @returns {Promise<void>} This function does not return a value. It sends the audio data or an error message in the response
 *
 * @throws {Error} Throws an error if the provider is invalid
 */
async function textToSpeech(req, res) {
  const { input, voice } = req.body;

  if (!input) {
    return res.status(400).send('Missing text in request body');
  }

  const customConfig = await getCustomConfig();
  if (!customConfig) {
    res.status(500).send('Custom config not found');
  }

  try {
    res.setHeader('Content-Type', 'audio/mpeg');
    const response = await ttsRequest(customConfig, { input, voice });
    response.data.pipe(res);
  } catch (error) {
    logger.error('An error occurred while creating the audio stream:', error);
    res.status(500).send('An error occurred');
  }
}

async function streamAudio(req, res) {
  res.setHeader('Content-Type', 'audio/mpeg');
  const customConfig = await getCustomConfig();
  if (!customConfig) {
    return res.status(500).send('Custom config not found');
  }

  try {
    let shouldContinue = true;
    const processChunks = createChunkProcessor(req.body.messageId);

    while (shouldContinue) {
      // example updates
      // const updates = [
      //   { text: 'This is a test.', isFinished: false },
      //   { text: 'This is only a test.', isFinished: false },
      //   { text: 'Your voice is like a combination of Fergie and Jesus!', isFinished: true },
      // ];

      const updates = await processChunks();
      if (typeof updates === 'string') {
        logger.error(`Error processing audio stream updates: ${JSON.stringify(updates)}`);
        res.status(500).end();
        return;
      }

      if (updates.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1250));
        continue;
      }

      for (const update of updates) {
        try {
          const response = await ttsRequest(customConfig, {
            input: update.text,
            stream: true,
          });

          if (!shouldContinue) {
            break;
          }

          logger.debug(`[streamAudio] user: ${req?.user?.id} | writing audio stream`);
          await new Promise((resolve) => {
            response.data.pipe(res, { end: false });
            response.data.on('end', () => {
              resolve();
            });
          });

          if (update.isFinished) {
            shouldContinue = false;
            break;
          }
        } catch (innerError) {
          logger.error('Error processing update:', update, innerError);
          if (!res.headersSent) {
            res.status(500).end();
          }
          return;
        }
      }

      if (!shouldContinue) {
        break;
      }
    }

    if (!res.headersSent) {
      res.end();
    }
  } catch (error) {
    logger.error('Failed to fetch audio:', error);
    if (!res.headersSent) {
      res.status(500).end();
    }
  }
}

module.exports = {
  textToSpeech,
  getProvider,
  streamAudio,
};
