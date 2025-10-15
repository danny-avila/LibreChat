const { z } = require('zod');
const axios = require('axios');
const { Ollama } = require('ollama');
const { sleep } = require('@librechat/agents');
const { logAxiosError } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const { deriveBaseURL } = require('~/utils');

const ollamaPayloadSchema = z.object({
  mirostat: z.number().optional(),
  mirostat_eta: z.number().optional(),
  mirostat_tau: z.number().optional(),
  num_ctx: z.number().optional(),
  repeat_last_n: z.number().optional(),
  repeat_penalty: z.number().optional(),
  temperature: z.number().optional(),
  seed: z.number().nullable().optional(),
  stop: z.array(z.string()).optional(),
  tfs_z: z.number().optional(),
  num_predict: z.number().optional(),
  top_k: z.number().optional(),
  top_p: z.number().optional(),
  stream: z.optional(z.boolean()),
  model: z.string(),
});

/**
 * @param {string} imageUrl
 * @returns {string}
 * @throws {Error}
 */
const getValidBase64 = (imageUrl) => {
  const parts = imageUrl.split(';base64,');

  if (parts.length === 2) {
    return parts[1];
  } else {
    logger.error('Invalid or no Base64 string found in URL.');
  }
};

class OllamaClient {
  constructor(options = {}) {
    const host = deriveBaseURL(options.baseURL ?? 'http://localhost:11434');
    this.streamRate = options.streamRate ?? Constants.DEFAULT_STREAM_RATE;
    /** @type {Ollama} */
    this.client = new Ollama({ host });
  }

  /**
   * Fetches Ollama models from the specified base API path.
   * @param {string} baseURL
   * @returns {Promise<string[]>} The Ollama models.
   */
  static async fetchModels(baseURL) {
    let models = [];
    if (!baseURL) {
      return models;
    }
    try {
      const ollamaEndpoint = deriveBaseURL(baseURL);
      /** @type {Promise<AxiosResponse<OllamaListResponse>>} */
      const response = await axios.get(`${ollamaEndpoint}/api/tags`, {
        timeout: 5000,
      });
      models = response.data.models.map((tag) => tag.name);
      return models;
    } catch (error) {
      const logMessage =
        "Failed to fetch models from Ollama API. If you are not using Ollama directly, and instead, through some aggregator or reverse proxy that handles fetching via OpenAI spec, ensure the name of the endpoint doesn't start with `ollama` (case-insensitive).";
      logAxiosError({ message: logMessage, error });
      return [];
    }
  }

  /**
   * @param {ChatCompletionMessage[]} messages
   * @returns {OllamaMessage[]}
   */
  static formatOpenAIMessages(messages) {
    const ollamaMessages = [];

    for (const message of messages) {
      if (typeof message.content === 'string') {
        ollamaMessages.push({
          role: message.role,
          content: message.content,
        });
        continue;
      }

      let aggregatedText = '';
      let imageUrls = [];

      for (const content of message.content) {
        if (content.type === 'text') {
          aggregatedText += content.text + ' ';
        } else if (content.type === 'image_url') {
          imageUrls.push(getValidBase64(content.image_url.url));
        }
      }

      const ollamaMessage = {
        role: message.role,
        content: aggregatedText.trim(),
      };

      if (imageUrls.length > 0) {
        ollamaMessage.images = imageUrls;
      }

      ollamaMessages.push(ollamaMessage);
    }

    return ollamaMessages;
  }

  /***
   * @param {Object} params
   * @param {ChatCompletionPayload} params.payload
   * @param {onTokenProgress} params.onProgress
   * @param {AbortController} params.abortController
   */
  async chatCompletion({ payload, onProgress, abortController = null }) {
    let intermediateReply = '';

    const parameters = ollamaPayloadSchema.parse(payload);
    const messages = OllamaClient.formatOpenAIMessages(payload.messages);

    if (parameters.stream) {
      const stream = await this.client.chat({
        messages,
        ...parameters,
      });

      for await (const chunk of stream) {
        const token = chunk.message.content;
        intermediateReply += token;
        onProgress(token);
        if (abortController.signal.aborted) {
          stream.controller.abort();
          break;
        }

        await sleep(this.streamRate);
      }
    }
    // TODO: regular completion
    else {
      // const generation = await this.client.generate(payload);
    }

    return intermediateReply;
  }
  catch(err) {
    logger.error('[OllamaClient.chatCompletion]', err);
    throw err;
  }
}

module.exports = { OllamaClient, ollamaPayloadSchema };
