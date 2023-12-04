const { ZeroShotAgent } = require('langchain/agents');
const { PromptTemplate, renderTemplate } = require('langchain/prompts');
const { gpt3, gpt4 } = require('./instructions');

class CustomAgent extends ZeroShotAgent {
  constructor(input) {
    super(input);
  }

  _stop() {
    return ['\nObservation:', '\nObservation 1:'];
  }

  static createPrompt(tools, opts = {}) {
    const { currentDateString, model } = opts;
    const inputVariables = ['input', 'chat_history', 'agent_scratchpad'];

    let prefix, instructions, suffix;
    if (model.includes('gpt-3')) {
      prefix = gpt3.prefix;
      instructions = gpt3.instructions;
      suffix = gpt3.suffix;
    } else if (model.includes('gpt-4')) {
      prefix = gpt4.prefix;
      instructions = gpt4.instructions;
      suffix = gpt4.suffix;
    }

    const toolStrings = tools
      .filter((tool) => tool.name !== 'self-reflection')
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join('\n');
    const toolNames = tools.map((tool) => tool.name);
    const formatInstructions = (0, renderTemplate)(instructions, 'f-string', {
      tool_names: toolNames,
    });
    const template = [
      `Date: ${currentDateString}\n${prefix}`,
      toolStrings,
      formatInstructions,
      suffix,
    ].join('\n\n');
    return new PromptTemplate({
      template,
      inputVariables,
    });
  }
}

module.exports = CustomAgent;
