const { StructuredTool } = require('langchain/tools');
const { z } = require('zod');

// proof of concept
class ChatTool extends StructuredTool {
  constructor({ onAgentAction }) {
    super();
    this.handleAction = onAgentAction;
    this.name = 'talk_to_user';
    this.description =
      'Use this to chat with the user between your use of other tools/plugins/APIs. You should explain your motive and thought process in a conversational manner, while also analyzing the output of tools/plugins, almost as a self-reflection step to communicate if you\'ve arrived at the correct answer or used the tools/plugins effectively.';
    this.schema = z.object({
      message: z.string().describe('Message to the user.'),
      // next_step: z.string().optional().describe('The next step to take.'),
    });
  }

  async _call({ message }) {
    return `Message to user: ${message}`;
  }
}

module.exports = ChatTool;
