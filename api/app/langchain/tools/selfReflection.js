const { Tool } = require('langchain/tools');

class SelfReflectionTool extends Tool {
  constructor({ message }) {
    super();
    this.reminders = 0;
    this.name = 'self-reflection';
    this.description = `Take this action to reflect on your thoughts & actions. For your input, provide multiple questions & answers for self-evaluation as part of one input, using this space as a canvas to explore and organize your ideas in response to the user's message. Perform this action sparingly and only when you are stuck.`;
    this.message = message;
  }

  async _call(input) {
    return this.selfReflect(input);
  }

  async selfReflect() {
    // GPT-4's self-reflective function goes here
    // For now, we return a placeholder response.
    // let output = 'Thought:'
    // if (this.reminders % 2 === 0) {
    //   output = `User's message: "${this.message}"\n${output}`;
    // }

    // this.reminders += 1;
    // return output;
    // return `User's message: "${this.message}"`;
    // return `Once you have a complete answer to user's message, finish your response.`;
    return `You should finish or continue your response with another tool.`;
  }
}

module.exports = SelfReflectionTool;
