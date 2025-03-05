const { BedrockAgentClient, ListAgentsCommand } = require('@aws-sdk/client-bedrock-agent');

async function verifyAWSCredentials() {
  try {
    console.log('\nVerifying AWS Credentials and Agent Access:');
    console.log('=========================================');

    const client = new BedrockAgentClient();

    console.log('\nTesting ListAgentsCommand...');
    const command = new ListAgentsCommand({});
    const response = await client.send(command);

    console.log('\nAWS Response:', {
      metadata: response.$metadata,
      agentCount: response.agentSummaries?.length ?? 0,
      httpStatusCode: response.$metadata?.httpStatusCode,
      requestId: response.$metadata?.requestId,
    });

    if (response.agentSummaries && response.agentSummaries.length > 0) {
      console.log('\nFound Agents:');
      response.agentSummaries.forEach((agent, index) => {
        console.log(`\n[Agent ${index + 1}]`);
        console.log('Id:', agent.agentId);
        console.log('LatestVersion:', agent.latestAgentVersion);
        console.log('Name:', agent.agentName);
        console.log('Status:', agent.agentStatus);
        console.log('Description:', agent.description);
      });
    } else {
      console.log('\nNo agents found in the account');
    }

    return response;
  } catch (error) {
    console.error('\nError verifying AWS credentials:', {
      name: error.name,
      message: error.message,
      code: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
      stack: error.stack,
    });
    throw error;
  }
}

// Only run if called directly
if (require.main === module) {
  verifyAWSCredentials().catch(console.error);
}

module.exports = { verifyAWSCredentials };
