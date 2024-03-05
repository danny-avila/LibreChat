const Anthropic = require('@anthropic-ai/sdk');
const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('tiktoken');
const { getResponseSender, EModelEndpoint } = require('librechat-data-provider');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { getModelMaxTokens } = require('~/utils');
const { formatMessage } = require('./prompts');
const BaseClient = require('./BaseClient');
const { logger } = require('~/config');

const HUMAN_PROMPT = '\n\nHuman:';
const AI_PROMPT = '\n\nAssistant:';

const tokenizersCache = {};

/** Helper function to introduce a delay before retrying */
function delayBeforeRetry(attempts, baseDelay = 1000) {
  return new Promise((resolve) => setTimeout(resolve, baseDelay * attempts));
}

class AnthropicClient extends BaseClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    this.userLabel = HUMAN_PROMPT;
    this.assistantLabel = AI_PROMPT;
    this.setOptions(options);
  }

  setOptions(options) {
    if (this.options && !this.options.replaceOptions) {
      // nested options aren't spread properly, so we need to do this manually
      this.options.modelOptions = {
        ...this.options.modelOptions,
        ...options.modelOptions,
      };
      delete options.modelOptions;
      // now we can merge options
      this.options = {
        ...this.options,
        ...options,
      };
    } else {
      this.options = options;
    }

    const modelOptions = this.options.modelOptions || {};
    this.modelOptions = {
      ...modelOptions,
      // set some good defaults (check for undefined in some cases because they may be 0)
      model: modelOptions.model || 'claude-1',
      temperature: typeof modelOptions.temperature === 'undefined' ? 1 : modelOptions.temperature, // 0 - 1, 1 is default
      topP: typeof modelOptions.topP === 'undefined' ? 0.7 : modelOptions.topP, // 0 - 1, default: 0.7
      topK: typeof modelOptions.topK === 'undefined' ? 40 : modelOptions.topK, // 1-40, default: 40
      stop: modelOptions.stop, // no stop method for now
    };

    this.isClaude3 = this.modelOptions.model.includes('claude-3');

    if (this.isClaude3) {
      this.useMessages = true;
    }

    this.maxContextTokens =
      getModelMaxTokens(this.modelOptions.model, EModelEndpoint.anthropic) ?? 100000;
    this.maxResponseTokens = this.modelOptions.maxOutputTokens || 1500;
    this.maxPromptTokens =
      this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(
        `maxPromptTokens + maxOutputTokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
          this.maxPromptTokens + this.maxResponseTokens
        }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`,
      );
    }

    this.sender =
      this.options.sender ??
      getResponseSender({
        model: this.modelOptions.model,
        endpoint: EModelEndpoint.anthropic,
        modelLabel: this.options.modelLabel,
      });

    this.startToken = '||>';
    this.endToken = '';
    this.gptEncoder = this.constructor.getTokenizer('cl100k_base');

    if (!this.modelOptions.stop) {
      const stopTokens = [this.startToken];
      if (this.endToken && this.endToken !== this.startToken) {
        stopTokens.push(this.endToken);
      }
      stopTokens.push(`${this.userLabel}`);
      stopTokens.push('<|diff_marker|>');

      this.modelOptions.stop = stopTokens;
    }

    return this;
  }

  getClient() {
    const options = {
      apiKey: this.apiKey,
    };

    if (this.options.reverseProxyUrl) {
      options.baseURL = this.options.reverseProxyUrl;
    }

    return new Anthropic(options);
  }

  async addImageURLs(message, attachments) {
    const { files, image_urls } = await encodeAndFormat(
      this.options.req,
      attachments,
      EModelEndpoint.anthropic,
    );
    message.image_urls = image_urls;
    return files;
  }

  async buildMessages(messages, parentMessageId) {
    const orderedMessages = this.constructor.getMessagesForConversation({
      messages,
      parentMessageId,
    });

    logger.debug('[AnthropicClient] orderedMessages', { orderedMessages, parentMessageId });

    if (!this.isClaude3 && this.options.attachments) {
      throw new Error('Attachments are only supported with the Claude 3 family of models');
    } else if (this.options.attachments) {
      const attachments = (await this.options.attachments).filter((file) =>
        file.type.includes('image'),
      );

      const latestMessage = orderedMessages[orderedMessages.length - 1];

      if (this.message_file_map) {
        this.message_file_map[latestMessage.messageId] = attachments;
      } else {
        this.message_file_map = {
          [latestMessage.messageId]: attachments,
        };
      }

      const files = await this.addImageURLs(latestMessage, attachments);

      this.options.attachments = files;
    }

    const formattedMessages = orderedMessages.map((message) => {
      if (this.useMessages) {
        return formatMessage({
          message,
          endpoint: EModelEndpoint.anthropic,
        });
      }

      return {
        author: message.isCreatedByUser ? this.userLabel : this.assistantLabel,
        content: message?.content ?? message.text,
      };
    });

    let lastAuthor = '';
    let groupedMessages = [];

    for (let message of formattedMessages) {
      const author = message.role ?? message.author;
      // If last author is not same as current author, add to new group
      if (lastAuthor !== author) {
        const newMessage = {
          content: [message.content],
        };

        if (message.role) {
          newMessage.role = message.role;
        } else {
          newMessage.author = message.author;
        }

        groupedMessages.push(newMessage);
        lastAuthor = author;
        // If same author, append content to the last group
      } else {
        groupedMessages[groupedMessages.length - 1].content.push(message.content);
      }
    }

    groupedMessages = groupedMessages.map((msg, i) => {
      const isLast = i === groupedMessages.length - 1;
      if (msg.content.length === 1) {
        const content = msg.content[0];
        return {
          ...msg,
          // reason: final assistant content cannot end with trailing whitespace
          content:
            isLast && msg.role === 'assistant' && typeof content === 'string'
              ? content?.trim()
              : content,
        };
      }

      return msg;
    });

    let identityPrefix = '';
    if (this.options.userLabel) {
      identityPrefix = `\nHuman's name: ${this.options.userLabel}`;
    }

    if (this.options.modelLabel) {
      identityPrefix = `${identityPrefix}\nYou are ${this.options.modelLabel}`;
    }

    let promptPrefix = (this.options.promptPrefix || '').trim();
    if (promptPrefix) {
      // If the prompt prefix doesn't end with the end token, add it.
      if (!promptPrefix.endsWith(`${this.endToken}`)) {
        promptPrefix = `${promptPrefix.trim()}${this.endToken}\n\n`;
      }
      promptPrefix = `\nContext:\n${promptPrefix}`;
    }

    if (identityPrefix) {
      promptPrefix = `${identityPrefix}${promptPrefix}`;
    }

    // Prompt AI to respond, empty if last message was from AI
    let isEdited = lastAuthor === this.assistantLabel;
    const promptSuffix = isEdited ? '' : `${promptPrefix}${this.assistantLabel}\n`;
    let currentTokenCount = isEdited
      ? this.getTokenCount(promptPrefix)
      : this.getTokenCount(promptSuffix);

    let promptBody = '';
    const maxTokenCount = this.maxPromptTokens;

    const context = [];

    // Iterate backwards through the messages, adding them to the prompt until we reach the max token count.
    // Do this within a recursive async function so that it doesn't block the event loop for too long.
    // Also, remove the next message when the message that puts us over the token limit is created by the user.
    // Otherwise, remove only the exceeding message. This is due to Anthropic's strict payload rule to start with "Human:".
    const nextMessage = {
      remove: false,
      tokenCount: 0,
      messageString: '',
    };

    const buildPromptBody = async () => {
      if (currentTokenCount < maxTokenCount && groupedMessages.length > 0) {
        const message = groupedMessages.pop();
        const isCreatedByUser = message.author === this.userLabel;
        // Use promptPrefix if message is edited assistant'
        const messagePrefix =
          isCreatedByUser || !isEdited ? message.author : `${promptPrefix}${message.author}`;
        const messageString = `${messagePrefix}\n${message.content}${this.endToken}\n`;
        let newPromptBody = `${messageString}${promptBody}`;

        context.unshift(message);

        const tokenCountForMessage = this.getTokenCount(messageString);
        const newTokenCount = currentTokenCount + tokenCountForMessage;

        if (!isCreatedByUser) {
          nextMessage.messageString = messageString;
          nextMessage.tokenCount = tokenCountForMessage;
        }

        if (newTokenCount > maxTokenCount) {
          if (!promptBody) {
            // This is the first message, so we can't add it. Just throw an error.
            throw new Error(
              `Prompt is too long. Max token count is ${maxTokenCount}, but prompt is ${newTokenCount} tokens long.`,
            );
          }

          // Otherwise, ths message would put us over the token limit, so don't add it.
          // if created by user, remove next message, otherwise remove only this message
          if (isCreatedByUser) {
            nextMessage.remove = true;
          }

          return false;
        }
        promptBody = newPromptBody;
        currentTokenCount = newTokenCount;

        // Switch off isEdited after using it for the first time
        if (isEdited) {
          isEdited = false;
        }

        // wait for next tick to avoid blocking the event loop
        await new Promise((resolve) => setImmediate(resolve));
        return buildPromptBody();
      }
      return true;
    };

    const messagesPayload = [];
    const buildMessagesPayload = async () => {
      let canContinue = true;

      if (promptPrefix) {
        this.systemMessage = promptPrefix;
      }

      let i = 0;
      while (currentTokenCount < maxTokenCount && groupedMessages.length > 0 && canContinue) {
        const message = groupedMessages.pop();

        let tokenCountForMessage = this.getTokenCountForMessage(message);
        if (i === 0) {
          tokenCountForMessage += this.getTokenCount(promptPrefix);
          i++;
        }
        const newTokenCount = currentTokenCount + tokenCountForMessage;
        const exceededMaxCount = newTokenCount > maxTokenCount;

        if (exceededMaxCount && messagesPayload.length === 0) {
          throw new Error(
            `Prompt is too long. Max token count is ${maxTokenCount}, but prompt is ${newTokenCount} tokens long.`,
          );
        } else if (exceededMaxCount) {
          canContinue = false;
          break;
        }

        messagesPayload.unshift(message);
        currentTokenCount = newTokenCount;

        // Switch off isEdited after using it once
        if (isEdited && message.role === 'assistant') {
          isEdited = false;
        }

        // Wait for next tick to avoid blocking the event loop
        await new Promise((resolve) => setImmediate(resolve));
      }
    };

    const processTokens = () => {
      // Add 2 tokens for metadata after all messages have been counted.
      currentTokenCount += 2;

      // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
      this.modelOptions.maxOutputTokens = Math.min(
        this.maxContextTokens - currentTokenCount,
        this.maxResponseTokens,
      );
    };

    if (this.modelOptions.model.startsWith('claude-3')) {
      await buildMessagesPayload();
      processTokens();
      return { prompt: messagesPayload, context };
    } else {
      await buildPromptBody();
      processTokens();
    }

    if (nextMessage.remove) {
      promptBody = promptBody.replace(nextMessage.messageString, '');
      currentTokenCount -= nextMessage.tokenCount;
      context.shift();
    }

    let prompt = `${promptBody}${promptSuffix}`;

    return { prompt, context };
  }

  getCompletion() {
    logger.debug('AnthropicClient doesn\'t use getCompletion (all handled in sendCompletion)');
  }

  async createResponse(client, options) {
    return this.useMessages
      ? await client.messages.create(options)
      : await client.completions.create(options);
  }

  async sendCompletion(payload, { onProgress, abortController }) {
    if (!abortController) {
      abortController = new AbortController();
    }

    const { signal } = abortController;

    const modelOptions = { ...this.modelOptions };
    if (typeof onProgress === 'function') {
      modelOptions.stream = true;
    }

    logger.debug('modelOptions', { modelOptions });

    const client = this.getClient();
    const metadata = {
      user_id: this.user,
    };

    let text = '';
    const {
      stream,
      model,
      temperature,
      maxOutputTokens,
      stop: stop_sequences,
      topP: top_p,
      topK: top_k,
    } = this.modelOptions;

    const requestOptions = {
      model,
      stream: stream || true,
      stop_sequences,
      temperature,
      metadata,
      top_p,
      top_k,
    };

    if (this.useMessages) {
      requestOptions.messages = payload;
      requestOptions.max_tokens = maxOutputTokens || 1500;
    } else {
      requestOptions.prompt = payload;
      requestOptions.max_tokens_to_sample = maxOutputTokens || 1500;
    }

    if (this.systemMessage) {
      requestOptions.system = this.systemMessage;
    }

    logger.debug('[AnthropicClient]', { ...requestOptions });

    const handleChunk = (currentChunk) => {
      if (currentChunk) {
        text += currentChunk;
        onProgress(currentChunk);
      }
    };

    const maxRetries = 3;
    async function processResponse() {
      let attempts = 0;

      while (attempts < maxRetries) {
        let response;
        try {
          response = await this.createResponse(client, requestOptions);

          signal.addEventListener('abort', () => {
            logger.debug('[AnthropicClient] message aborted!');
            if (response.controller?.abort) {
              response.controller.abort();
            }
          });

          for await (const completion of response) {
            // Handle each completion as before
            if (completion?.delta?.text) {
              handleChunk(completion.delta.text);
            } else if (completion.completion) {
              handleChunk(completion.completion);
            }
          }

          // Successful processing, exit loop
          break;
        } catch (error) {
          attempts += 1;
          logger.warn(
            `User: ${this.user} | Anthropic Request ${attempts} failed: ${error.message}`,
          );

          if (attempts < maxRetries) {
            await delayBeforeRetry(attempts, 350);
          } else {
            throw new Error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
          }
        } finally {
          signal.removeEventListener('abort', () => {
            logger.debug('[AnthropicClient] message aborted!');
            if (response.controller?.abort) {
              response.controller.abort();
            }
          });
        }
      }
    }

    await processResponse.bind(this)();

    return text.trim();
  }

  getSaveOptions() {
    return {
      promptPrefix: this.options.promptPrefix,
      modelLabel: this.options.modelLabel,
      ...this.modelOptions,
    };
  }

  getBuildMessagesOptions() {
    logger.debug('AnthropicClient doesn\'t use getBuildMessagesOptions');
  }

  static getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
    if (tokenizersCache[encoding]) {
      return tokenizersCache[encoding];
    }
    let tokenizer;
    if (isModelName) {
      tokenizer = encodingForModel(encoding, extendSpecialTokens);
    } else {
      tokenizer = getEncoding(encoding, extendSpecialTokens);
    }
    tokenizersCache[encoding] = tokenizer;
    return tokenizer;
  }

  getTokenCount(text) {
    return this.gptEncoder.encode(text, 'all').length;
  }
}

module.exports = AnthropicClient;
