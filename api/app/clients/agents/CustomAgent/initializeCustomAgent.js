const CustomAgent = require('./CustomAgent');
const { CustomOutputParser } = require('./outputParser');
const { AgentExecutor } = require('langchain/agents');
const { LLMChain } = require('langchain/chains');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} = require('langchain/prompts');

const initializeCustomAgent = async ({
  tools,
  model,
  pastMessages,
  currentDateString,
  ...rest
}) => {
  const prompt = CustomAgent.createPrompt(tools, { currentDateString, model: model.modelName });

  const chatPrompt = new ChatPromptTemplate([
    new SystemMessagePromptTemplate(prompt),
    new HumanMessagePromptTemplate('{chat_history}\nQuery: {input}\n{agent_scratchpad}'),
  ]);

  const outputParser = new CustomOutputParser({ tools });

  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    memoryKey: 'chat_history',
    humanPrefix: 'User',
    aiPrefix: 'Assistant',
    inputKey: 'input',
    outputKey: 'output',
  });

  const llmChain = new LLMChain({
    prompt: chatPrompt,
    llm: model,
  });

  const agent = new CustomAgent({
    llmChain,
    outputParser,
    allowedTools: tools.map((tool) => tool.name),
  });

  return new AgentExecutor({ agent, tools, memory, ...rest });
};

module.exports = initializeCustomAgent;
