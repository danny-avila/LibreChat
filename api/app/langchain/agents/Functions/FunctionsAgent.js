const { Agent } = require('langchain/agents');
const { LLMChain } = require('langchain/chains');
const { FunctionChatMessage, AIChatMessage } = require('langchain/schema');
const {
  ChatPromptTemplate,
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate
} = require('langchain/prompts');
const PREFIX = `You are a helpful AI assistant. Objective: Understand the human's query with available functions.
The user is expecting a function response to the query; if only part of the query involves a function, prioritize the function response.`;

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
      HumanMessagePromptTemplate.fromTemplate(`{chat_history}
Query: {input}
{agent_scratchpad}`),
      new MessagesPlaceholder('agent_scratchpad')
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
    var thoughts = await this.constructScratchPad(steps);
    var newInputs = Object.assign({}, inputs, { agent_scratchpad: thoughts });
    if (this._stop().length !== 0) {
      newInputs.stop = this._stop();
    }

    // Split inputs between prompt and llm
    var llm = this.llmChain.llm;
    var valuesForPrompt = Object.assign({}, newInputs);
    var valuesForLLM = {
      tools: this.tools
    };
    for (var i = 0; i < this.llmChain.llm.callKeys.length; i++) {
      var key = this.llmChain.llm.callKeys[i];
      if (key in inputs) {
        valuesForLLM[key] = inputs[key];
        delete valuesForPrompt[key];
      }
    }

    var promptValue = await this.llmChain.prompt.formatPromptValue(valuesForPrompt);
    var message = await llm.predictMessages(
      promptValue.toChatMessages(),
      valuesForLLM,
      callbackManager
    );
    console.log('message', message);
    return parseOutput(message);
  }
}

module.exports = FunctionsAgent;
