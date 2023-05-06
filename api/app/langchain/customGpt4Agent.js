const { ZeroShotAgent } = require('langchain/agents');
const { PromptTemplate, renderTemplate } = require('langchain/prompts');
const { prefix2, gpt4Instructions, suffix2 } = require('./instructions');

class CustomGpt4Agent extends ZeroShotAgent {
  constructor(input) {
    super(input);
  }

  _stop() {
    return [`\nObservation:`, `\nObservation 1:`];
  }

  static createPrompt(tools) {
    // const { currentDateString } = args;
    const prefix = prefix2;
    const suffix = suffix2;
    const inputVariables = ['input', 'chat_history', 'agent_scratchpad'];
    const toolStrings = tools.filter((tool) => tool.name !== 'self-reflection').map((tool) => `${tool.name}: ${tool.description}`).join('\n');
    const toolNames = tools.map((tool) => tool.name);
    const formatInstructions = (0, renderTemplate)(gpt4Instructions, 'f-string', {
      tool_names: toolNames
    });
    const template = [prefix, toolStrings, formatInstructions, suffix].join('\n\n');
    return new PromptTemplate({
      template,
      inputVariables
    });
  }
}

module.exports = CustomGpt4Agent;
