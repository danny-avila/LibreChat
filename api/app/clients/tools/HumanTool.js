const { Tool } = require('langchain/tools');
/**
 *    Represents a tool that allows an agent to ask a human for guidance when they are stuck
 *    or unsure of what to do next.
 *    @extends Tool
 */
export class HumanTool extends Tool {
  /**
   * The name of the tool.
   * @type {string}
   */
  name = 'Human';

  /**
   * A description for the agent to use
   * @type {string}
   */
  description = `You can ask a human for guidance when you think you
        got stuck or you are not sure what to do next.
        The input should be a question for the human.`;

  /**
   * Calls the tool with the provided input and returns a promise that resolves with a response from the human.
   * @param {string} input - The input to provide to the human.
   * @returns {Promise<string>} A promise that resolves with a response from the human.
   */
  _call(input) {
    return Promise.resolve(`${input}`);
  }
}
