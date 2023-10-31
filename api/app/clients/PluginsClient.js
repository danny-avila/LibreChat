const OpenAIClient = require('./OpenAIClient');
const { CallbackManager } = require('langchain/callbacks');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const { initializeCustomAgent, initializeFunctionsAgent } = require('./agents');
const { addImages, buildErrorInput, buildPromptPrefix } = require('./output_parsers');
const checkBalance = require('../../models/checkBalance');
const { formatLangChainMessages } = require('./prompts');
const { isEnabled } = require('../../server/utils');
const { SelfReflectionTool } = require('./tools');
const { loadTools } = require('./tools/util');

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

    if (this.functionsAgent && this.agentOptions.model && !this.useOpenRouter) {
      this.agentOptions.model = this.getFunctionModelName(this.agentOptions.model);
    }

    this.isGpt3 = this.modelOptions?.model?.includes('gpt-3');

    if (this.options.reverseProxyUrl) {
      this.langchainProxy = this.options.reverseProxyUrl.match(/.*v1/)?.[0];
      !this.langchainProxy &&
        console.warn(`The reverse proxy URL ${this.options.reverseProxyUrl} is not valid for Plugins.
The url must follow OpenAI specs, for example: https://localhost:8080/v1/chat/completions
If your reverse proxy is compatible to OpenAI specs in every other way, it may still work without plugins enabled.`);
    }
  }

  getSaveOptions() {
    return {
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      ...this.modelOptions,
      agentOptions: this.agentOptions,
    };
  }

  saveLatestAction(action) {
    this.actions.push(action);
  }

  getFunctionModelName(input) {
    if (input.includes('gpt-3.5-turbo')) {
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

    if (this.options.debug) {
      console.debug(
        `<-----Agent Model: ${model.modelName} | Temp: ${model.temperature} | Functions: ${this.functionsAgent}----->`,
      );
    }

    // Map Messages to Langchain format
    const pastMessages = formatLangChainMessages(this.currentMessages.slice(0, -1), {
      userName: this.options?.name,
    });
    this.options.debug && console.debug('pastMessages: ', pastMessages);

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
        debug: this.options?.debug,
        message,
      },
    });

    if (this.tools.length > 0 && !this.functionsAgent) {
      this.tools.push(new SelfReflectionTool({ message, isGpt3: false }));
    } else if (this.tools.length === 0) {
      return;
    }

    if (this.options.debug) {
      console.debug('Requested Tools');
      console.debug(this.options.tools);
      console.debug('Loaded Tools');
      console.debug(this.tools.map((tool) => tool.name));
    }

    const handleAction = (action, runId, callback = null) => {
      this.saveLatestAction(action);

      if (this.options.debug) {
        console.debug('Latest Agent Action ', this.actions[this.actions.length - 1]);
      }

      if (typeof callback === 'function') {
        callback(action, runId);
      }
    };

    // initialize agent
    const initializer = this.functionsAgent ? initializeFunctionsAgent : initializeCustomAgent;
    this.executor = await initializer({
      model,
      signal,
      pastMessages,
      tools: this.tools,
      currentDateString: this.currentDateString,
      verbose: this.options.debug,
      returnIntermediateSteps: true,
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

    if (this.options.debug) {
      console.debug('Loaded agent.');
    }
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

      if (this.options.debug) {
        console.debug(`Attempt ${attempts} of ${maxAttempts}`);
      }

      if (this.options.debug && errorMessage.length > 0) {
        console.debug('Caught error, input:', input);
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
        console.error(err);
        if (attempts === maxAttempts) {
          const { run } = this.runManager.getRunByConversationId(this.conversationId);
          const defaultOutput = `Encountered an error while attempting to respond. Error: ${err.message}`;
          this.result.output = run && run.error ? run.error : defaultOutput;
          this.result.errorMessage = run && run.error ? run.error : err.message;
          this.result.intermediateSteps = this.actions;
          break;
        }
      }
    }
  }

  async handleResponseMessage(responseMessage, saveOptions, user) {
    const { output, errorMessage, ...result } = this.result;
    this.options.debug &&
      console.debug('[handleResponseMessage] Output:', { output, errorMessage, ...result });
    const { error } = responseMessage;
    if (!error) {
      responseMessage.tokenCount = this.getTokenCountForResponse(responseMessage);
      responseMessage.completionTokens = this.getTokenCount(responseMessage.text);
    }

    // Record usage only when completion is skipped as it is already recorded in the agent phase.
    if (!this.agentOptions.skipCompletion && !error) {
      await this.recordTokenUsage(responseMessage);
    }

    await this.saveMessageToDatabase(responseMessage, saveOptions, user);
    delete responseMessage.tokenCount;
    return { ...responseMessage, ...result };
  }

  async sendMessage(message, opts = {}) {
    // If a message is edited, no tools can be used.
    const completionMode = this.options.tools.length === 0 || opts.isEdited;
    if (completionMode) {
      this.setOptions(opts);
      return super.sendMessage(message, opts);
    }
    this.options.debug && console.log('Plugins sendMessage', message, opts);
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
      console.dir(tokenCountMap, { depth: null });
      if (tokenCountMap[userMessage.messageId]) {
        userMessage.tokenCount = tokenCountMap[userMessage.messageId];
        console.log('userMessage.tokenCount', userMessage.tokenCount);
      }
      this.handleTokenCountMap(tokenCountMap);
    }

    this.result = {};
    if (payload) {
      this.currentMessages = payload;
    }
    await this.saveMessageToDatabase(userMessage, saveOptions, user);

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
        },
      });
    }

    const responseMessage = {
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

    if (this.options.debug) {
      console.debug('Plugins completion phase: this.result');
      console.debug(this.result);
    }

    const promptPrefix = buildPromptPrefix({
      result: this.result,
      message,
      functionsAgent: this.functionsAgent,
    });

    if (this.options.debug) {
      console.debug('Plugins: promptPrefix');
      console.debug(promptPrefix);
    }

    payload = await this.buildCompletionPrompt({
      messages: this.currentMessages,
      promptPrefix,
    });

    if (this.options.debug) {
      console.debug('buildCompletionPrompt Payload');
      console.debug(payload);
    }
    responseMessage.text = await this.sendCompletion(payload, opts);
    return await this.handleResponseMessage(responseMessage, saveOptions, user);
  }

  async buildCompletionPrompt({ messages, promptPrefix: _promptPrefix }) {
    if (this.options.debug) {
      console.debug('buildCompletionPrompt messages', messages);
    }

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
      name: 'instructions',
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
