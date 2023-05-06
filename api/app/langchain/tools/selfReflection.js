const { Tool } = require('langchain/tools');

class SelfReflectionTool extends Tool {
  constructor({ message, isGpt3 }) {
    super();
    this.reminders = 0;
    this.name = 'self-reflection';
    this.description = `Take this action to reflect on your thoughts & actions. For your input, provide answers for self-evaluation as part of one input, using this space as a canvas to explore and organize your ideas in response to the user's message. You can use multiple lines for your input. Perform this action sparingly and only when you are stuck.`;
    this.message = message;
    this.isGpt3 = isGpt3;
  }

  async _call(input) {
    return this.selfReflect(input);
  }

  async selfReflect() {
    if (this.isGpt3) {
      return `I should finalize my reply as soon as I have satisfied the user's query.`;
    } else {
      return ``;
    }
  }
}

module.exports = SelfReflectionTool;
