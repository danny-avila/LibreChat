const { LLMChain } = require('langchain/chains');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const { ZeroShotAgent, AgentExecutor } = require('langchain/agents');
const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate
} = require('langchain/prompts');

const initializeCustomAgent = async ({ tools, model, pastMessages, ...rest }) => {
  const prompt = ZeroShotAgent.createPrompt(tools, {
    prefix: `Have a conversation with a human, answering the following questions as best you can. You have access to the following tools:`,
    suffix: `Begin!`,
    inputVariables: ['input', 'chat_history', 'agent_scratchpad']
  });

  console.log('pastMessages', pastMessages);

  const chatPrompt = ChatPromptTemplate.fromPromptMessages([
    new SystemMessagePromptTemplate(prompt),
    HumanMessagePromptTemplate.fromTemplate(`{chat_history}
    Question: {input}
    {agent_scratchpad}`)
  ]);

  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    // returnMessages: true, // commenting this out retains memory
    memoryKey: 'chat_history',
    humanPrefix: 'Human',
    aiPrefix: 'AI',
    inputKey: 'input',
    outputKey: 'output'
  });

  const llmChain = new LLMChain({
    prompt: chatPrompt,
    llm: model
  });

  const agent = new ZeroShotAgent({
    llmChain,
    allowedTools: tools.map((tool) => tool.name)
  });

  return AgentExecutor.fromAgentAndTools({ agent, tools, memory, ...rest });
};

module.exports = {
  initializeCustomAgent
};
