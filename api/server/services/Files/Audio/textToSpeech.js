const axios = require('axios');
const { extractEnvVariable, TTSProviders } = require('librechat-data-provider');
const { logger } = require('~/config');
const getCustomConfig = require('~/server/services/Config/getCustomConfig');
const { genAzureEndpoint } = require('~/utils');
const { getRandomVoiceId, createChunkProcessor, splitTextIntoChunks } = require('./streamAudio');

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
    
    https://www.librechat.ai/docs/configuration/stt_tts#tts`);
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
 * @param {TCustomConfig['tts']['openai']} ttsSchema - The TTS schema containing the OpenAI configuration
 * @param {string} input - The text to be converted to speech
 * @param {string} voice - The voice to be used for the speech
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request
 * If an error occurs, it throws an error with a message indicating that the selected voice is not available
 */
function openAIProvider(ttsSchema, input, voice) {
  const url = ttsSchema?.url || 'https://api.openai.com/v1/audio/speech';

  if (
    ttsSchema?.voices &&
    ttsSchema.voices.length > 0 &&
    !ttsSchema.voices.includes(voice) &&
    !ttsSchema.voices.includes('ALL')
  ) {
    throw new Error(`Voice ${voice} is not available.`);
  }

  let data = {
    input,
    model: ttsSchema?.model,
    voice: ttsSchema?.voices && ttsSchema.voices.length > 0 ? voice : undefined,
    backend: ttsSchema?.backend,
  };

  let headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + extractEnvVariable(ttsSchema?.apiKey),
  };

  [data, headers].forEach(removeUndefined);

  return [url, data, headers];
}

/**
 * Generates the necessary parameters for making a request to Azure's OpenAI Text-to-Speech API.
 *
 * @param {TCustomConfig['tts']['azureOpenAI']} ttsSchema - The TTS schema containing the AzureOpenAI configuration
 * @param {string} input - The text to be converted to speech
 * @param {string} voice - The voice to be used for the speech
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request
 * If an error occurs, it throws an error with a message indicating that the selected voice is not available
 */
function azureOpenAIProvider(ttsSchema, input, voice) {
  const instanceName = ttsSchema?.instanceName;
  const deploymentName = ttsSchema?.deploymentName;
  const apiVersion = ttsSchema?.apiVersion;

  const url =
    genAzureEndpoint({
      azureOpenAIApiInstanceName: instanceName,
      azureOpenAIApiDeploymentName: deploymentName,
    }) +
    '/audio/speech?api-version=' +
    apiVersion;

  const apiKey = ttsSchema.apiKey ? extractEnvVariable(ttsSchema.apiKey) : '';

  if (
    ttsSchema?.voices &&
    ttsSchema.voices.length > 0 &&
    !ttsSchema.voices.includes(voice) &&
    !ttsSchema.voices.includes('ALL')
  ) {
    throw new Error(`Voice ${voice} is not available.`);
  }

  let data = {
    model: ttsSchema?.model,
    input,
    voice: ttsSchema?.voices && ttsSchema.voices.length > 0 ? voice : undefined,
  };

  let headers = {
    'Content-Type': 'application/json',
  };

  [data, headers].forEach(removeUndefined);

  if (apiKey) {
    headers['api-key'] = apiKey;
  }

  return [url, data, headers];
}

/**
 * elevenLabsProvider function
 * This function prepares the necessary data and headers for making a request to the Eleven Labs TTS
 * It uses the provided TTS schema, input text, and voice to create the request
 *
 * @param {TCustomConfig['tts']['elevenLabs']} ttsSchema - The TTS schema containing the Eleven Labs configuration
 * @param {string} input - The text to be converted to speech
 * @param {string} voice - The voice to be used for the speech
 * @param {boolean} stream - Whether to stream the audio or not
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request
 * @throws {Error} Throws an error if the selected voice is not available
 */
