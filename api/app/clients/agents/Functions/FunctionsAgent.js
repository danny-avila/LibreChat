const { Agent } = require('langchain/agents');
const { LLMChain } = require('langchain/chains');
const { FunctionChatMessage, AIChatMessage } = require('langchain/schema');
const {
  ChatPromptTemplate,
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} = require('langchain/prompts');

const PREFIX = 'You are a helpful AI assistant.';

function parseOutput(message) {
  const { additional_kwargs, text } = message;
  
  if (additional_kwargs?.function_call) {
    const { name, arguments } = additional_kwargs.function_call;
    return {
      tool: name,
      toolInput: arguments ? JSON.parse(arguments) : {},
      log: text,
    };
  } else {
    return { returnValues: { output: text }, log: text };
  }
}

class FunctionsAgent extends Agent {
  constructor(input) {
    super({ ...input, outputParser: parseOutput });
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
      HumanMessagePromptTemplate.fromTemplate('Query: {input}'),
      new MessagesPlaceholder('agent_scratchpad'),
    ]);
  }

  static fromLLMAndTools(llm, tools, args) {
    FunctionsAgent.validateTools(tools);
    const prompt = FunctionsAgent.createPrompt(tools, args);
    const chain = new LLMChain({
      prompt,
      llm,
      callbacks: args?.callbacks,
    });
    return new FunctionsAgent({
      llmChain: chain,
      allowedTools: tools.map((t) => t.name),
      tools,
    });
  }

  async constructScratchPad(steps) {
    const scratchpad = [];
    
    steps.forEach(({ action, observation }) => {
      scratchpad.push(
        new AIChatMessage('', {
          function_call: {
            name: action.tool,
            arguments: JSON.stringify(action.toolInput),
          },
        }),
        new FunctionChatMessage(observation, action.tool)
      );
    });
    
    return scratchpad;
  }

  async plan(steps, inputs, callbackManager) {
    // Add scratchpad and stop to inputs
    const scratchPad = await this.constructScratchPad(steps);
    const newInputs = { ...inputs, agent_scratchpad: scratchPad };
    if (this._stop().length !== 0) {
      newInputs.stop = this._stop();
    }

    // Split inputs between prompt and llm
    const llm = this.llmChain.llm;
    const valuesForPrompt = { ...newInputs };
    const valuesForLLM = { tools: this.tools };

    Object.keys(newInputs).forEach((key) => {
      if (this.llmChain.llm.callKeys.includes(key)) {
        valuesForLLM[key] = newInputs[key];
        delete valuesForPrompt[key];
      }
    });

    const promptValue = await this.llmChain.prompt.formatPromptValue(valuesForPrompt);
    const message = await llm.predictMessages(
      promptValue.toChatMessages(),
      valuesForLLM,
      callbackManager
    );

    return parseOutput(message);
  }
}

module.exports = FunctionsAgent;
