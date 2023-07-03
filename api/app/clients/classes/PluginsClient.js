const OpenAIClient = require('./OpenAIClient');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { CallbackManager } = require('langchain/callbacks');
const { initializeCustomAgent, initializeFunctionsAgent } = require('./agents/');
const { loadTools } = require('./tools/util');
const { SelfReflectionTool } = require('./tools/');
const { HumanChatMessage, AIChatMessage } = require('langchain/schema');
const {
  instructions,
  imageInstructions,
  errorInstructions,
} = require('./instructions');

class PluginsClient extends OpenAIClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.sender = options.sender ?? 'Assistant';
    this.tools = [];
    this.actions = [];
    this.openAIApiKey = apiKey;
    this.setOptions(options);
    this.executor = null;
    this.contextStrategy = options.contextStrategy ? options.contextStrategy.toLowerCase() : 'discard';
    this.currentDateString = new Date().toLocaleDateString('en-us', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  getActions(input = null) {
    let output = 'Internal thoughts & actions taken:\n"';
    let actions = input || this.actions;

    if (actions[0]?.action && this.functionsAgent) {
      actions = actions.map((step) => ({
        log: `Action: ${step.action?.tool || ''}\nInput: ${JSON.stringify(step.action?.toolInput) || ''}\nObservation: ${step.observation}`
      }));
    } else if (actions[0]?.action) {
      actions = actions.map((step) => ({
        log: `${step.action.log}\nObservation: ${step.observation}`
      }));
    }

    actions.forEach((actionObj, index) => {
      output += `${actionObj.log}`;
      if (index < actions.length - 1) {
        output += '\n';
      }
    });

    return output + '"';
  }

  buildErrorInput(message, errorMessage) {
    const log = errorMessage.includes('Could not parse LLM output:')
      ? `A formatting error occurred with your response to the human's last message. You didn't follow the formatting instructions. Remember to ${instructions}`
      : `You encountered an error while replying to the human's last message. Attempt to answer again or admit an answer cannot be given.\nError: ${errorMessage}`;

    return `
      ${log}

      ${this.getActions()}

      Human's last message: ${message}
      `;
  }

  buildPromptPrefix(result, message) {
    if ((result.output && result.output.includes('N/A')) || result.output === undefined) {
      return null;
    }

    if (
      result?.intermediateSteps?.length === 1 &&
      result?.intermediateSteps[0]?.action?.toolInput === 'N/A'
    ) {
      return null;
    }

    const internalActions =
      result?.intermediateSteps?.length > 0
        ? this.getActions(result.intermediateSteps)
        : 'Internal Actions Taken: None';

    const toolBasedInstructions = internalActions.toLowerCase().includes('image')
      ? imageInstructions
      : '';

    const errorMessage = result.errorMessage ? `${errorInstructions} ${result.errorMessage}\n` : '';

    const preliminaryAnswer =
      result.output?.length > 0 ? `Preliminary Answer: "${result.output.trim()}"` : '';
    const prefix = preliminaryAnswer
      ? `review and improve the answer you generated using plugins in response to the User Message below. The user hasn't seen your answer or thoughts yet.`
      : 'respond to the User Message below based on your preliminary thoughts & actions.';

    return `As a helpful AI Assistant, ${prefix}${errorMessage}\n${internalActions}
${preliminaryAnswer}
Reply conversationally to the User based on your ${
  preliminaryAnswer ? 'preliminary answer, ' : ''
}internal actions, thoughts, and observations, making improvements wherever possible, but do not modify URLs.
${
  preliminaryAnswer
    ? ''
    : '\nIf there is an incomplete thought or action, you are expected to complete it in your response now.\n'
}You must cite sources if you are using any web links. ${toolBasedInstructions}
Only respond with your conversational reply to the following User Message:
"${message}"`;
  }

  setOptions(options) {
    this.agentOptions = options.agentOptions;
    this.functionsAgent = this.agentOptions?.agent === 'functions';
    this.agentIsGpt3 = this.agentOptions?.model.startsWith('gpt-3');
    if (this.functionsAgent && this.agentOptions.model) {
      this.agentOptions.model = this.getFunctionModelName(this.agentOptions.model);
    }

    super.setOptions(options);
    this.isGpt3 = this.modelOptions.model.startsWith('gpt-3');

    if (this.reverseProxyUrl) {
      this.langchainProxy = this.reverseProxyUrl.match(/.*v1/)[0];
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
    const prefixMap = {
      'gpt-4': 'gpt-4-0613',
      'gpt-4-32k': 'gpt-4-32k-0613',
      'gpt-3.5-turbo': 'gpt-3.5-turbo-0613'
    };

    const prefix = Object.keys(prefixMap).find(key => input.startsWith(key));
    return prefix ? prefixMap[prefix] : 'gpt-3.5-turbo-0613';
  }

  getBuildMessagesOptions(opts) {
    return {
      isChatCompletion: true,
      promptPrefix: opts.promptPrefix,
      abortController: opts.abortController,
    };
  }

  createLLM(modelOptions, configOptions) {
    let credentials = { openAIApiKey: this.openAIApiKey };
    if (this.azure) {
      credentials = { ...this.azure };
    }

    if (this.options.debug) {
      console.debug('createLLM: configOptions');
      console.debug(configOptions);
    }

    return new ChatOpenAI({ credentials, ...modelOptions }, configOptions);
  }

  async initialize({ user, message, onAgentAction, onChainEnd, signal }) {
    const modelOptions = {
      modelName: this.agentOptions.model,
      temperature: this.agentOptions.temperature
    };

    const configOptions = {};

    if (this.langchainProxy) {
      configOptions.basePath = this.langchainProxy;
    }

    const model = this.createLLM(modelOptions, configOptions);

    if (this.options.debug) {
      console.debug(`<-----Agent Model: ${model.modelName} | Temp: ${model.temperature}----->`);
    }

    this.availableTools = await loadTools({
      user,
      model,
      tools: this.options.tools,
      functions: this.functionsAgent,
      options: {
        openAIApiKey: this.openAIApiKey
      }
    });
    // load tools
    for (const tool of this.options.tools) {
      const validTool = this.availableTools[tool];

      if (tool === 'plugins') {
        const plugins = await validTool();
        this.tools = [...this.tools, ...plugins];
      } else if (validTool) {
        this.tools.push(await validTool());
      }
    }

    if (this.options.debug) {
      console.debug('Requested Tools');
      console.debug(this.options.tools);
      console.debug('Loaded Tools');
      console.debug(this.tools.map((tool) => tool.name));
    }

    if (this.tools.length > 0 && !this.functionsAgent) {
      this.tools.push(new SelfReflectionTool({ message, isGpt3: false }));
    } else if (this.tools.length === 0) {
      return;
    }

    const handleAction = (action, callback = null) => {
      this.saveLatestAction(action);

      if (this.options.debug) {
        console.debug('Latest Agent Action ', this.actions[this.actions.length - 1]);
      }

      if (typeof callback === 'function') {
        callback(action);
      }
    };

    // Map Messages to Langchain format
    const pastMessages = this.currentMessages.slice(0,-1).map(
      msg => msg?.isCreatedByUser || msg?.role?.toLowerCase() === 'user'
        ? new HumanChatMessage(msg.text)
        : new AIChatMessage(msg.text));

    if (this.options.debug) {
      console.debug('Current Messages');
      console.debug(this.currentMessages);
      console.debug('Past Messages');
      console.debug(pastMessages);
    }

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
        async handleAgentAction(action) {
          handleAction(action, onAgentAction);
        },
        async handleChainEnd(action) {
          if (typeof onChainEnd === 'function') {
            onChainEnd(action);
          }
        }
      })
    });

    if (this.options.debug) {
      console.debug('Loaded agent.');
    }
  }

  async executorCall(message, signal) {
    let errorMessage = '';
    const maxAttempts = 1;

    for (let attempts = 1; attempts <= maxAttempts; attempts++) {
      const errorInput = this.buildErrorInput(message, errorMessage);
      const input = attempts > 1 ? errorInput : message;

      if (this.options.debug) {
        console.debug(`Attempt ${attempts} of ${maxAttempts}`);
      }

      if (this.options.debug && errorMessage.length > 0) {
        console.debug('Caught error, input:', input);
      }

      try {
        this.result = await this.executor.call({ input, signal });
        break; // Exit the loop if the function call is successful
      } catch (err) {
        console.error(err);
        errorMessage = err.message;
        if (attempts === maxAttempts) {
          this.result.output = `Encountered an error while attempting to respond. Error: ${err.message}`;
          this.result.intermediateSteps = this.actions;
          this.result.errorMessage = errorMessage;
          break;
        }
      }
    }
  }

  addImages(intermediateSteps, responseMessage) {
    if (!intermediateSteps || !responseMessage) {
      return;
    }

    intermediateSteps.forEach(step => {
      const { observation } = step;
      if (!observation || !observation.includes('![')) {
        return;
      }

      if (!responseMessage.text.includes(observation)) {
        responseMessage.text += '\n' + observation;
        if (this.options.debug) {
          console.debug('added image from intermediateSteps');
        }
      }
    });
  }

  async handleResponseMessage(responseMessage, saveOptions, user) {
    responseMessage.tokenCount = this.getTokenCountForResponse(responseMessage);
    responseMessage.completionTokens = responseMessage.tokenCount;
    await this.saveMessageToDatabase(responseMessage, saveOptions, user);
    delete responseMessage.tokenCount;
    return { ...responseMessage, ...this.result };
  }

  async sendMessage(message, opts = {}) {
    const completionMode = this.options.tools.length === 0;
    if (completionMode) {
      this.setOptions(opts);
      return super.sendMessage(message, opts);
    }
    console.log('Plugins sendMessage', message, opts);
    const {
      user,
      conversationId,
      responseMessageId,
      saveOptions,
      userMessage,
      onAgentAction,
      onChainEnd,
    } = await this.handleStartMethods(message, opts);

    let { prompt: payload, tokenCountMap, promptTokens, messages } = await this.buildMessages(
      this.currentMessages,
      userMessage.messageId,
      this.getBuildMessagesOptions({
        promptPrefix: null,
        abortController: this.abortController,
      }),
    );

    if (this.options.debug) {
      console.debug('buildMessages: Messages');
      console.debug(messages);
    }

    if (tokenCountMap) {
      payload = payload.map((message, i) => {
        const { tokenCount, ...messageWithoutTokenCount } = message;
        // userMessage is always the last one in the payload
        if (i === payload.length - 1) {
          userMessage.tokenCount = message.tokenCount;
          console.debug(`Token count for user message: ${tokenCount}`, `Instruction Tokens: ${tokenCountMap.instructions || 'N/A'}`);
        }
        return messageWithoutTokenCount;
      });
      this.handleTokenCountMap(tokenCountMap);
    }

    this.result = {};
    if (messages) {
      this.currentMessages = messages;
    }
    await this.saveMessageToDatabase(userMessage, saveOptions, user);
    const responseMessage = {
      messageId: responseMessageId,
      conversationId,
      parentMessageId: userMessage.messageId,
      isCreatedByUser: false,
      model: this.modelOptions.model,
      sender: this.sender,
      promptTokens,
    };

    await this.initialize({
      user,
      message,
      onAgentAction,
      onChainEnd,
      signal: this.abortController.signal
    });
    await this.executorCall(message, this.abortController.signal);

    // If message was aborted mid-generation
    if (this.result?.errorMessage?.length > 0 && this.result?.errorMessage?.includes('cancel')) {
      responseMessage.text = 'Cancelled.';
      return await this.handleResponseMessage(responseMessage, saveOptions, user);
    }

    if (this.agentOptions.skipCompletion && this.result.output) {
      responseMessage.text = this.result.output;
      this.addImages(this.result.intermediateSteps, responseMessage);
      await this.generateTextStream(this.result.output, opts.onProgress);
      return await this.handleResponseMessage(responseMessage, saveOptions, user);
    }

    if (this.options.debug) {
      console.debug('Plugins completion phase: this.result');
      console.debug(this.result);
    }

    const promptPrefix = this.buildPromptPrefix(this.result, message);

    if (this.options.debug) {
      console.debug('Plugins: promptPrefix');
      console.debug(promptPrefix);
    }

    payload = await this.buildCompletionPrompt({
      messages: this.currentMessages.slice(0, -1),
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
      content: promptPrefix
    };

    const messagePayload = {
      role: 'system',
      content: promptSuffix
    };

    if (this.isGpt3) {
      instructionsPayload.role = 'user';
      messagePayload.role = 'user';
      instructionsPayload.content += `\n${promptSuffix}`;
    }

    // testing if this works with browser endpoint
    if (!this.isGpt3 && this.reverseProxyUrl) {
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
        // const roleLabel = message.role === 'User' ? this.userLabel : this.chatGptLabel;
        const roleLabel = message.role;
        let messageString = `${this.startToken}${roleLabel}:\n${message.text}${this.endToken}\n`;
        let newPromptBody;
        if (promptBody) {
          newPromptBody = `${messageString}${promptBody}`;
        } else {
          // Always insert prompt prefix before the last user message, if not gpt-3.5-turbo.
          // This makes the AI obey the prompt instructions better, which is important for custom instructions.
          // After a bunch of testing, it doesn't seem to cause the AI any confusion, even if you ask it things
          // like "what's the last thing I wrote?".
          newPromptBody = `${promptPrefix}${messageString}${promptBody}`;
        }

        const tokenCountForMessage = this.getTokenCount(messageString);
        const newTokenCount = currentTokenCount + tokenCountForMessage;
        if (newTokenCount > maxTokenCount) {
          if (promptBody) {
            // This message would put us over the token limit, so don't add it.
            return false;
          }
          // This is the first message, so we can't add it. Just throw an error.
          throw new Error(
            `Prompt is too long. Max token count is ${maxTokenCount}, but prompt is ${newTokenCount} tokens long.`
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
      const context = `Chat History:\n`;
      messagePayload.content = `${context}${prompt}`;
      currentTokenCount += this.getTokenCount(context);
    }

    // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
    this.modelOptions.max_tokens = Math.min(
      this.maxContextTokens - currentTokenCount,
      this.maxResponseTokens
    );

    if (this.isGpt3) {
      messagePayload.content += promptSuffix;
      return [instructionsPayload, messagePayload];
    }

    const result = [messagePayload, instructionsPayload];

    if (this.functionsAgent && !this.isGpt3) {
      result[1].content = `${result[1].content}\nSure thing! Here is the output you requested:\n`;
    }

    return result.filter((message) => message.content.length > 0);
  }
}

module.exports = PluginsClient;
