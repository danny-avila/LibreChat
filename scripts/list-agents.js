const { BedrockAgentClient, ListAgentsCommand } = require('@aws-sdk/client-bedrock-agent');

async function listAgents() {
  try {
    console.log('\nListing AWS Bedrock Agents:');
    console.log('================================');
    
    const client = new BedrockAgentClient({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new ListAgentsCommand({});
    const response = await client.send(command);
    
    if (!response.agentSummaries) {
      console.log('No agents found');
      return;
    }

    response.agentSummaries.forEach((agent, index) => {
      console.log(`\nAgent ${index + 1}:`);
      console.log('--------------------------------');
      console.log('ID:', agent.agentId);
      console.log('Name:', agent.agentName);
      console.log('Status:', agent.agentStatus);
      console.log('Description:', agent.description);
      console.log('Created:', agent.creationDateTime);
      console.log('Updated:', agent.lastUpdatedDateTime);
    });

    return response.agentSummaries;
  } catch (error) {
    console.error('\nError listing agents:', {
      name: error.name,
      message: error.message,
      code: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId
    });
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  listAgents()
    .then(agents => {
      console.log('\nSummary:');
      console.log('Total Agents:', agents?.length || 0);
      console.log('Agents in PREPARED state:', 
        agents?.filter(a => a.agentStatus === 'PREPARED').length || 0);
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { listAgents };
