const { BedrockAgentClient, ListAgentsCommand } = require('@aws-sdk/client-bedrock-agent');

async function checkCredentials() {
  try {
    const client = new BedrockAgentClient({
      region: process.env.BEDROCK_AWS_DEFAULT_REGION || process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // Try to list agents to verify credentials
    await client.send(new ListAgentsCommand({}));
    console.log('AWS credentials verified successfully');
    return true;
  } catch (error) {
    console.error('Error verifying AWS credentials:', error.message);
    return false;
  }
}

module.exports = { checkCredentials };
