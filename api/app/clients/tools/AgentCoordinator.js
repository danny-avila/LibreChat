const { Tool } = require('langchain/tools');
const chatFlowConfig = require('./chatFlow.json');

class AgentCoordinator extends Tool {
  constructor() {
    super();
    this.reminders = 0;
    this.description =
      'The AgentCoordinator is a tool designed to manage and navigate through a structured multi stage conversational flow within an LLM chat application based on given chat Flow.';
    this.description_for_model = `// Defines and dominates the goals and flow of the chat per predefined script that the chat needs to comply with.
// Guidelines:
// - Call the tool with the "BootstrapAgent" to initiate the conversation flow.
// - Ensure a seamless and engaging user experience throughout the conversation by accurately following the provided instructions for each agent.
// - ALWAYS use the current agent's name as input to determine the next agent in the flow.
// - The flow is defined by a sequential list of agents, each with a specific role and goal to achieve during the interaction.
// - Upon completing an agent's goal, invoke this tool again with the name of the current agent to receive instructions for transitioning to the next agent.
// - Each agent's instructions include the role, goal, specific action items, KPIs, and general instructions for interaction.
// - The conversation flow concludes when there are no more agents to transition to, signaling the end of the multi stage interaction.
// Example for initiating the flow:
// "currentAgentName":"BootstrapAgent"
// Example for transitioning to the next agent:
// "currentAgentName":"GreetingAgent"
// Start now by calling the tool with "BootstrapAgent" to initiate the conversation flow.
// Remember, the tool is there to guide you, but the user's input is paramount. Engage with the user directly and use the tool as a guide for the conversation's structure and progression.
`;

    // this.returnDirect = true;
    this.name = 'agent-coordinator';
    this.chatFlowName = chatFlowConfig.chatFlowName;
    this.chatFlow = chatFlowConfig.chatFlow;
    this.agents = chatFlowConfig.agents;
    this.generalFlowInstructions = chatFlowConfig.generalFlowInstructions;
  }

  async _call(agentName) {
    // Your tool's functionality goes here
    try {
      this.agentName = this.getAgentName(agentName);
    } catch (error) {
      console.error(error.message);
    }
    return this.getNextAgentDetails(this.agentName);
  }

  getAgentName(agentName) {
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
    return Object.keys(this.chatFlow).indexOf(currentAgentName);
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

    if (nextAgentIndex > Object.keys(this.chatFlow).length - 1) {
      return { endOfFlow: true, message: 'This is the end of the conversation flow. Thank you!' };
    }

    // Get the next agent's name from the chat flow order
    nextAgent = this.chatFlow[nextAgentIndex];
    const agentDetails = this.agents.find((agent) => agent.agentName === nextAgent.agentName);
    const agentInstructions = agentDetails ? agentDetails.instructions : 'Agent not found';
    const agentKPI = agentDetails ? agentDetails.kpi : 'Agent not found';

    // Construct the next agent's prompt including role, goal, and instructions
    const nextAgentPrompt = `
    As the ${
  nextAgent.agentName
}, your mission is to ${nextAgent.goal.toLowerCase()}. Adhere to the following instructions:
    
    ${agentInstructions}
    
    Aim to achieve the following key performance indicator (KPI):
    - ${agentKPI}
    
    Keep in mind these general guidelines during your interaction:
    - ${this.generalFlowInstructions}
    
    Upon completing your current mission, engage the AgentCoordinator with the code ${
  nextAgent.agentName
}', signaling readiness for the next phase of the conversation.
    `;

    // Debugging - Uncomment if needed to verify the content of the prompt
    // console.log(nextAgentPrompt);

    return nextAgentPrompt.trim();
  }
}

module.exports = AgentCoordinator;
