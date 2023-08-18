const { Tool } = require('langchain/tools');

class HumanTool extends Tool {
  constructor() {
    super();
    this.name = 'Human';
    this.description =
      'You can ask a human for guidance when you think you got stuck or you are not sure what to do next. The input should be a question for the human.';
  }

  async _call(input) {
    return Promise.resolve(input);
  }
}

module.exports = HumanTool;
