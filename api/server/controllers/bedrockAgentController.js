const { BedrockAgentClient, ListAgentsCommand } = require('@aws-sdk/client-bedrock-agent');
const bedrockAgentService = require('../services/BedrockAgent');

/**
 * List available AWS Bedrock Agents
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
exports.listBedrockAgents = async (req, res) => {
  try {
    const client = new BedrockAgentClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    const { agentSummaries } = await client.send(new ListAgentsCommand({}));
    return res.status(200).json({ agents: agentSummaries });
  } catch (error) {
    console.error('Error listing agents:', error);
    return res.status(500).json({ error: 'Failed to list agents' });
  }
};

/**
 * Send a message to a Bedrock Agent
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
exports.sendBedrockAgentMessage = async (req, res) => {
  const { agentId } = req.params;
  const { message } = req.body;

  if (!agentId || !message) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // Set up SSE for streaming response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    await bedrockAgentService.invokeBedrockAgent(
      agentId,
      message,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    );
    res.write('data: [DONE]\n\n');
  } catch (error) {
    console.error('Error sending message to agent:', error);
    res.write(`data: ${JSON.stringify({ error: 'Failed to send message to agent' })}\n\n`);
  } finally {
    res.end();
  }
};
