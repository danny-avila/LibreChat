const { Agent } = require('langchain/agents');
const { LLMChain } = require('langchain/chains');
const { FunctionChatMessage, AIChatMessage } = require('langchain/schema');
const {
  ChatPromptTemplate,
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate
} = require('langchain/prompts');
const PREFIX = `You are a helpful AI assistant.`;

function parseOutput(message) {
  if (message.additional_kwargs.function_call) {
    const function_call = message.additional_kwargs.function_call;
    return {
      tool: function_call.name,
      toolInput: function_call.arguments ? JSON.parse(function_call.arguments) : {},
      log: message.text
    };
  } else {
    return { returnValues: { output: message.text }, log: message.text };
  }
}

class FunctionsAgent extends Agent {
  constructor(input) {
    super({ ...input, outputParser: undefined });
    this.tools = input.tools;
  }

  lc_namespace = ['langchain', 'agents', 'openai'];

  _agentType() {
    return 'openai-functions';
  }

  observationPrefix() {
    return 'Observation: ';
  }

  llmPrefix() {
    return 'Thought:';
  }

  _stop() {
    return ['Observation:'];
  }

  static createPrompt(_tools, fields) {
    const { prefix = PREFIX, currentDateString } = fields || {};

    return ChatPromptTemplate.fromPromptMessages([
      SystemMessagePromptTemplate.fromTemplate(`Date: ${currentDateString}\n${prefix}`),
      new MessagesPlaceholder('chat_history'),
      HumanMessagePromptTemplate.fromTemplate(`Query: {input}`),
      new MessagesPlaceholder('agent_scratchpad'),
    ]);
  }

  static fromLLMAndTools(llm, tools, args) {
    FunctionsAgent.validateTools(tools);
    const prompt = FunctionsAgent.createPrompt(tools, args);
    const chain = new LLMChain({
      prompt,
      llm,
      callbacks: args?.callbacks
    });
    return new FunctionsAgent({
      llmChain: chain,
      allowedTools: tools.map((t) => t.name),
      tools
    });
  }

  async constructScratchPad(steps) {
    return steps.flatMap(({ action, observation }) => [
      new AIChatMessage('', {
        function_call: {
          name: action.tool,
          arguments: JSON.stringify(action.toolInput)
        }
      }),
      new FunctionChatMessage(observation, action.tool)
    ]);
  }

  async plan(steps, inputs, callbackManager) {
    // Add scratchpad and stop to inputs
    const thoughts = await this.constructScratchPad(steps);
    const newInputs = Object.assign({}, inputs, { agent_scratchpad: thoughts });
    if (this._stop().length !== 0) {
      newInputs.stop = this._stop();
    }

    // Split inputs between prompt and llm
    const llm = this.llmChain.llm;
    const valuesForPrompt = Object.assign({}, newInputs);
    const valuesForLLM = {
      tools: this.tools
    };
    for (let i = 0; i < this.llmChain.llm.callKeys.length; i++) {
      const key = this.llmChain.llm.callKeys[i];
      if (key in inputs) {
        valuesForLLM[key] = inputs[key];
        delete valuesForPrompt[key];
      }
    }

    const promptValue = await this.llmChain.prompt.formatPromptValue(valuesForPrompt);
    const message = await llm.predictMessages(
      promptValue.toChatMessages(),
      valuesForLLM,
      callbackManager
    );
    console.log('message', message);
    return parseOutput(message);
  }
}

module.exports = FunctionsAgent;
