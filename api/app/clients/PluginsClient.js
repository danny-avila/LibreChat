const OpenAIClient = require('./OpenAIClient');
const { CacheKeys, Time } = require('librechat-data-provider');
const { CallbackManager } = require('@langchain/core/callbacks/manager');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const { addImages, buildErrorInput, buildPromptPrefix } = require('./output_parsers');
const { initializeCustomAgent, initializeFunctionsAgent } = require('./agents');
const { processFileURL } = require('~/server/services/Files/process');
const { EModelEndpoint } = require('librechat-data-provider');
const { formatLangChainMessages } = require('./prompts');
const checkBalance = require('~/models/checkBalance');
const { isEnabled } = require('~/server/utils');
const { extractBaseURL } = require('~/utils');
const { loadTools } = require('./tools/util');
const { getLogStores } = require('~/cache');
const { logger } = require('~/config');

class PluginsClient extends OpenAIClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.sender = options.sender ?? 'Assistant';
    this.tools = [];
    this.actions = [];
    this.setOptions(options);
    this.openAIApiKey = this.apiKey;
    this.executor = null;
  }

  setOptions(options) {
    this.agentOptions = { ...options.agentOptions };
    this.functionsAgent = this.agentOptions?.agent === 'functions';
    this.agentIsGpt3 = this.agentOptions?.model?.includes('gpt-3');

    super.setOptions(options);

    this.isGpt3 = this.modelOptions?.model?.includes('gpt-3');

    if (this.options.reverseProxyUrl) {
      this.langchainProxy = extractBaseURL(this.options.reverseProxyUrl);
    }
  }

  getSaveOptions() {
    return {
      artifacts: this.options.artifacts,
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      tools: this.options.tools,
      ...this.modelOptions,
      agentOptions: this.agentOptions,
      iconURL: this.options.iconURL,
      greeting: this.options.greeting,
      spec: this.options.spec,
    };
  }

  saveLatestAction(action) {
    this.actions.push(action);
  }

  getFunctionModelName(input) {
    if (/-(?!0314)\d{4}/.test(input)) {
      return input;
    } else if (input.includes('gpt-3.5-turbo')) {
      return 'gpt-3.5-turbo';
    } else if (input.includes('gpt-4')) {
      return 'gpt-4';
    } else {
      return 'gpt-3.5-turbo';
    }
  }

  getBuildMessagesOptions(opts) {
    return {
      isChatCompletion: true,
      promptPrefix: opts.promptPrefix,
      abortController: opts.abortController,
    };
  }

  async initialize({ user, message, onAgentAction, onChainEnd, signal }) {
    const modelOptions = {
      modelName: this.agentOptions.model,
      temperature: this.agentOptions.temperature,
    };

    const model = this.initializeLLM({
      ...modelOptions,
      context: 'plugins',
      initialMessageCount: this.currentMessages.length + 1,
    });

    logger.debug(
      `[PluginsClient] Agent Model: ${model.modelName} | Temp: ${model.temperature} | Functions: ${this.functionsAgent}`,
    );

    // Map Messages to Langchain format
    const pastMessages = formatLangChainMessages(this.currentMessages.slice(0, -1), {
      userName: this.options?.name,
    });
    logger.debug('[PluginsClient] pastMessages: ' + pastMessages.length);

    // TODO: use readOnly memory, TokenBufferMemory? (both unavailable in LangChainJS)
    const memory = new BufferMemory({
      llm: model,
      chatHistory: new ChatMessageHistory(pastMessages),
    });

    this.tools = await loadTools({
      user,
      model,
      tools: this.options.tools,
      functions: this.functionsAgent,
      options: {
        memory,
        signal: this.abortController.signal,
        openAIApiKey: this.openAIApiKey,
        conversationId: this.conversationId,
        fileStrategy: this.options.req.app.locals.fileStrategy,
        processFileURL,
        message,
      },
    });

    if (this.tools.length === 0) {
      return;
    }

    logger.debug('[PluginsClient] Requested Tools', this.options.tools);
    logger.debug(
      '[PluginsClient] Loaded Tools',
      this.tools.map((tool) => tool.name),
    );

    const handleAction = (action, runId, callback = null) => {
      this.saveLatestAction(action);

      logger.debug('[PluginsClient] Latest Agent Action ', this.actions[this.actions.length - 1]);

      if (typeof callback === 'function') {
        callback(action, runId);
      }
    };

    // initialize agent
    const initializer = this.functionsAgent ? initializeFunctionsAgent : initializeCustomAgent;

    let customInstructions = (this.options.promptPrefix ?? '').trim();
    if (typeof this.options.artifactsPrompt === 'string' && this.options.artifactsPrompt) {
      customInstructions = `${customInstructions ?? ''}\n${this.options.artifactsPrompt}`.trim();
    }

    this.executor = await initializer({
      model,
      signal,
      pastMessages,
      tools: this.tools,
      customInstructions,
      verbose: this.options.debug,
      returnIntermediateSteps: true,
      customName: this.options.chatGptLabel,
      currentDateString: this.currentDateString,
      callbackManager: CallbackManager.fromHandlers({
        async handleAgentAction(action, runId) {
          handleAction(action, runId, onAgentAction);
        },
        async handleChainEnd(action) {
          if (typeof onChainEnd === 'function') {
            onChainEnd(action);
          }
        },
      }),
    });

    logger.debug('[PluginsClient] Loaded agent.');
  }

  async executorCall(message, { signal, stream, onToolStart, onToolEnd }) {
    let errorMessage = '';
    const maxAttempts = 1;

    for (let attempts = 1; attempts <= maxAttempts; attempts++) {
      const errorInput = buildErrorInput({
        message,
        errorMessage,
        actions: this.actions,
        functionsAgent: this.functionsAgent,
      });
      const input = attempts > 1 ? errorInput : message;

      logger.debug(`[PluginsClient] Attempt ${attempts} of ${maxAttempts}`);

      if (errorMessage.length > 0) {
        logger.debug('[PluginsClient] Caught error, input: ' + JSON.stringify(input));
      }

      try {
        this.result = await this.executor.call({ input, signal }, [
          {
            async handleToolStart(...args) {
              await onToolStart(...args);
            },
            async handleToolEnd(...args) {
              await onToolEnd(...args);
            },
            async handleLLMEnd(output) {
              const { generations } = output;
              const { text } = generations[0][0];
              if (text && typeof stream === 'function') {
                await stream(text);
              }
            },
          },
        ]);
        break; // Exit the loop if the function call is successful
      } catch (err) {
        logger.error('[PluginsClient] executorCall error:', err);
        if (attempts === maxAttempts) {
          const { run } = this.runManager.getRunByConversationId(this.conversationId);
          const defaultOutput = `Encountered an error while attempting to respond: ${err.message}`;
          this.result.output = run && run.error ? run.error : defaultOutput;
          this.result.errorMessage = run && run.error ? run.error : err.message;
          this.result.intermediateSteps = this.actions;
          break;
        }
      }
    }
  }

  /**
   *
   * @param {TMessage} responseMessage
   * @param {Partial<TMessage>} saveOptions
   * @param {string} user
   * @returns
   */
  async handleResponseMessage(responseMessage, saveOptions, user) {
    const { output, errorMessage, ...result } = this.result;
    logger.debug('[PluginsClient][handleResponseMessage] Output:', {
      output,
      errorMessage,
      ...result,
    });
    const { error } = responseMessage;
    if (!error) {
      responseMessage.tokenCount = this.getTokenCountForResponse(responseMessage);
      responseMessage.completionTokens = this.getTokenCount(responseMessage.text);
    }

    // Record usage only when completion is skipped as it is already recorded in the agent phase.
    if (!this.agentOptions.skipCompletion && !error) {
      await this.recordTokenUsage(responseMessage);
    }

    this.responsePromise = this.saveMessageToDatabase(responseMessage, saveOptions, user);
    const messageCache = getLogStores(CacheKeys.MESSAGES);
    messageCache.set(
      responseMessage.messageId,
      {
        text: responseMessage.text,
        complete: true,
      },
      Time.FIVE_MINUTES,
    );
    delete responseMessage.tokenCount;
    return { ...responseMessage, ...result };
  }

  async sendMessage(message, opts = {}) {
    /** @type {{ filteredTools: string[], includedTools: string[] }} */
    const { filteredTools = [], includedTools = [] } = this.options.req.app.locals;

    if (includedTools.length > 0) {
      const tools = this.options.tools.filter((plugin) => includedTools.includes(plugin));
      this.options.tools = tools;
    } else {
      const tools = this.options.tools.filter((plugin) => !filteredTools.includes(plugin));
      this.options.tools = tools;
    }

    // If a message is edited, no tools can be used.
    const completionMode = this.options.tools.length === 0 || opts.isEdited;
    if (completionMode) {
      this.setOptions(opts);
      return super.sendMessage(message, opts);
    }

    logger.debug('[PluginsClient] sendMessage', { userMessageText: message, opts });
    const {
      user,
      isEdited,
      conversationId,
      responseMessageId,
      saveOptions,
      userMessage,
      onAgentAction,
      onChainEnd,
      onToolStart,
      onToolEnd,
    } = await this.handleStartMethods(message, opts);

    if (opts.progressCallback) {
      opts.onProgress = opts.progressCallback.call(null, {
        ...(opts.progressOptions ?? {}),
        parentMessageId: userMessage.messageId,
        messageId: responseMessageId,
      });
    }

    this.currentMessages.push(userMessage);

    let {
      prompt: payload,
      tokenCountMap,
      promptTokens,
    } = await this.buildMessages(
      this.currentMessages,
      userMessage.messageId,
      this.getBuildMessagesOptions({
        promptPrefix: null,
        abortController: this.abortController,
      }),
    );

    if (tokenCountMap) {
      logger.debug('[PluginsClient] tokenCountMap', { tokenCountMap });
      if (tokenCountMap[userMessage.messageId]) {
        userMessage.tokenCount = tokenCountMap[userMessage.messageId];
        logger.debug('[PluginsClient] userMessage.tokenCount', userMessage.tokenCount);
      }
      this.handleTokenCountMap(tokenCountMap);
    }

    this.result = {};
    if (payload) {
      this.currentMessages = payload;
    }

    if (!this.skipSaveUserMessage) {
      this.userMessagePromise = this.saveMessageToDatabase(userMessage, saveOptions, user);
      if (typeof opts?.getReqData === 'function') {
        opts.getReqData({
          userMessagePromise: this.userMessagePromise,
        });
      }
    }

    if (isEnabled(process.env.CHECK_BALANCE)) {
      await checkBalance({
        req: this.options.req,
        res: this.options.res,
        txData: {
          user: this.user,
          tokenType: 'prompt',
          amount: promptTokens,
          debug: this.options.debug,
          model: this.modelOptions.model,
          endpoint: EModelEndpoint.openAI,
        },
      });
    }

    const responseMessage = {
      endpoint: EModelEndpoint.gptPlugins,
      iconURL: this.options.iconURL,
      messageId: responseMessageId,
      conversationId,
      parentMessageId: userMessage.messageId,
      isCreatedByUser: false,
      isEdited,
      model: this.modelOptions.model,
      sender: this.sender,
      promptTokens,
    };

    await this.initialize({
      user,
      message,
      onAgentAction,
      onChainEnd,
      signal: this.abortController.signal,
      onProgress: opts.onProgress,
    });

    // const stream = async (text) => {
    //   await this.generateTextStream.call(this, text, opts.onProgress, { delay: 1 });
    // };
    await this.executorCall(message, {
      signal: this.abortController.signal,
      // stream,
      onToolStart,
      onToolEnd,
    });

    // If message was aborted mid-generation
    if (this.result?.errorMessage?.length > 0 && this.result?.errorMessage?.includes('cancel')) {
      responseMessage.text = 'Cancelled.';
      return await this.handleResponseMessage(responseMessage, saveOptions, user);
    }

    // If error occurred during generation (likely token_balance)
    if (this.result?.errorMessage?.length > 0) {
      responseMessage.error = true;
      responseMessage.text = this.result.output;
      return await this.handleResponseMessage(responseMessage, saveOptions, user);
    }

    if (this.agentOptions.skipCompletion && this.result.output && this.functionsAgent) {
      const partialText = opts.getPartialText();
      const trimmedPartial = opts.getPartialText().replaceAll(':::plugin:::\n', '');
      responseMessage.text =
        trimmedPartial.length === 0 ? `${partialText}${this.result.output}` : partialText;
      addImages(this.result.intermediateSteps, responseMessage);
      await this.generateTextStream(this.result.output, opts.onProgress, { delay: 5 });
      return await this.handleResponseMessage(responseMessage, saveOptions, user);
    }

    if (this.agentOptions.skipCompletion && this.result.output) {
      responseMessage.text = this.result.output;
      addImages(this.result.intermediateSteps, responseMessage);
      await this.generateTextStream(this.result.output, opts.onProgress, { delay: 5 });
      return await this.handleResponseMessage(responseMessage, saveOptions, user);
    }

    logger.debug('[PluginsClient] Completion phase: this.result', this.result);

    const promptPrefix = buildPromptPrefix({
      result: this.result,
      message,
      functionsAgent: this.functionsAgent,
    });

    logger.debug('[PluginsClient]', { promptPrefix });

    payload = await this.buildCompletionPrompt({
      messages: this.currentMessages,
      promptPrefix,
    });

    logger.debug('[PluginsClient] buildCompletionPrompt Payload', payload);
    responseMessage.text = await this.sendCompletion(payload, opts);
    return await this.handleResponseMessage(responseMessage, saveOptions, user);
  }

  async buildCompletionPrompt({ messages, promptPrefix: _promptPrefix }) {
    logger.debug('[PluginsClient] buildCompletionPrompt messages', messages);

    const orderedMessages = messages;
    let promptPrefix = _promptPrefix.trim();
    // If the prompt prefix doesn't end with the end token, add it.
    if (!promptPrefix.endsWith(`${this.endToken}`)) {
      promptPrefix = `${promptPrefix.trim()}${this.endToken}\n\n`;
    }
    promptPrefix = `${this.startToken}Instructions:\n${promptPrefix}`;
    const promptSuffix = `${this.startToken}${this.chatGptLabel ?? 'Assistant'}:\n`;

    const instructionsPayload = {
      role: 'system',
      content: promptPrefix,
    };

    const messagePayload = {
      role: 'system',
      content: promptSuffix,
    };

    if (this.isGpt3) {
      instructionsPayload.role = 'user';
      messagePayload.role = 'user';
      instructionsPayload.content += `\n${promptSuffix}`;
    }

    // testing if this works with browser endpoint
    if (!this.isGpt3 && this.options.reverseProxyUrl) {
      instructionsPayload.role = 'user';
    }

    let currentTokenCount =
      this.getTokenCountForMessage(instructionsPayload) +
      this.getTokenCountForMessage(messagePayload);

    let promptBody = '';
    const maxTokenCount = this.maxPromptTokens;
    // Iterate backwards through the messages, adding them to the prompt until we reach the max token count.
    // Do this within a recursive async function so that it doesn't block the event loop for too long.
    const buildPromptBody = async () => {
      if (currentTokenCount < maxTokenCount && orderedMessages.length > 0) {
        const message = orderedMessages.pop();
        const isCreatedByUser = message.isCreatedByUser || message.role?.toLowerCase() === 'user';
        const roleLabel = isCreatedByUser ? this.userLabel : this.chatGptLabel;
        let messageString = `${this.startToken}${roleLabel}:\n${
          message.text ?? message.content ?? ''
        }${this.endToken}\n`;
        let newPromptBody = `${messageString}${promptBody}`;

        const tokenCountForMessage = this.getTokenCount(messageString);
        const newTokenCount = currentTokenCount + tokenCountForMessage;
        if (newTokenCount > maxTokenCount) {
          if (promptBody) {
            // This message would put us over the token limit, so don't add it.
            return false;
          }
          // This is the first message, so we can't add it. Just throw an error.
          throw new Error(
            `Prompt is too long. Max token count is ${maxTokenCount}, but prompt is ${newTokenCount} tokens long.`,
          );
        }
        promptBody = newPromptBody;
        currentTokenCount = newTokenCount;
        // wait for next tick to avoid blocking the event loop
        await new Promise((resolve) => setTimeout(resolve, 0));
        return buildPromptBody();
      }
      return true;
    };

    await buildPromptBody();
    const prompt = promptBody;
    messagePayload.content = prompt;
    // Add 2 tokens for metadata after all messages have been counted.
    currentTokenCount += 2;

    if (this.isGpt3 && messagePayload.content.length > 0) {
      const context = 'Chat History:\n';
      messagePayload.content = `${context}${prompt}`;
      currentTokenCount += this.getTokenCount(context);
    }

    // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
    this.modelOptions.max_tokens = Math.min(
      this.maxContextTokens - currentTokenCount,
      this.maxResponseTokens,
    );

    if (this.isGpt3) {
      messagePayload.content += promptSuffix;
      return [instructionsPayload, messagePayload];
    }

    const result = [messagePayload, instructionsPayload];

    if (this.functionsAgent && !this.isGpt3) {
      result[1].content = `${result[1].content}\n${this.startToken}${this.chatGptLabel}:\nSure thing! Here is the output you requested:\n`;
    }

    return result.filter((message) => message.content.length > 0);
  }
}

module.exports = PluginsClient;
