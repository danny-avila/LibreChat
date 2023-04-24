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
    prefix: `You are ChatGPT, a Large Language model but with useful tools.

    Talk to the human conversing with you and provide meaningful answers as questions are asked.
    
    Be logically, mathematically, and technically oriented. Use the tools when you need them, but it's okay to answer based on your own knowledge.
    
    Keep answers short and concise.
    
    Don't repeat an identical answer if it appears before.
    
    Be honest. If you can't answer something, tell the human that you can't provide an answer or make a joke about it.`,
    suffix: `Remember, all your responses MUST be in the format described. Do not respond unless it's in the format described.
    
    Don't forget to use the structure of Action, Action Input, etc.`,
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
