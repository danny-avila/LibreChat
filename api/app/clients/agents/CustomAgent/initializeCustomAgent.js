const CustomAgent = require('./CustomAgent');
const { CustomOutputParser } = require('./outputParser');
const { AgentExecutor } = require('langchain/agents');
const { LLMChain } = require('langchain/chains');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} = require('@langchain/core/prompts');

const initializeCustomAgent = async ({
  tools,
  model,
  pastMessages,
  customName,
  customInstructions,
  currentDateString,
  ...rest
}) => {
  let prompt = CustomAgent.createPrompt(tools, { currentDateString, model: model.modelName });
  if (customName) {
    prompt = `You are "${customName}".\n${prompt}`;
  }
  if (customInstructions) {
    prompt = `${prompt}\n${customInstructions}`;
  }

  const chatPrompt = ChatPromptTemplate.fromMessages([
    new SystemMessagePromptTemplate(prompt),
    HumanMessagePromptTemplate.fromTemplate(`{chat_history}
Query: {input}
{agent_scratchpad}`),
  ]);

  const outputParser = new CustomOutputParser({ tools });

  const memory = new BufferMemory({
    llm: model,
    chatHistory: new ChatMessageHistory(pastMessages),
    // returnMessages: true, // commenting this out retains memory
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

  return AgentExecutor.fromAgentAndTools({ agent, tools, memory, ...rest });
};

module.exports = initializeCustomAgent;
