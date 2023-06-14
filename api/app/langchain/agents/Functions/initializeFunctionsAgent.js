const FunctionsAgent = require('./FunctionsAgent');
const { AgentExecutor } = require('langchain/agents');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');

const initializeFunctionsAgent = async ({
  tools,
  model,
  pastMessages,
  currentDateString,
  ...rest
}) => {
  const agent = FunctionsAgent.fromLLMAndTools(
    model,
    tools, 
    {
      currentDateString,
    });

  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    // returnMessages: true, // commenting this out retains memory
    memoryKey: 'chat_history',
    humanPrefix: 'User',
    aiPrefix: 'Assistant',
    inputKey: 'input',
    outputKey: 'output'
  });

  return AgentExecutor.fromAgentAndTools({ agent, tools, memory, ...rest });
};

module.exports = initializeFunctionsAgent;

