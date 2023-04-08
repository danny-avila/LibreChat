require('dotenv').config();
const { ChatOpenAI } = require('langchain/chat_models');
const { CallbackManager } = require('langchain/callbacks');
const { initializeAgentExecutor } = require('langchain/agents');
const { SerpAPI, Calculator } = require('langchain/tools');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const { HumanChatMessage, AIChatMessage } = require('langchain/schema');

// export const plugins = async ({
//   onProgress,
// }) => {

const openAIApiKey = process.env.OPENAI_KEY;
(async () => {
  // const chatStreaming = new ChatOpenAI({
  //   streaming: true,
  //   callbackManager: CallbackManager.fromHandlers({
  //     handleLLMNewToken: onProgress,
  //   }),
  // });

  // process.env.LANGCHAIN_HANDLER = "langchain";
  const model = new ChatOpenAI({ openAIApiKey, temperature: 0 });
  const tools = [new SerpAPI(), new Calculator()];

  const pastMessages = [
    new HumanChatMessage("My name's Jonas"),
    new AIChatMessage('Nice to meet you, Jonas!')
  ];

  const executor = await initializeAgentExecutor(tools, model, 'chat-conversational-react-description', true);

  executor.memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    returnMessages: true,
    memoryKey: "chat_history",
    inputKey: "input",
  });
  console.log('Loaded agent.');

  // const input0 = "hi, i am bob";

  // const result0 = await executor.call({ input: input0 });

  // console.log(`Got output ${result0.output}`);

  const input1 = 'whats my name?';

  const result1 = await executor.call({ input: input1 });

  console.log(`Got output ${result1.output}`);

  console.dir(executor.memory, { depth: null });

  // const input2 = "whats the weather in morris plains NJ?";

  // const result2 = await executor.call({ input: input2 });

  // console.log(`Got output ${result2.output}`);
})();


// ... (imports and other initializations)

// class ChatAgent {
//   constructor(conversationId, openAIApiKey) {
//     this.conversationId = conversationId;
//     this.openAIApiKey = openAIApiKey;
//     this.executor = null;
//   }

//   async initialize() {
//     const model = new ChatOpenAI({
//       openAIApiKey: this.openAIApiKey,
//       temperature: 0,
//     });
//     const tools = [new SerpAPI(), new Calculator()];

//     const pastMessages = await loadConversationHistory(this.conversationId);
//     this.executor = await initializeAgentExecutor(
//       tools,
//       model,
//       'chat-conversational-react-description',
//       true
//     );

//     this.executor.memory = new BufferMemory({
//       chatHistory: new ChatMessageHistory(pastMessages),
//       returnMessages: true,
//       memoryKey: 'chat_history',
//       inputKey: 'input',
//     });

//     console.log('Loaded agent.');
//   }

//   async sendMessage(input) {
//     if (!this.executor) {
//       throw new Error('Agent is not initialized. Call initialize() before sending a message.');
//     }

//     const result = await this.executor.call({ input: input });

//     // Save the input message to the database
//     await saveMessageToDatabase(this.conversationId, input, true);

//     // Save the output message to the database
//     await saveMessageToDatabase(this.conversationId, result.output, false);

//     return result.output;
//   }
// }

// (async () => {
//   const conversationId = 'your_conversation_id_here'; // Replace this with the actual conversationId
//   const chatAgent = new ChatAgent(conversationId, openAIApiKey);

//   await chatAgent.initialize();

//   const input1 = 'whats my name?';
//   const output1 = await chatAgent.sendMessage(input1);

//   console.log(`Got output ${output1}`); // correctly outputs: your name is jonas
// })();