function elevenLabsProvider(ttsSchema, input, voice, stream) {
  let url =
    ttsSchema?.url ||
    `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}${stream ? '/stream' : ''}`;

  if (!ttsSchema?.voices.includes(voice) && !ttsSchema?.voices.includes('ALL')) {
    throw new Error(`Voice ${voice} is not available.`);
  }

  url = url.replace('{voice_id}', voice);

  let data = {
    model_id: ttsSchema?.model,
    text: input,
    // voice_id: voice,
    voice_settings: {
      similarity_boost: ttsSchema?.voice_settings?.similarity_boost,
      stability: ttsSchema?.voice_settings?.stability,
      style: ttsSchema?.voice_settings?.style,
      use_speaker_boost: ttsSchema?.voice_settings?.use_speaker_boost || undefined,
    },
    pronunciation_dictionary_locators: ttsSchema?.pronunciation_dictionary_locators,
  };

  let headers = {
    'Content-Type': 'application/json',
    'xi-api-key': extractEnvVariable(ttsSchema?.apiKey),
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
 * @param {TCustomConfig['tts']['localai']} ttsSchema - The TTS schema containing the LocalAI configuration
 * @param {string} input - The text to be converted to speech
 * @param {string} voice - The voice to be used for the speech
 *
 * @returns {Array} An array containing the URL for the API request, the data to be sent, and the headers for the request
 * @throws {Error} Throws an error if the selected voice is not available
 */
function localAIProvider(ttsSchema, input, voice) {
  let url = ttsSchema?.url;

  if (
    ttsSchema?.voices &&
    ttsSchema.voices.length > 0 &&
    !ttsSchema.voices.includes(voice) &&
    !ttsSchema.voices.includes('ALL')
  ) {
    throw new Error(`Voice ${voice} is not available.`);
  }

  let data = {
    input,
    model: ttsSchema?.voices && ttsSchema.voices.length > 0 ? voice : undefined,
    backend: ttsSchema?.backend,
  };

  let headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + extractEnvVariable(ttsSchema?.apiKey),
  };

  [data, headers].forEach(removeUndefined);

  if (extractEnvVariable(ttsSchema.apiKey) === '') {
    delete headers.Authorization;
  }

  return [url, data, headers];
}

/**
 *
 * Returns provider and its schema for use with TTS requests
 * @param {TCustomConfig} customConfig
 * @param {string} _voice
 * @returns {Promise<[string, TProviderSchema]>}
 */
async function getProviderSchema(customConfig) {
  const provider = getProvider(customConfig.speech.tts);
  return [provider, customConfig.speech.tts[provider]];
}

/**
 *
 * Returns a tuple of the TTS schema as well as the voice for the TTS request
 * @param {TProviderSchema} providerSchema
 * @param {string} requestVoice
 * @returns {Promise<string>}
 */
async function getVoice(providerSchema, requestVoice) {
  const voices = providerSchema.voices.filter((voice) => voice && voice.toUpperCase() !== 'ALL');
  let voice = requestVoice;
  if (!voice || !voices.includes(voice) || (voice.toUpperCase() === 'ALL' && voices.length > 1)) {
    voice = getRandomVoiceId(voices);
  }

  return voice;
}

/**
 *
 * @param {string} provider
 * @param {TProviderSchema} ttsSchema
 * @param {object} params
 * @param {string} params.voice
 * @param {string} params.input
 * @param {boolean} [params.stream]
 * @returns {Promise<ArrayBuffer>}
 */
async function ttsRequest(provider, ttsSchema, { input, voice, stream = true } = { stream: true }) {
  let [url, data, headers] = [];
  switch (provider) {
    case TTSProviders.OPENAI:
      [url, data, headers] = openAIProvider(ttsSchema, input, voice);
      break;
    case TTSProviders.AZURE_OPENAI:
      [url, data, headers] = azureOpenAIProvider(ttsSchema, input, voice);
      break;
    case TTSProviders.ELEVENLABS:
      [url, data, headers] = elevenLabsProvider(ttsSchema, input, voice, stream);
      break;
    case TTSProviders.LOCALAI:
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
  const { input } = req.body;

  if (!input) {
    return res.status(400).send('Missing text in request body');
  }

  const customConfig = await getCustomConfig();
  if (!customConfig) {
    res.status(500).send('Custom config not found');
  }

  try {
    res.setHeader('Content-Type', 'audio/mpeg');
    const [provider, ttsSchema] = await getProviderSchema(customConfig);
    const voice = await getVoice(ttsSchema, req.body.voice);
    if (input.length < 4096) {
      const response = await ttsRequest(provider, ttsSchema, { input, voice });
      response.data.pipe(res);
      return;
    }

    const textChunks = splitTextIntoChunks(input, 1000);

    for (const chunk of textChunks) {
      try {
        const response = await ttsRequest(provider, ttsSchema, {
          voice,
          input: chunk.text,
          stream: true,
        });

        logger.debug(`[textToSpeech] user: ${req?.user?.id} | writing audio stream`);
        await new Promise((resolve) => {
          response.data.pipe(res, { end: chunk.isFinished });
          response.data.on('end', () => {
            resolve();
          });
        });

        if (chunk.isFinished) {
          break;
        }
      } catch (innerError) {
        logger.error('Error processing manual update:', chunk, innerError);
        if (!res.headersSent) {
          res.status(500).end();
        }
        return;
      }
    }

    if (!res.headersSent) {
      res.end();
    }
  } catch (error) {
    logger.error(
      'Error creating the audio stream. Suggestion: check your provider quota. Error:',
      error,
    );
    res.status(500).send('An error occurred');
  }
}

async function streamAudio(req, res) {
  res.setHeader('Content-Type', 'audio/mpeg');
  const customConfig = await getCustomConfig();
  if (!customConfig) {
    return res.status(500).send('Custom config not found');
  }

  const [provider, ttsSchema] = await getProviderSchema(customConfig);
  const voice = await getVoice(ttsSchema, req.body.voice);

  try {
    let shouldContinue = true;

    req.on('close', () => {
      logger.warn('[streamAudio] Audio Stream Request closed by client');
      shouldContinue = false;
    });

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
          const response = await ttsRequest(provider, ttsSchema, {
            voice,
            input: update.text,
            stream: true,
          });

          if (!shouldContinue) {
            break;
          }

          logger.debug(`[streamAudio] user: ${req?.user?.id} | writing audio stream`);
          await new Promise((resolve) => {
            response.data.pipe(res, { end: update.isFinished });
            response.data.on('end', () => {
              resolve();
            });
          });

          if (update.isFinished) {
            shouldContinue = false;
            break;
          }
        } catch (innerError) {
          logger.error('Error processing audio stream update:', update, innerError);
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
