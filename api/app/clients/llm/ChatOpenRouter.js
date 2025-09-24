const { ChatOpenAI } = require('@langchain/openai');

/**
 * Custom ChatOpenRouter class that extends ChatOpenAI to handle OpenRouter-specific features
 * like auto-router model detection in streaming responses.
 */
class ChatOpenRouter extends ChatOpenAI {
  constructor(fields, configuration) {
    // Add ZDR header if enabled
    const zdrEnabled = fields?.zdr || fields?.modelOptions?.zdr || false;
    if (zdrEnabled) {
      // Ensure configuration exists and has clientConfig
      configuration = configuration || {};
      configuration.clientConfig = configuration.clientConfig || {};
      configuration.clientConfig.defaultHeaders = {
        ...configuration.clientConfig.defaultHeaders,
        'X-OpenRouter-ZDR': 'true',
      };
    }

    super(fields, configuration);
    this.autoRouter = fields?.autoRouter || false;
    this.zdr = zdrEnabled;
    this.actualModelUsed = null;
    this._modelIndicatorSent = false;
    this._rawModelDetected = null;
  }

  /**
   * Override completionWithRetry to intercept the raw OpenRouter response
   */
  async completionWithRetry(request, options) {
    const logger = require('~/config').logger;

    // If auto-router is enabled and streaming, we need to intercept the response
    if (this.autoRouter && request.stream) {
      // Store original fetch to intercept response
      const originalFetch = this.caller.fetch || globalThis.fetch;
      let modelDetected = false;

      // Temporarily override fetch to intercept the streaming response
      const interceptedFetch = async (...args) => {
        const response = await originalFetch(...args);

        // Create a new response that intercepts the stream
        const originalBody = response.body;
        if (originalBody && !modelDetected) {
          const reader = originalBody.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          // Create a new readable stream that processes chunks
          const stream = new ReadableStream({
            async start(controller) {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  // Pass through the original chunk
                  controller.enqueue(value);

                  // Decode and look for model info if not detected yet
                  if (!modelDetected) {
                    const text = decoder.decode(value, { stream: true });
                    buffer += text;

                    // Look for model in SSE data
                    const lines = buffer.split('\n');
                    for (const line of lines) {
                      if (line.startsWith('data: ') && line.includes('"model":')) {
                        try {
                          const data = JSON.parse(line.substring(6));
                          if (data.model && data.model !== 'openrouter/auto') {
                            this._rawModelDetected = data.model;
                            this.actualModelUsed = data.model;
                            modelDetected = true;
                            logger.info('[ChatOpenRouter] Auto-router detected model from stream:', data.model);
                            break;
                          }
                        } catch (e) {
                          // Not valid JSON, continue
                        }
                      }
                    }
                    // Keep last incomplete line in buffer
                    buffer = lines[lines.length - 1];
                  }
                }
                controller.close();
              } catch (error) {
                controller.error(error);
              }
            }
          });

          // Return a new response with our intercepted stream
          return new Response(stream, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }

        return response;
      };

      // Override fetch temporarily
      if (this.caller.fetch) {
        this.caller.fetch = interceptedFetch;
      } else {
        globalThis.fetch = interceptedFetch;
      }

      try {
        // Call parent implementation with intercepted fetch
        const result = await super.completionWithRetry(request, options);
        return result;
      } finally {
        // Restore original fetch
        if (this.caller.fetch) {
          this.caller.fetch = originalFetch;
        } else {
          globalThis.fetch = originalFetch;
        }
      }
    }

    // For non-auto-router or non-streaming, just call parent
    return super.completionWithRetry(request, options);
  }

  /**
   * Override _streamResponseChunks to detect actual model from OpenRouter streaming response
   */
  async *_streamResponseChunks(messages, options, runManager) {
    const logger = require('~/config').logger;

    // Call parent implementation and wrap the stream
    const parentStream = super._streamResponseChunks(messages, options, runManager);

    let firstChunk = true;
    for await (const chunk of parentStream) {
      // If auto-router is enabled and we detected a model, inject it as the first content
      if (this.autoRouter && this._rawModelDetected && firstChunk && chunk?.text !== undefined) {
        firstChunk = false;

        logger.info('[ChatOpenRouter] Injecting detected model into stream:', this._rawModelDetected);

        // Create a special chunk with model indicator token that frontend expects
        // Include newlines for better isolation as expected by frontend
        const modelIndicator = `\n[OPENROUTER_MODEL:${this._rawModelDetected}]\n`;

        // Yield a text chunk with the model indicator first
        yield {
          ...chunk,
          text: modelIndicator,
          message: {
            ...chunk.message,
            content: modelIndicator,
          },
        };
      }

      // Always yield the original chunk
      yield chunk;
    }
  }

  /**
   * Get the actual model used by auto-router
   */
  getActualModelUsed() {
    return this.actualModelUsed;
  }
}

module.exports = ChatOpenRouter;