const { Tool } = require('langchain/tools');
const chatFlowConfig = require('./agent_recipe/MoodBooster.json');
const { logger } = require('~/config');

class AgentCoordinator extends Tool {
  constructor() {
    super();
    this.description =
      'The AgentCoordinator is a tool designed to manage and navigate through a structured multi stage conversational flow within an LLM chat application based on given chat Flow.';
    this.description_for_model = `// Defines and dominates the goals and flow of the chat per predefined chat flow recipe that the chat needs to comply with.
// Guidelines:
// - The tool should be called with input of 2 words. Agent name and status which is either "Start" or "Done". The initial agent name is "BootstrapAgent" and the status is "Done".
// - Call the tool with the "BootstrapAgent Done" to initiate the conversation flow at the first time.
// - The tool will provide you with your current name, mission, and instructions. Follow the instructions to complete your mission.
// - ALWAYS use the current agent's name and the status. 
// - When calling the tool with the "Done" status, you signal the completion of the current agent's mission and transition to the next agent in the flow.
// - Actually there is no need to call the tool with status "Start", since it will repeat the same instructions it gave with the previous Agent was done.  
// - The flow is defined by a sequential list of agents, each with a specific role and goal to achieve during the interaction.
// Start now by calling the tool with "BootstrapAgent Done" to initiate the conversation flow.
// Remember, the tool is there to guide you, but the user's input is paramount. Engage with the user directly and use the tool as a guide for the conversation's structure and progression. if you need more instructions use self reflect to decide
`;

    this.name = 'agent-coordinator';
    this.chatFlowName = chatFlowConfig.chatFlowName;
    this.chatFlow = chatFlowConfig.generalDescription;
    this.generalFlowInstructions = chatFlowConfig.generalFlowInstructions;
    this.agents = chatFlowConfig.agents;
  }

  async _call(agentRequest) {
    // Your tool's functionality goes here
    try {
      this.agentName = this.getAgentName(agentRequest);
      return this.getNextAgentDetails(this.agentName);
    } catch (error) {
      return error(error.message);
    }
  }

  getAgentName(agentRequest) {
    // Extract the agentName from the agentRequest
    let agentName;
    let status;
    try {
      agentName = agentRequest.split(' ')[0];
      status = agentRequest.split(' ')[1];
    } catch (error) {
      throw new Error(
        'Invalid input. Please provide 2 words with a space between them "agent_name status".',
      );
    }
    if (status !== 'Start' && status !== 'Done') {
      throw new Error('Invalid status. Please provide either "Start" or "Done".');
    }

    // Handle the bootstrap scenario by returning the first agent if no agentName is provided
    // or if the agentName is "BootstrapAgent"
    if (!agentName || agentName === 'BootstrapAgent') {
      return 'BootstrapAgent'; // Return the name of the first agent
    }
    // Check if the agentName is within the list of agents defined in chatFlowConfig
    const isValidAgentName = this.agents.some((agent) => agent.agentName === agentName);

    // If the agentName is valid, return it
    if (isValidAgentName) {
      return agentName;
    }
    // If not valid, prepare a list of valid agent names for the error message
    const validAgentNames = this.agents.map((agent) => agent.agentName).join(', ');

    // Throw an error indicating the invalid agentName and providing the list of valid names
    throw new Error(
      `Invalid agentName: '${agentName}'. Available agents for '${this.chatFlowName}': ${validAgentNames}`,
    );
  }

  // Function to find the index of the current agent in the chat flow
  _findCurrentAgentIndex(currentAgentName) {
    const agents = chatFlowConfig.agents;
    return agents.findIndex((agent) => agent.agentName === currentAgentName);
  }

  // Main method to get the next agent's details
  getNextAgentDetails(currentAgentName) {
    let nextAgentIndex;
    let nextAgent;

    // Handle the bootstrap scenario
    if (!currentAgentName || currentAgentName === 'BootstrapAgent') {
      nextAgentIndex = 0; // Start of the flow
    } else {
      const currentAgentIndex = this._findCurrentAgentIndex(currentAgentName);
      nextAgentIndex = currentAgentIndex + 1; // Proceed to next agent
    }

    if (nextAgentIndex >= chatFlowConfig.agents) {
      return { endOfFlow: true, message: 'This is the end of the conversation flow. Thank you!' };
    }

    nextAgent = this.agents[nextAgentIndex];

    const nextAgentPrompt = {
      agentName: nextAgent.agentName,
      goal: nextAgent.goal,
      general_flow_instructions: this.generalFlowInstructions,
      instructions_for_current_agent: nextAgent.instructions,
      kpi: nextAgent.kpi,
      when_done: `Call the AgentCoordinator with the input '${nextAgent.agentName} Done' to signal readiness for the next phase of the conversation.`,
      important: `Don't call the plugin more than once for the same stage. you already called it with input '${currentAgentName}  Done'.`,
    };
    const result = JSON.stringify(nextAgentPrompt);
    logger.debug(result);
    return result;
  }
}

module.exports = AgentCoordinator;
