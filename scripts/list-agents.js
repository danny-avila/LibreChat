const {
  BedrockAgentClient,
  ListAgentsCommand,
  ListAgentAliasesCommand,
} = require('@aws-sdk/client-bedrock-agent');

async function getAgentsWithAliases() {
  const client = new BedrockAgentClient();

  try {
    // List all agents
    const listAgentsCommand = new ListAgentsCommand({});
    const agentsResponse = await client.send(listAgentsCommand);

    // For each agent, get its aliases
    const agentsWithAliases = await Promise.all(
      agentsResponse.agentSummaries.map(async (agent) => {
        const listAliasesCommand = new ListAgentAliasesCommand({
          agentId: agent.agentId,
        });
        const aliasesResponse = await client.send(listAliasesCommand);

        return {
          ...agent,
          aliases: aliasesResponse.agentAliasSummaries,
        };
      }),
    );

    return agentsWithAliases;
  } catch (error) {
    console.error('Error fetching agents and aliases:', error);
    throw error;
  }
}

// Usage
getAgentsWithAliases()
  .then((agentsWithAliases) => {
    agentsWithAliases.forEach((agent) => {
      console.log(`Agent: ${agent.agentName} (${agent.agentId})`);
      agent.aliases.forEach((alias) => {
        console.log(`  Alias: ${alias.agentAliasName} (${alias.agentAliasId})`);
      });
    });
  })
  .catch((error) => console.error(error));
