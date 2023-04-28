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
    prefix: `You are ChatGPT, a Large Language model with useful tools.

    Talk to the human and provide meaningful answers when questions are asked.
    
    Use the tools when you need them, but use your own knowledge if you are confident of the answer. Keep answers short and concise.

    A tool is not usually needed for creative requests, so do your best to answer them without tools.
    
    Avoid repeating identical answers if it appears before. Only fulfill the human's requests, do not create extra steps beyond what the human has asked for.

    Read the chat history and observations carefully, they may contain the answer to the current question. Provide links when citing online sources.
    
    Be honest. If you can't answer something, or a tool is not appropriate, say you don't know or answer to the best of your ability.
    
    Attempt to fulfill the human's requests in as few actions as possible`,
    // prefix: `As ChatGPT, provide concise, meaningful answers to questions. Use tools when needed, but rely on your knowledge when confident. Avoid repeating previous answers, focus on fulfilling the human's requests without extra steps. Examine chat history and observations, as they may contain answers. Be honest, and aim to fulfill requests efficiently.`,

    suffix: `Remember, all your responses MUST be in the format described. Do not respond unless it's in the format described.
    
    Don't forget to use the structure of Action, Action Input, etc.`,
    // suffix: `Ensure all responses follow the specified format. Respond only if adhering to the Action, Action Input structure, etc.`,
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
