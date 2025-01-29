const axios = require('axios');
const { createClient } = require('@deepgram/sdk');
const { extractEnvVariable, TTSProviders } = require('librechat-data-provider');
const { getRandomVoiceId, createChunkProcessor, splitTextIntoChunks } = require('./streamAudio');
const { getCustomConfig } = require('~/server/services/Config');
const { genAzureEndpoint } = require('~/utils');
const { logger } = require('~/config');
const { Readable } = require('stream');

/**
 * Service class for handling Text-to-Speech (TTS) operations.
 * @class
 */
class TTSService {
  /**
   * Creates an instance of TTSService.
   * @param {Object} customConfig - The custom configuration object.
   */
  constructor(customConfig) {
    this.customConfig = customConfig;
    this.apiStrategies = {
      [TTSProviders.OPENAI]: this.openAIProvider.bind(this),
      [TTSProviders.AZURE_OPENAI]: this.azureOpenAIProvider.bind(this),
      [TTSProviders.ELEVENLABS]: this.elevenLabsProvider.bind(this),
      [TTSProviders.LOCALAI]: this.localAIProvider.bind(this),
    };

    this.sdkStrategies = {
      [TTSProviders.DEEPGRAM]: this.deepgramSDKProvider.bind(this),
    };
  }

  /**
   * Creates a singleton instance of TTSService.
   * @static
   * @async
   * @returns {Promise<TTSService>} The TTSService instance.
   * @throws {Error} If the custom config is not found.
   */
  static async getInstance() {
    const customConfig = await getCustomConfig();
    if (!customConfig) {
      throw new Error('Custom config not found');
    }
    return new TTSService(customConfig);
  }

  /**
   * Retrieves the configured TTS provider.
   * @returns {string} The name of the configured provider.
   * @throws {Error} If no provider is set or multiple providers are set.
   */
  getProvider() {
    const ttsSchema = this.customConfig.speech.tts;
    if (!ttsSchema) {
      throw new Error(
        'No TTS schema is set. Did you configure TTS in the custom config (librechat.yaml)?',
      );
    }
    const providers = Object.entries(ttsSchema).filter(
      ([, value]) => Object.keys(value).length > 0,
    );

    if (providers.length !== 1) {
      throw new Error(
        providers.length > 1
          ? 'Multiple providers are set. Please set only one provider.'
          : 'No provider is set. Please set a provider.',
      );
    }
    return providers[0][0];
  }

  /**
   * Selects a voice for TTS based on provider schema and request.
   * @async
   * @param {Object} providerSchema - The schema for the selected provider.
   * @param {string} requestVoice - The requested voice.
   * @returns {Promise<string>} The selected voice.
   */
  async getVoice(providerSchema, requestVoice) {
    const voices = providerSchema.voices.filter((voice) => voice && voice.toUpperCase() !== 'ALL');
    let voice = requestVoice;
    if (!voice || !voices.includes(voice) || (voice.toUpperCase() === 'ALL' && voices.length > 1)) {
      voice = getRandomVoiceId(voices);
    }
    return voice;
  }

  /**
   * Recursively removes undefined properties from an object.
   * @param {Object} obj - The object to clean.
   */
  removeUndefined(obj) {
    Object.keys(obj).forEach((key) => {
      if (obj[key] && typeof obj[key] === 'object') {
        this.removeUndefined(obj[key]);
        if (Object.keys(obj[key]).length === 0) {
          delete obj[key];
        }
      } else if (obj[key] === undefined) {
        delete obj[key];
      }
    });
  }

