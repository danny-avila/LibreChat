const {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentResponse
} = require('@aws-sdk/client-bedrock-agent-runtime');

/**
 * @typedef {import('@aws-sdk/client-bedrock-agent-runtime').InvokeAgentCommandInput} InvokeAgentCommandInput
 * @typedef {import('@aws-sdk/client-bedrock-agent-runtime').InvokeAgentCommandOutput} InvokeAgentCommandOutput
 */

class BedrockAgentService {
  constructor() {
    this.client = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  /**
   * Invokes a Bedrock Agent with streaming support
   * @param {string} agentId - The ID of the Bedrock Agent to invoke
   * @param {string} userMessage - The user's message to send to the agent
   * @param {function(string): void} onProgress - Callback for handling streamed messages
   * @returns {Promise<InvokeAgentCommandOutput>}
   */
  async invokeBedrockAgent(agentId, userMessage, onProgress) {
    /** @type {InvokeAgentCommandInput} */
    const params = {
      agentId,
      sessionId: Date.now().toString(),
      inputText: userMessage,
      enableTrace: true
    };

    try {
      const response = await this.client.send(new InvokeAgentCommand(params));
      
      // Handle streaming chunks if available
      if (response.completion) {
        onProgress(response.completion);
      }

      // Handle any additional response data
      if (response.actionGroup) {
        onProgress(JSON.stringify({
          type: 'actionGroup',
          data: response.actionGroup
        }));
      }

      return response;
    } catch (error) {
      console.error('Error invoking Bedrock Agent:', error);
      throw error;
    }
  }

  /**
   * Creates a new session with a Bedrock Agent
   * @param {string} agentId - The ID of the Bedrock Agent
   * @returns {string} The session ID
   */
  createSession(agentId) {
    return `${agentId}-${Date.now()}`;
  }
}

module.exports = new BedrockAgentService();
