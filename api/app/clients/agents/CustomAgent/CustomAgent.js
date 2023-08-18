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

    const availableModels = { 'gpt-3': gpt3, 'gpt-4': gpt4 };
    const selectedModel = availableModels[model];

    const toolStrings = tools
      .filter((tool) => tool.name !== 'self-reflection')
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join('\n');
    const toolNames = tools.map((tool) => tool.name);
    const formatInstructions = renderTemplate(selectedModel.instructions, 'f-string', {
      tool_names: toolNames,
    });

    const template = [
      `Date: ${currentDateString}\n${selectedModel.prefix}`,
      toolStrings,
      formatInstructions,
      selectedModel.suffix,
    ].join('\n\n');

    return new PromptTemplate({
      template,
      inputVariables,
    });
  }
}

module.exports = CustomAgent;