  /**
   * Prepares the request for OpenAI TTS provider.
   * @param {Object} ttsSchema - The TTS schema for OpenAI.
   * @param {string} input - The input text.
   * @param {string} voice - The selected voice.
   * @returns {Array} An array containing the URL, data, and headers for the request.
   * @throws {Error} If the selected voice is not available.
   */
  openAIProvider(ttsSchema, input, voice) {
    const url = ttsSchema?.url || 'https://api.openai.com/v1/audio/speech';

    if (ttsSchema?.voices && ttsSchema.voices.length > 0 && !ttsSchema.voices.includes(voice)) {
      throw new Error(`Voice ${voice} is not available.`);
    }

    const data = {
      input,
      model: ttsSchema?.model,
      voice: voice,
      backend: ttsSchema?.backend,
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `${
        ttsSchema.apiKey ? 'Bearer ' + extractEnvVariable(ttsSchema.apiKey) : undefined
      }`,
    };

    return [url, data, headers];
  }

  /**
   * Prepares the request for Azure OpenAI TTS provider.
   * @param {Object} ttsSchema - The TTS schema for Azure OpenAI.
   * @param {string} input - The input text.
   * @param {string} voice - The selected voice.
   * @returns {Array} An array containing the URL, data, and headers for the request.
   * @throws {Error} If the selected voice is not available.
   */
  azureOpenAIProvider(ttsSchema, input, voice) {
    const url = `${genAzureEndpoint({
      azureOpenAIApiInstanceName: extractEnvVariable(ttsSchema?.instanceName),
      azureOpenAIApiDeploymentName: extractEnvVariable(ttsSchema?.deploymentName),
    })}/audio/speech?api-version=${extractEnvVariable(ttsSchema?.apiVersion)}`;

    if (ttsSchema?.voices && ttsSchema.voices.length > 0 && !ttsSchema.voices.includes(voice)) {
      throw new Error(`Voice ${voice} is not available.`);
    }

    const data = {
      model: extractEnvVariable(ttsSchema?.model),
      input,
      voice: voice,
    };

    const headers = {
      'Content-Type': 'application/json',
      'api-key': ttsSchema.apiKey ? extractEnvVariable(ttsSchema.apiKey) : '',
    };

    return [url, data, headers];
  }

