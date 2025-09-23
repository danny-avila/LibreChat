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

    // CRITICAL: Extract autoRouter from multiple possible locations
    const autoRouter = options.endpointOption?.autoRouter ||
                      incomingEndpointModelOptions?.autoRouter ||
                      incomingClientModelOptions?.autoRouter ||
                      options.autoRouter ||
                      false;

    if (isUpdate) {
      // 2a. Subsequent update: Merge incoming options into existing this.options immutably

      // Calculate merged modelOptions
      const mergedModelOptions = {
        ...(this.options.modelOptions || {}),
        ...incomingClientModelOptions,
        ...incomingEndpointModelOptions,
        // Ensure autoRouter is preserved in modelOptions
        autoRouter: autoRouter || this.options.modelOptions?.autoRouter,
      };

      // Update this.options safely. We do NOT delete properties from the input 'options'.
      this.options = {
        ...this.options,
        ...options,
        // Ensure the fully merged modelOptions are set
        modelOptions: mergedModelOptions,
        // Also preserve autoRouter at root level
        autoRouter: autoRouter || this.options.autoRouter,
      };
    } else {
      // 2b. Initial setup (this.options is undefined) OR replacement (options.replaceOptions is true)

      // Calculate merged modelOptions
      const mergedModelOptions = {
        ...incomingClientModelOptions,
        ...incomingEndpointModelOptions,
        // Ensure autoRouter is in modelOptions
        autoRouter: autoRouter,
      };

      // Set this.options
      this.options = {
        ...options,
        modelOptions: mergedModelOptions,
        // Also set autoRouter at root level
        autoRouter: autoRouter,
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

    // Store autoRouter at instance level for easy access
    this.autoRouter = this.options.autoRouter || this.modelOptions.autoRouter || false;


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
   * @param {Array} [params.tools] - Array of tool definitions (OpenAI format)
   * @param {string|Object} [params.tool_choice] - Tool selection control
   * @param {boolean} [params.parallel_tool_calls] - Enable parallel tool execution
   * @param {Array} [params.functions] - Legacy function definitions
   * @param {string|Object} [params.function_call] - Legacy function call control
   * @returns {Promise<Object>} The chat completion response with potential tool_calls
   */
  async chatCompletion(params) {
    const {
      messages,
      model,
      models,
      autoRouter,
      tools,
      tool_choice,
      parallel_tool_calls,
      functions,
      function_call,
      ...otherParams
    } = params;


    // Ensure messages exist
    if (!messages || messages.length === 0) {
      logger.error('[OpenRouterClient] No messages provided to chatCompletion');
      throw new Error('Messages array is required for OpenRouter API');
    }

    // Determine the base model (user's selection)
    const userSelectedModel = model || this.modelOptions?.model;

    // Check if auto-router should be applied (from params, instance, or modelOptions)
    const shouldUseAutoRouter = autoRouter || this.autoRouter || this.modelOptions?.autoRouter;

    // Apply auto-router transformation at request time
    const effectiveModel = shouldUseAutoRouter ? 'openrouter/auto' : userSelectedModel;

    // Store original model for metadata
    const originalModel = userSelectedModel;


    const requestBody = {
      messages,
      model: effectiveModel,
      ...otherParams,
      // Add transforms to control data privacy
      // This prevents the "No endpoints found matching your data policy" error
      transforms: ['middle-out'], // This allows the request without data collection
      // Add tool/function calling parameters if provided
      ...(tools && { tools }),
      ...(tool_choice && { tool_choice }),
      ...(parallel_tool_calls !== undefined && { parallel_tool_calls }),
      // Legacy function calling support
      ...(functions && { functions }),
      ...(function_call && { function_call }),
    };

    // If no model specified and auto-router is not enabled, throw error
    if (!requestBody.model) {
      throw new Error('No model specified for OpenRouter. Please select a model.');
    }


    // Add fallback models if provided (but not when auto-router is active)
    if (models && Array.isArray(models) && models.length > 0) {
      // OpenRouter doesn't allow fallbacks with auto router
      if (!shouldUseAutoRouter && !requestBody.model.includes('openrouter/auto')) {
        requestBody.models = models.slice(0, 10); // Max 10 fallback models
      }
    }

    // Handle streaming if requested
    if (params.stream) {
      requestBody.stream = true;
    }

    try {
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
        return response; // Return stream for processing
      }

      const data = await response.json();

      // Store usage data if available
      if (data.usage) {
        this.usage = data.usage;
      }

      // Preserve tool_calls and function_call in the response if present
      // This is critical for agent system compatibility
      if (data.choices && data.choices[0]) {
        const message = data.choices[0].message;

        // Ensure tool_calls are preserved in the response
        if (message.tool_calls) {
          // Tool calls are already in the correct format from OpenRouter
          logger.debug('[OpenRouterClient] Tool calls in response:', message.tool_calls);
        }

        // Legacy function_call support
        if (message.function_call) {
          logger.debug('[OpenRouterClient] Function call in response:', message.function_call);
        }
      }

      // Add metadata about auto-router usage and actual model used
      if (shouldUseAutoRouter || data.model !== originalModel) {
        data._metadata = {
          autoRouterUsed: shouldUseAutoRouter,
          requestedModel: originalModel,
          effectiveModel: effectiveModel,
          actualModelUsed: data.model || effectiveModel, // The model OpenRouter actually used
        };

        // Store for later reference
        this.actualModelUsed = data.model;
      }

      return data;
    } catch (error) {
      const sanitized = sanitizeError(error);
      logger.error('[OpenRouterClient] Chat completion error:', sanitized);
      throw sanitized;
    }
  }

  /**
   * Gets the actual model used in the last request
   * @returns {string|null} The model that was actually used, or null if not available
   */
  getActualModelUsed() {
    return this.actualModelUsed || null;
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

      const response = await this.chatCompletion(chatRequest);

      if (!onProgress) {
        return response.choices[0].message.content;
      }

      // Handle streaming response

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
      let actualModelUsed = null; // Track the actual model used by OpenRouter
      let toolCalls = []; // Track tool calls in streaming
      let currentToolCall = null; // Current tool call being built

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

                  // Capture the actual model used from the response
                  // OpenRouter includes the model in the response chunks
                  if (parsed.model && !actualModelUsed) {
                    actualModelUsed = parsed.model;
                    // Store it for later use
                    this.actualModelUsed = actualModelUsed;

                    logger.info('[OpenRouter] Model detected in response:', {
                      actualModel: actualModelUsed,
                      autoRouter: this.autoRouter,
                      modelOptionsAutoRouter: this.modelOptions?.autoRouter,
                      willSendToken: !!(this.modelOptions?.autoRouter || this.autoRouter),
                    });

                    // Send a special token to indicate model info if auto-router was used
                    // Check multiple locations for the autoRouter flag
                    const isAutoRouter = this.modelOptions?.autoRouter ||
                                       this.autoRouter ||
                                       this.options?.autoRouter ||
                                       this.options?.modelOptions?.autoRouter ||
                                       requestOptions.model === 'openrouter/auto';

                    logger.info('[OpenRouter] AutoRouter check:', {
                      fromModelOptions: this.modelOptions?.autoRouter,
                      fromThis: this.autoRouter,
                      fromOptions: this.options?.autoRouter,
                      fromOptionsModelOptions: this.options?.modelOptions?.autoRouter,
                      isAutoModel: requestOptions.model === 'openrouter/auto',
                      final: isAutoRouter,
                    });

                    if (isAutoRouter) {
                      if (onProgress) {
                        // Send model info as a special prefix that can be extracted by the UI
                        logger.info('[OpenRouter] Sending MODEL token:', actualModelUsed);
                        onProgress(`[MODEL:${actualModelUsed}]`);
                      }
                    }
                  }

                  // Handle regular content
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    fullContent += content;
                    if (onProgress) {
                      onProgress(content);
                    }
                  }

                  // Handle tool calls in streaming
                  const deltaToolCalls = parsed.choices?.[0]?.delta?.tool_calls;
                  if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
                    for (const toolCallDelta of deltaToolCalls) {
                      const index = toolCallDelta.index;

                      // Initialize tool call at index if needed
                      if (!toolCalls[index]) {
                        toolCalls[index] = {
                          id: '',
                          type: 'function',
                          function: {
                            name: '',
                            arguments: '',
                          },
                        };
                      }

                      // Update tool call data
                      if (toolCallDelta.id) {
                        toolCalls[index].id = toolCallDelta.id;
                      }
                      if (toolCallDelta.type) {
                        toolCalls[index].type = toolCallDelta.type;
                      }
                      if (toolCallDelta.function) {
                        if (toolCallDelta.function.name) {
                          toolCalls[index].function.name = toolCallDelta.function.name;
                        }
                        if (toolCallDelta.function.arguments) {
                          toolCalls[index].function.arguments += toolCallDelta.function.arguments;
                        }
                      }
                    }
                  }

                  // Handle legacy function_call in streaming
                  const deltaFunctionCall = parsed.choices?.[0]?.delta?.function_call;
                  if (deltaFunctionCall) {
                    if (!currentToolCall) {
                      currentToolCall = {
                        name: '',
                        arguments: '',
                      };
                    }
                    if (deltaFunctionCall.name) {
                      currentToolCall.name = deltaFunctionCall.name;
                    }
                    if (deltaFunctionCall.arguments) {
                      currentToolCall.arguments += deltaFunctionCall.arguments;
                    }
                  }
                } catch (e) {
                }
              }
            }
          } catch (error) {
            handleError(error);
          }
        });

        response.body.on('end', () => {
          cleanup();

          // If we have tool calls, we need to return a properly formatted response
          // that matches what the agent system expects
          if (toolCalls.length > 0 || currentToolCall) {
            const formattedResponse = {
              choices: [
                {
                  message: {
                    content: fullContent || null,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                    function_call: currentToolCall || undefined,
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            };
            logger.debug('[OpenRouterClient] Streaming ended with tool calls:', {
              toolCallsCount: toolCalls.length,
              hasFunctionCall: !!currentToolCall,
            });
            resolve(formattedResponse);
          } else {
            // Regular content-only response
            resolve(fullContent);
          }
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
      // Fall back to default title on error
    }

    return title || 'New Chat';
  }
}

module.exports = OpenRouterClient;
