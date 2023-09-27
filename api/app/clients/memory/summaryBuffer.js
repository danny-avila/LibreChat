const { ConversationSummaryBufferMemory, ChatMessageHistory } = require('langchain/memory');
const { formatLangChainMessages, SUMMARY_PROMPT } = require('../prompts');

const createSummaryBufferMemory = ({ llm, prompt, messages, ...rest }) => {
  const chatHistory = new ChatMessageHistory(messages);
  return new ConversationSummaryBufferMemory({
    llm,
    prompt,
    chatHistory,
    returnMessages: true,
    ...rest,
  });
};

const summaryBuffer = async ({
  llm,
  debug,
  context, // array of messages
  formatOptions = {},
  previous_summary = '',
  prompt = SUMMARY_PROMPT,
}) => {
  if (debug && previous_summary) {
    console.log('<-----------PREVIOUS SUMMARY----------->\n\n');
    console.log(previous_summary);
  }

  const formattedMessages = formatLangChainMessages(context, formatOptions);
  const memoryOptions = {
    llm,
    prompt,
    messages: formattedMessages,
  };

  if (formatOptions.userName) {
    memoryOptions.humanPrefix = formatOptions.userName;
  }
  if (formatOptions.userName) {
    memoryOptions.aiPrefix = formatOptions.assistantName;
  }

  const chatPromptMemory = createSummaryBufferMemory(memoryOptions);

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
