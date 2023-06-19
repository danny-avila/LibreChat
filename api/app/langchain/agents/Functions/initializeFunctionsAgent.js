// const FunctionsAgent = require('./FunctionsAgent');
// const { AgentExecutor, initializeAgentExecutorWithOptions } = require('langchain/agents');
const { initializeAgentExecutorWithOptions } = require('langchain/agents');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');

const initializeFunctionsAgent = async ({
  tools,
  model,
  pastMessages,
  // currentDateString,
  ...rest
}) => {
  // const agent = FunctionsAgent.fromLLMAndTools(
  //   model,
  //   tools, 
  //   {
  //     currentDateString,
  //   });


  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    memoryKey: 'chat_history',
    humanPrefix: 'User',
    aiPrefix: 'Assistant',
    inputKey: 'input',
    outputKey: 'output',
    returnMessages: true,
  });

  // return AgentExecutor.fromAgentAndTools({ agent, tools, memory, ...rest });

  return await initializeAgentExecutorWithOptions(
    tools,
    model,
    {
      agentType: "openai-functions",
      memory,
      maxIterations: 4,
      ...rest,
    }
  );


};

module.exports = initializeFunctionsAgent;

