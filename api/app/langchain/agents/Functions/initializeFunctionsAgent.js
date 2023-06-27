const { initializeAgentExecutorWithOptions } = require('langchain/agents');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');

const initializeFunctionsAgent = async ({
  tools,
  model,
  pastMessages,
  // currentDateString,
  ...rest
}) => {
  
  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    memoryKey: 'chat_history',
    humanPrefix: 'User',
    aiPrefix: 'Assistant',
    inputKey: 'input',
    outputKey: 'output',
    returnMessages: true,
  });

  return await initializeAgentExecutorWithOptions(
    tools,
    model,
    {
      agentType: "openai-functions",
      memory,
      ...rest,
    }
  );


};

module.exports = initializeFunctionsAgent;

