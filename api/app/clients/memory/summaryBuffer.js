const { ChatOpenAI } = require('langchain/chat_models/openai');
const { ConversationSummaryBufferMemory, ChatMessageHistory } = require('langchain/memory');
const { HumanMessage, AIMessage, SystemMessage } = require('langchain/schema');

const summaryBuffer = async ({ messagesToRefine, modelName, previous_summary = '' }) => {
  const formattedMessages = messagesToRefine.map((message) => {
    if (message.role === 'user') {
      return new HumanMessage(message.content);
    } else if (message.role === 'assistant') {
      return new AIMessage(message.content);
    } else {
      return new SystemMessage(message.content);
    }
  });

  const chatHistory = new ChatMessageHistory(formattedMessages);

  const chatPromptMemory = new ConversationSummaryBufferMemory({
    llm: new ChatOpenAI({ modelName, temperature: 0.2 }),
    returnMessages: true,
    chatHistory,
  });

  const messages = await chatPromptMemory.chatHistory.getMessages();
  console.log('<-----------SUMMARY BUFFER MESSAGES----------->\n\n');
  console.log(JSON.stringify(messages));
  const predictSummary = await chatPromptMemory.predictNewSummary(messages, previous_summary);
  console.log('<-----------SUMMARY----------->\n\n');
  console.log(JSON.stringify(predictSummary));

  return { role: 'system', content: predictSummary };
};

module.exports = summaryBuffer;
