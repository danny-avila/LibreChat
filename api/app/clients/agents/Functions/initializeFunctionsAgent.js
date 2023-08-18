const { initializeAgentExecutorWithOptions } = require('langchain/agents');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');

const initializeFunctionsAgent = async ({
  tools,
  model,
  pastMessages,
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

  try {
    const agentExecutor = await initializeAgentExecutorWithOptions(tools, model, {
      agentType: 'openai-functions',
      memory,
      ...rest,
    });

    return agentExecutor;
  } catch (error) {
    console.error('Failed to initialize functions agent:', error);
    throw error;
  }
};

module.exports = initializeFunctionsAgent;
