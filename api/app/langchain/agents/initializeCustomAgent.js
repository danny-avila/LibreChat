const CustomZeroShotAgent = require('./customZeroShotAgent');
const CustomGpt4Agent = require('./customGpt4Agent');
// const { CustomOutputParser, Gpt4OutputParser } = require('./outputParser');
// const { prefix, suffix } = require('./instructions');
// const { ZeroShotAgent, AgentExecutor } = require('langchain/agents');
const { Gpt4OutputParser } = require('./outputParser');
const { AgentExecutor } = require('langchain/agents');
const { LLMChain } = require('langchain/chains');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate
} = require('langchain/prompts');

const initializeCustomAgent = async ({ tools, model, pastMessages, currentDateString, ...rest }) => {
  let prompt = CustomGpt4Agent.createPrompt(tools, { currentDateString });
  // const isGpt3 = model.modelName.startsWith('gpt-3');
  // if (isGpt3) {
  //   prompt = ZeroShotAgent.createPrompt(tools, {
  //     prefix: `Current date: ${currentDateString}\n\n${prefix}`,
  //     suffix,
  //     inputVariables: ['input', 'chat_history', 'agent_scratchpad']
  //   });
  // } else {
  //   prompt = CustomGpt4Agent.createPrompt(tools, { currentDateString });
  // }

  console.log('pastMessages', pastMessages);

  const chatPrompt = ChatPromptTemplate.fromPromptMessages([
    new SystemMessagePromptTemplate(prompt),
    HumanMessagePromptTemplate.fromTemplate(`{chat_history}
    Query: {input}
    {agent_scratchpad}`)
  ]);

  // const outputParser = isGpt3 ? new CustomOutputParser({ tools }) : new Gpt4OutputParser({ tools });
  const outputParser = new Gpt4OutputParser({ tools });

  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    // returnMessages: true, // commenting this out retains memory
    memoryKey: 'chat_history',
    humanPrefix: 'User',
    aiPrefix: 'Assistant',
    inputKey: 'input',
    outputKey: 'output'
  });

  const llmChain = new LLMChain({
    prompt: chatPrompt,
    llm: model
  });

  const agent = new CustomZeroShotAgent({
    llmChain,
    outputParser,
    allowedTools: tools.map((tool) => tool.name)
  });

  return AgentExecutor.fromAgentAndTools({ agent, tools, memory, ...rest });
};

module.exports = {
  initializeCustomAgent
};
