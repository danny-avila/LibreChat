const { ConversationSummaryBufferMemory, ChatMessageHistory } = require('langchain/memory');
const { formatLangChainMessages } = require('../prompts');

const createSummaryBufferMemory = ({ llm, messages }) => {
  const chatHistory = new ChatMessageHistory(messages);
  return new ConversationSummaryBufferMemory({
    llm,
    chatHistory,
    returnMessages: true,
  });
};

const summaryBuffer = async ({
  llm,
  debug,
  messagesToRefine,
  formatOptions = {},
  previous_summary = '',
}) => {
  if (debug && previous_summary) {
    console.log('<-----------PREVIOUS SUMMARY----------->\n\n');
    console.log(previous_summary);
  }

  const formattedMessages = formatLangChainMessages(messagesToRefine, formatOptions);
  const chatPromptMemory = createSummaryBufferMemory({
    llm,
    messages: formattedMessages,
  });

  const messages = await chatPromptMemory.chatHistory.getMessages();

  if (debug) {
    console.log('<-----------SUMMARY BUFFER MESSAGES----------->\n\n');
    console.log(JSON.stringify(messages));
  }

  const predictSummary = await chatPromptMemory.predictNewSummary(messages, previous_summary);

  if (debug) {
    console.log('<-----------SUMMARY----------->\n\n');
    console.log(JSON.stringify(predictSummary));
  }

  return { role: 'system', content: predictSummary };
};

module.exports = { createSummaryBufferMemory, summaryBuffer };
