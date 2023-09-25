const { ConversationSummaryBufferMemory, ChatMessageHistory } = require('langchain/memory');
const { HumanMessage, AIMessage, SystemMessage } = require('langchain/schema');
const { formatMessage } = require('../prompts');

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

  const formattedMessages = messagesToRefine.map((msg) => {
    const message = formatMessage({ ...formatOptions, message: msg });

    if (message.role === 'user') {
      return new HumanMessage(message);
    } else if (message.role === 'assistant') {
      return new AIMessage(message);
    } else {
      return new SystemMessage(message);
    }
  });

  const chatHistory = new ChatMessageHistory(formattedMessages);

  const chatPromptMemory = new ConversationSummaryBufferMemory({
    llm,
    returnMessages: true,
    chatHistory,
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

module.exports = summaryBuffer;
