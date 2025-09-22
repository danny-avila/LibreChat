const BaseClient = require('./BaseClient');
const fetch = require('node-fetch');
const { logger } = require('~/config');
const { EModelEndpoint, getResponseSender } = require('librechat-data-provider');
const { sanitizeError } = require('~/server/utils/keyMasking');
const { formatMessage, truncateText, titleInstruction } = require('./prompts');

class OpenRouterClient extends BaseClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);

    // Initialize modelOptions before setOptions is called
    this.modelOptions = {};

    this.setOptions(options);

    // OpenRouter specific configuration
    // Use baseURL from options (if provided via config), or environment variable, otherwise default
    this.baseURL =
      this.options?.baseURL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    // Store site attribution for later use in headers
    this.siteUrl = process.env.OPENROUTER_SITE_URL;
    this.siteName = process.env.OPENROUTER_SITE_NAME;

    // Cache configuration
    this.cacheSettings = {
      creditsTTL: parseInt(process.env.OPENROUTER_CACHE_TTL_CREDITS || 300000), // 5 minutes
      modelsTTL: parseInt(process.env.OPENROUTER_CACHE_TTL_MODELS || 3600000), // 1 hour
    };

    // Initialize cache
    this.cache = {
      credits: null,
      creditsTimestamp: null,
      models: null,
      modelsTimestamp: null,
    };

    // Token counting keys for OpenRouter
    this.inputTokensKey = 'prompt_tokens';
    this.outputTokensKey = 'completion_tokens';
  }

  setOptions(options) {
    const { logger } = require('~/config');

    // Determine if this is an update (this.options exists AND we are not forcing replacement)
    const isUpdate = this.options && !options.replaceOptions;

    // 1. Define the sources for modelOptions
    const incomingClientModelOptions = options.modelOptions || {};
    const incomingEndpointModelOptions = options.endpointOption?.modelOptions || {};

    if (isUpdate) {
      // 2a. Subsequent update: Merge incoming options into existing this.options immutably

      // Calculate merged modelOptions
      const mergedModelOptions = {
        ...(this.options.modelOptions || {}),
        ...incomingClientModelOptions,
        ...incomingEndpointModelOptions,
      };

      // Update this.options safely. We do NOT delete properties from the input 'options'.
      this.options = {
        ...this.options,
        ...options,
        // Ensure the fully merged modelOptions are set
        modelOptions: mergedModelOptions,
      };
    } else {
      // 2b. Initial setup (this.options is undefined) OR replacement (options.replaceOptions is true)

      // Calculate merged modelOptions
      const mergedModelOptions = {
        ...incomingClientModelOptions,
        ...incomingEndpointModelOptions,
      };

      // Set this.options
      this.options = {
        ...options,
        modelOptions: mergedModelOptions,
      };
    }

    if (this.options.openRouterApiKey) {
      this.apiKey = this.options.openRouterApiKey;
    }

    // Apply the finalized, merged modelOptions to the instance property (this.modelOptions).
    this.modelOptions = {
      ...(this.modelOptions || {}), // Keep existing instance defaults (initialized to {} in constructor)
      ...(this.options.modelOptions || {}),
    };

    logger.debug('[OpenRouterClient.setOptions] Finalized configuration:', {
      model: this.modelOptions?.model,
      hasModelOptions: !!this.modelOptions,
      modelKeys: Object.keys(this.modelOptions || {}),
    });

    // Set sender name based on model
    this.sender =
      this.options.sender ??
      getResponseSender({
        model: this.modelOptions.model,
        endpoint: EModelEndpoint.openrouter,
        modelDisplayLabel: this.options.modelDisplayLabel,
      });

    // OpenRouter always uses chat completions format
    this.isChatCompletion = true;
    this.isChatGptModel = true;
  }

  /**
   * Builds headers for OpenRouter API requests
   * @returns {Object} Headers object for API requests
   */
  buildHeaders() {
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    // Add site attribution headers if available
    if (this.siteUrl) {
      headers['HTTP-Referer'] = this.siteUrl;
    }
    if (this.siteName) {
      headers['X-Title'] = this.siteName;
    }

    // Add data privacy headers to avoid the "No endpoints found matching your data policy" error
    // This allows OpenRouter to use models without requiring data privacy configuration
    headers['X-Data-Collection'] = 'deny'; // Deny data collection for training

    return headers;
  }

  /**
   * Sends a chat completion request to OpenRouter API
   * @param {Object} params - The request parameters
   * @param {Array} params.messages - Array of message objects
   * @param {string} [params.model] - Primary model to use
   * @param {Array} [params.models] - Array of fallback models
   * @param {Object} [params.route] - Routing preferences
   * @param {Array} [params.provider] - Provider preferences
   * @param {Object} [params.transforms] - Message transformations
   * @returns {Promise<Object>} The chat completion response
   */
  async chatCompletion(params) {
    const { messages, model, models, ...otherParams } = params;

    // Enhanced debug logging
    logger.debug('[OpenRouterClient] chatCompletion called with:', {
      modelFromParams: model,
      modelFromOptions: this.modelOptions?.model,
      allModelOptions: this.modelOptions,
      hasMessages: messages?.length > 0,
      messagePreview: messages?.[0]?.content?.substring(0, 50),
    });

    // Ensure messages exist
    if (!messages || messages.length === 0) {
      logger.error('[OpenRouterClient] No messages provided to chatCompletion');
      throw new Error('Messages array is required for OpenRouter API');
    }

    const requestBody = {
      messages,
      model: model || this.modelOptions?.model,
      ...otherParams,
      // Add transforms to control data privacy
      // This prevents the "No endpoints found matching your data policy" error
      transforms: ['middle-out'], // This allows the request without data collection
    };

    // If no model specified, throw error instead of using auto-router
    if (!requestBody.model) {
      throw new Error('No model specified for OpenRouter. Please select a model.');
    }

    // Check if it's trying to use auto-router
    if (requestBody.model.includes('auto')) {
      logger.warn('[OpenRouterClient] AUTO-ROUTER DETECTED:', requestBody.model);
    }

    logger.debug('[OpenRouterClient] FINAL MODEL BEING USED:', requestBody.model);

    // Add fallback models if provided
    if (models && Array.isArray(models) && models.length > 0) {
      // OpenRouter doesn't allow fallbacks with auto router
      if (!requestBody.model.includes('openrouter/auto')) {
        requestBody.models = models.slice(0, 10); // Max 10 fallback models
      } else {
        logger.warn('[OpenRouterClient] Fallback models not supported with Auto Router');
      }
    }

    // Handle streaming if requested
    if (params.stream) {
      requestBody.stream = true;
    }

    try {
      logger.debug('[OpenRouterClient] Fetching from OpenRouter API with stream:', !!params.stream);

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await this.handleError(response);
        logger.error('[OpenRouterClient] API error:', error);
        throw error;
      }

      if (params.stream) {
        logger.debug('[OpenRouterClient] Returning raw Response object for streaming');
        // Make sure we're returning the actual Response object
        return response; // Return stream for processing
      }

      logger.debug('[OpenRouterClient] Parsing JSON response for non-streaming');
      const data = await response.json();

      // Store usage data if available
      if (data.usage) {
        this.usage = data.usage;
      }

      return data;
    } catch (error) {
      const sanitized = sanitizeError(error);
      logger.error('[OpenRouterClient] Chat completion error:', sanitized);
      throw sanitized;
    }
  }

  /**
   * Gets the current credit balance from OpenRouter
   * @param {boolean} [forceRefresh=false] - Force refresh bypassing cache
   * @returns {Promise<Object>} The credits information
   */
  async getCredits(forceRefresh = false) {
    const now = Date.now();

    // Check cache validity
    if (
      !forceRefresh &&
      this.cache.credits &&
      this.cache.creditsTimestamp &&
      now - this.cache.creditsTimestamp < this.cacheSettings.creditsTTL
    ) {
      logger.debug('[OpenRouterClient] Returning cached credits');
      return this.cache.credits;
    }

    try {
      const response = await fetch(`${this.baseURL}/credits`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await this.handleError(response);
        throw sanitizeError(error);
      }

      const data = await response.json();

      // Transform OpenRouter response to our format
      // The credits endpoint returns total_credits and total_usage
      // Balance = total_credits - total_usage
      const credits = {
        balance: (data.data?.total_credits || 0) - (data.data?.total_usage || 0),
        currency: 'USD',
        usage: data.data?.total_usage || 0,
        total: data.data?.total_credits || 0,
      };

      // Update cache
      this.cache.credits = credits;
      this.cache.creditsTimestamp = now;

      return credits;
    } catch (error) {
      const sanitized = sanitizeError(error);
      logger.error('[OpenRouterClient] Error fetching credits:', sanitized);
      throw sanitized;
    }
  }

  /**
   * Gets the list of available models from OpenRouter
   * @param {boolean} [forceRefresh=false] - Force refresh bypassing cache
   * @returns {Promise<Array>} Array of available models
   */
  async getModels(forceRefresh = false) {
    const now = Date.now();

    // Check cache validity
    if (
      !forceRefresh &&
      this.cache.models &&
      this.cache.modelsTimestamp &&
      now - this.cache.modelsTimestamp < this.cacheSettings.modelsTTL
    ) {
      logger.debug('[OpenRouterClient] Returning cached models');
      return this.cache.models;
    }

    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await this.handleError(response);
        throw sanitizeError(error);
      }

      const data = await response.json();
      const models = data.data || [];

      // Update cache
      this.cache.models = models;
      this.cache.modelsTimestamp = now;

      return models;
    } catch (error) {
      const sanitized = sanitizeError(error);
      logger.error('[OpenRouterClient] Error fetching models:', sanitized);
      throw sanitized;
    }
  }

  /**
   * Handles errors from OpenRouter API responses
   * @param {Response} response - The error response
   * @returns {Error} Formatted error object
   */
  async handleError(response) {
    let errorData;

    try {
      errorData = await response.json();
    } catch (_error) {
      errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
    }

    const error = new Error(
      errorData.error?.message || errorData.message || 'OpenRouter API error',
    );
    error.status = response.status;
    error.statusText = response.statusText;
    error.data = errorData;

    // Handle specific OpenRouter error codes
    if (response.status === 401) {
      error.message = 'Invalid OpenRouter API key. Please check your OPENROUTER_API_KEY.';
    } else if (response.status === 402) {
      error.message = 'Insufficient credits. Please add credits to your OpenRouter account.';
    } else if (response.status === 429) {
      error.message = 'Rate limit exceeded. Please try again later.';
    } else if (response.status === 503) {
      error.message = 'OpenRouter service temporarily unavailable. Please try again later.';
    }

    return error;
  }

  /**
   * Required BaseClient methods
   */

  getSaveOptions() {
    return {
      endpoint: EModelEndpoint.openrouter,
      modelLabel: this.modelOptions.model,
      ...this.modelOptions,
    };
  }

  async buildMessages(messages, _parentMessageId, _options, _opts) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { prompt: [] };
    }

    // Filter out invalid messages robustly, but log if it happens
    const validMessages = messages.filter((msg) => {
      if (!msg || typeof msg !== 'object') {
        logger.warn('[OpenRouterClient] Found invalid message object in history:', msg);
        return false;
      }
      return true;
    });

    // Use the standard formatMessage utility for consistency
    const formatted = validMessages
      .map((message) => {
        try {
          // If message already has OpenAI format, use it directly
          if (message.role && message.content !== undefined) {
            return {
              role: message.role,
              content: message.content,
            };
          }

          // Handle LibreChat message format
          if (message.isCreatedByUser !== undefined) {
            return {
              role: message.isCreatedByUser ? 'user' : 'assistant',
              content: message.content || message.text || '',
            };
          }

          // Use standard formatting utility for other cases
          return formatMessage({
            message,
            endpoint: EModelEndpoint.openrouter,
          });
        } catch (error) {
          logger.error('[OpenRouterClient] Error formatting message:', error.message);
          return null;
        }
      })
      .filter(Boolean);

    return { prompt: formatted };
  }

  getBuildMessagesOptions() {
    return {
      isChatCompletion: true,
      isChatGptModel: true,
    };
  }

  async getCompletion(input, options = {}) {
    // Input can be { prompt: messages[] } from buildMessages or { messages: messages[] } directly
    const { messages, prompt, ...params } = input;
    const finalMessages = messages || prompt;

    logger.debug('[OpenRouterClient] getCompletion called with:', {
      hasMessages: !!messages,
      hasPrompt: !!prompt,
      finalMessagesCount: finalMessages?.length,
      inputKeys: Object.keys(input),
      optionsKeys: Object.keys(options),
    });

    if (!finalMessages || finalMessages.length === 0) {
      logger.error('[OpenRouterClient] No messages in getCompletion');
      throw new Error('No messages provided to getCompletion');
    }

    return this.chatCompletion({
      messages: finalMessages,
      ...this.modelOptions,
      ...params,
      ...options,
    });
  }

  async sendCompletion(payload, opts = {}) {
    const { onProgress, abortController } = opts;

    // Check if payload is an array (which means it's the messages directly)
    let messages;
    if (Array.isArray(payload)) {
      messages = payload;
    } else if (payload && typeof payload === 'object') {
      // Handle both messages and prompt fields
      messages = payload.messages || payload.prompt;
    } else {
      messages = null;
    }

    if (!messages || messages.length === 0) {
      throw new Error('No messages provided to sendCompletion');
    }

    try {
      // Extract payload properties but exclude messages/prompt/model to avoid conflicts
      const payloadParams = {};
      if (typeof payload === 'object' && !Array.isArray(payload)) {
        for (const [key, value] of Object.entries(payload)) {
          if (key !== 'messages' && key !== 'prompt' && key !== 'model') {
            payloadParams[key] = value;
          }
        }
      }

      // Build the request for chatCompletion
      const chatRequest = {
        messages, // Use messages directly
        stream: !!onProgress,
        ...payloadParams,
        model: this.modelOptions?.model, // Set model last to ensure it's not overridden
      };

      logger.debug('[OpenRouterClient] Calling chatCompletion with:', {
        messageCount: messages.length,
        model: chatRequest.model,
        stream: chatRequest.stream,
      });

      const response = await this.chatCompletion(chatRequest);

      logger.debug('[OpenRouterClient] Response type:', typeof response);
      logger.debug('[OpenRouterClient] Response has body:', !!response?.body);
      const isFetchResponse =
        response != null && typeof response === 'object' && typeof response.body?.on === 'function';
      logger.debug('[OpenRouterClient] Response is stream-capable:', isFetchResponse);

      if (!onProgress) {
        logger.debug('[OpenRouterClient] Non-streaming response received');
        return response.choices[0].message.content;
      }

      // Handle streaming response
      logger.debug('[OpenRouterClient] Handling streaming response');

      // Check if we got a Response object or parsed JSON
      if (response && response.choices) {
        // We got parsed JSON instead of a stream, probably an error from OpenRouter
        logger.error('[OpenRouterClient] Got JSON response when expecting stream:', response);
        if (response.choices[0]?.message?.content) {
          return response.choices[0].message.content;
        }
        throw new Error('Invalid response from OpenRouter');
      }

      if (!response || !response.body) {
        logger.error('[OpenRouterClient] Invalid streaming response:', {
          hasResponse: !!response,
          responseType: typeof response,
          hasBody: !!response?.body,
        });
        throw new Error('Invalid streaming response: no body');
      }

      // Handle streaming with node-fetch v2
      let fullContent = '';
      let buffer = '';
      let streamCleaned = false;

      const cleanup = () => {
        if (!streamCleaned) {
          streamCleaned = true;
          try {
            response.body.destroy();
          } catch (e) {
            // Stream might already be destroyed
          }
        }
      };

      return new Promise((resolve, reject) => {
        const handleError = (error) => {
          cleanup();
          const sanitized = sanitizeError(error);
          logger.error('[OpenRouterClient] Stream error:', sanitized);
          reject(sanitized);
        };

        response.body.on('data', (chunk) => {
          try {
            buffer += chunk.toString();
            const lines = buffer.split('\n');

            // Keep the last line in buffer if it's incomplete
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() === '') continue;

              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    fullContent += content;
                    if (onProgress) {
                      onProgress(content);
                    }
                  }
                } catch (e) {
                  logger.debug('[OpenRouterClient] Error parsing streaming chunk:', e);
                }
              }
            }
          } catch (error) {
            handleError(error);
          }
        });

        response.body.on('end', () => {
          logger.debug('[OpenRouterClient] Stream completed, content length:', fullContent.length);
          cleanup();
          resolve(fullContent);
        });

        response.body.on('error', handleError);

        // Handle abort with cleanup
        if (abortController) {
          const abortHandler = () => {
            cleanup();
            reject(new Error('Request aborted'));
          };
          abortController.signal.addEventListener('abort', abortHandler, { once: true });
        }
      });
    } catch (error) {
      const sanitized = sanitizeError(error);
      logger.error('[OpenRouterClient] Error in sendCompletion:', sanitized);
      throw sanitized;
    }
  }

  /**
   * Generates a title for a conversation.
   * This method allows OpenRouter to create titles for conversations, fixing the issue
   * where title generation was failing for OpenRouter.
   *
   * @param {Object} params - The parameters for title generation.
   * @param {string} params.text - The user's input text.
   * @param {string} params.conversationId - The ID of the conversation.
   * @param {string} [params.responseText=''] - The AI's immediate response to the user.
   *
   * @returns {Promise<string>} A promise that resolves to the generated conversation title.
   *                            In case of failure, it will return the default title, "New Chat".
   */
  async titleConvo({ text, conversationId, responseText = '' }) {
    this.conversationId = conversationId;
    if (this.options.attachments) {
      delete this.options.attachments;
    }

    let title = 'New Chat';
    const convo = `||>User:
"${truncateText(text)}"
||>Response:
"${JSON.stringify(truncateText(responseText))}"`;

    try {
      // Use a simple, cost-effective model for title generation
      const { OPENROUTER_TITLE_MODEL } = process.env ?? {};
      const model = this.options.titleModel ?? OPENROUTER_TITLE_MODEL ?? 'openai/gpt-3.5-turbo';

      const modelOptions = {
        model,
        temperature: 0.2,
        max_tokens: 16,
      };

      // Prepare the title generation prompt
      const instructionsPayload = [
        {
          role: 'system',
          content: `Please generate ${titleInstruction}
${convo}
||>Title:`,
        },
      ];

      // Make the API call to generate title
      const response = await this.chatCompletion({
        messages: instructionsPayload,
        ...modelOptions,
      });

      // Extract title from response
      if (response?.choices?.[0]?.message?.content) {
        title = response.choices[0].message.content.trim();
        // Remove quotes if present
        title = title.replace(/^["']|["']$/g, '');
        // Limit title length
        if (title.length > 100) {
          title = title.substring(0, 97) + '...';
        }
      }
    } catch (error) {
      logger.warn('[OpenRouterClient] Error generating title:', error.message);
      // Fall back to default title on error
    }

    logger.debug('[OpenRouterClient] Generated title:', title);
    return title || 'New Chat';
  }
}

module.exports = OpenRouterClient;
