const { ZeroShotAgent } = require('langchain/agents');
const { PromptTemplate, renderTemplate } = require('langchain/prompts');
const { prefix, instructions, suffix } = require('./instructions');

class CustomAgent extends ZeroShotAgent {
  constructor(input) {
    super(input);
  }

  _stop() {
    return [`\nObservation:`, `\nObservation 1:`];
  }

  static createPrompt(tools, opts = {}) {
    const { currentDateString } = opts;
    const inputVariables = ['input', 'chat_history', 'agent_scratchpad'];
    const toolStrings = tools
      .filter((tool) => tool.name !== 'self-reflection')
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join('\n');
    const toolNames = tools.map((tool) => tool.name);
    const formatInstructions = (0, renderTemplate)(instructions, 'f-string', {
      tool_names: toolNames
    });
    const template = [`Date: ${currentDateString}\n${prefix}`, toolStrings, formatInstructions, suffix].join('\n\n');
    return new PromptTemplate({
      template,
      inputVariables
    });
  }
}

module.exports = CustomAgent;