  /**
   * Prepares the request for ElevenLabs TTS provider.
   * @param {Object} ttsSchema - The TTS schema for ElevenLabs.
   * @param {string} input - The input text.
   * @param {string} voice - The selected voice.
   * @param {boolean} stream - Whether to use streaming.
   * @returns {Array} An array containing the URL, data, and headers for the request.
   * @throws {Error} If the selected voice is not available.
   */
  elevenLabsProvider(ttsSchema, input, voice, stream) {
    let url =
      ttsSchema?.url ||
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}${stream ? '/stream' : ''}`;

    if (!ttsSchema?.voices.includes(voice)) {
      throw new Error(`Voice ${voice} is not available.`);
    }

    const data = {
      model_id: ttsSchema?.model,
      text: input,
      voice_settings: {
        similarity_boost: ttsSchema?.voice_settings?.similarity_boost,
        stability: ttsSchema?.voice_settings?.stability,
        style: ttsSchema?.voice_settings?.style,
        use_speaker_boost: ttsSchema?.voice_settings?.use_speaker_boost,
      },
      pronunciation_dictionary_locators: ttsSchema?.pronunciation_dictionary_locators,
    };

    const headers = {
      'Content-Type': 'application/json',
      'xi-api-key': ttsSchema.apiKey ? extractEnvVariable(ttsSchema.apiKey) : '',
      Accept: 'audio/mpeg',
    };

    return [url, data, headers];
  }

  /**
   * Prepares the request for LocalAI TTS provider.
   * @param {Object} ttsSchema - The TTS schema for LocalAI.
   * @param {string} input - The input text.
   * @param {string} voice - The selected voice.
   * @returns {Array} An array containing the URL, data, and headers for the request.
   * @throws {Error} If the selected voice is not available.
   */
  localAIProvider(ttsSchema, input, voice) {
    const url = ttsSchema?.url;

    if (ttsSchema?.voices && ttsSchema.voices.length > 0 && !ttsSchema.voices.includes(voice)) {
      throw new Error(`Voice ${voice} is not available.`);
    }

    const data = {
      input,
      model: voice,
      backend: ttsSchema?.backend,
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `${
        ttsSchema.apiKey ? 'Bearer ' + extractEnvVariable(ttsSchema.apiKey) : undefined
      }`,
    };

    return [url, data, headers];
  }

  /**
   * Converts a ReadableStream to a Node.js stream (used in Deepgram SDK).
   * @async
   * @param {ReadableStream} readableStream - The ReadableStream to convert.
   * @returns {Promise<Readable>} The Node.js stream.
   * @throws {Error} If the conversion fails.
   */
  async streamToNodeStream(readableStream) {
    const reader = readableStream.getReader();
    const nodeStream = new Readable({
      async read() {
        try {
          const { value, done } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            this.push(Buffer.from(value));
          }
        } catch (err) {
          this.destroy(err);
        }
      },
    });
    return nodeStream;
  }

  /**
   * Prepares the request for Deepgram SDK TTS provider.
   * @async
   * @param {Object} ttsSchema - The TTS schema for Deepgram SDK.
   * @param {string} input - The input text.
   * @param {string} voice - The selected voice.
   * @returns {Promise<Object>} The response object.
   * @throws {Error} If the selected voice is not available or the request fails.
   */
  async deepgramSDKProvider(ttsSchema, input, voice) {
    const apiKey = extractEnvVariable(ttsSchema.apiKey) || '';
    const deepgram = createClient(apiKey);

    if (ttsSchema?.voices && ttsSchema.voices.length > 0 && !ttsSchema.voices.includes(voice)) {
      throw new Error(`Voice ${voice} is not available.`);
    }

    const modelParts = [ttsSchema.model, voice, ttsSchema.language].filter(Boolean);

    const configOptions = {
      model: modelParts.join('-'),
      encoding: 'linear16',
      container: 'wav',
      bit_rate: ttsSchema.media_settings?.bit_rate,
      sample_rate: ttsSchema.media_settings?.sample_rate,
    };

    this.removeUndefined(configOptions);

    try {
      const response = await deepgram.speak.request({ text: input }, configOptions);
      const audioStream = await response.getStream();
      const headers = await response.getHeaders();

      // Convert ReadableStream to Node.js stream
      const nodeStream = await this.streamToNodeStream(audioStream);

      return {
        data: nodeStream,
        headers,
        status: 200,
      };
    } catch (error) {
      logger.error('Deepgram TTS request failed:', error);
      throw error;
    }
  }

  // TODO: Implement a better way to determine if the SDK should be used
  shouldUseSDK(provider) {
    if (provider == TTSProviders.DEEPGRAM) {
      return true;
    }

    return false;
  }

  /**
   * Sends a TTS request to the specified provider.
   * @async
   * @param {string} provider - The TTS provider to use.
   * @param {Object} ttsSchema - The TTS schema for the provider.
   * @param {Object} options - The options for the TTS request.
   * @param {string} options.input - The input text.
   * @param {string} options.voice - The voice to use.
   * @param {boolean} [options.stream=true] - Whether to use streaming.
   * @returns {Promise<Object>} The axios response object.
   * @throws {Error} If the provider is invalid or the request fails.
   */
  async ttsRequest(provider, ttsSchema, { input, voice, stream = true }) {
    const useSDK = this.shouldUseSDK(provider);
    const strategy = useSDK ? this.sdkStrategies[provider] : this.apiStrategies[provider];

    if (!strategy) {
      throw new Error('Invalid provider');
    }

    if (useSDK) {
      const response = await strategy.call(this, ttsSchema, input, voice, stream);

      return {
        data: response.data,
        headers: response.headers,
        status: response.status,
      };
    } else {
      const [url, data, headers] = strategy.call(this, ttsSchema, input, voice, stream);

      [data, headers].forEach(this.removeUndefined.bind(this));

      const options = { headers, responseType: stream ? 'stream' : 'arraybuffer' };

      try {
        return await axios.post(url, data, options);
      } catch (error) {
        logger.error(`TTS request failed for provider ${provider}:`, error);
        throw error;
      }
    }
  }

  /**
   * Processes a text-to-speech request.
   * @async
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Promise<void>}
   */
  async processTextToSpeech(req, res) {
    const { input, voice: requestVoice } = req.body;

    if (!input) {
      return res.status(400).send('Missing text in request body');
    }

    try {
      res.setHeader('Content-Type', 'audio/mpeg');
      const provider = this.getProvider();
      const ttsSchema = this.customConfig.speech.tts[provider];
      const voice = await this.getVoice(ttsSchema, requestVoice);

      if (input.length < 4096) {
        const response = await this.ttsRequest(provider, ttsSchema, { input, voice });
        response.data.pipe(res);
        return;
      }

      const textChunks = splitTextIntoChunks(input, 1000);

      for (const chunk of textChunks) {
        try {
          const response = await this.ttsRequest(provider, ttsSchema, {
            voice,
            input: chunk.text,
            stream: true,
          });

          logger.debug(`[textToSpeech] user: ${req?.user?.id} | writing audio stream`);
          await new Promise((resolve) => {
            response.data.pipe(res, { end: chunk.isFinished });
            response.data.on('end', resolve);
          });

          if (chunk.isFinished) {
            break;
          }
        } catch (innerError) {
          logger.error('Error processing manual update:', chunk, innerError);
          if (!res.headersSent) {
            return res.status(500).end();
          }
          return;
        }
      }

      if (!res.headersSent) {
        res.end();
      }
    } catch (error) {
      logger.error('Error creating the audio stream:', error);
      if (!res.headersSent) {
        return res.status(500).send('An error occurred');
      }
    }
  }

  /**
   * Streams audio data from the TTS provider.
   * @async
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Promise<void>}
   */
  async streamAudio(req, res) {
    res.setHeader('Content-Type', 'audio/mpeg');
    const provider = this.getProvider();
    const ttsSchema = this.customConfig.speech.tts[provider];
    const voice = await this.getVoice(ttsSchema, req.body.voice);

    let shouldContinue = true;

    req.on('close', () => {
      logger.warn('[streamAudio] Audio Stream Request closed by client');
      shouldContinue = false;
    });

    const processChunks = createChunkProcessor(req.body.messageId);

    try {
      while (shouldContinue) {
        const updates = await processChunks();
        if (typeof updates === 'string') {
          logger.error(`Error processing audio stream updates: ${updates}`);
          return res.status(500).end();
        }

        if (updates.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1250));
          continue;
        }

        for (const update of updates) {
          try {
            const response = await this.ttsRequest(provider, ttsSchema, {
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
              response.data.on('end', resolve);
            });

            if (update.isFinished) {
              shouldContinue = false;
              break;
            }
          } catch (innerError) {
            logger.error('Error processing audio stream update:', update, innerError);
            if (!res.headersSent) {
              return res.status(500).end();
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
}

/**
 * Factory function to create a TTSService instance.
 * @async
 * @returns {Promise<TTSService>} A promise that resolves to a TTSService instance.
 */
async function createTTSService() {
  return TTSService.getInstance();
}

/**
 * Wrapper function for text-to-speech processing.
 * @async
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 */
async function textToSpeech(req, res) {
  const ttsService = await createTTSService();
  await ttsService.processTextToSpeech(req, res);
}

/**
 * Wrapper function for audio streaming.
 * @async
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 */
async function streamAudio(req, res) {
  const ttsService = await createTTSService();
  await ttsService.streamAudio(req, res);
}

/**
 * Wrapper function to get the configured TTS provider.
 * @async
 * @returns {Promise<string>} A promise that resolves to the name of the configured provider.
 */
async function getProvider() {
  const ttsService = await createTTSService();
  return ttsService.getProvider();
}

module.exports = {
  textToSpeech,
  streamAudio,
  getProvider,
};
