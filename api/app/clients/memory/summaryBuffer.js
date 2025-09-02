const { ConversationSummaryBufferMemory, ChatMessageHistory } = require('langchain/memory');
const { formatLangChainMessages, SUMMARY_PROMPT } = require('../prompts');
const { predictNewSummary } = require('../chains');
const { logger } = require('~/config');

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
  signal,
}) => {
  if (previous_summary) {
    logger.debug('[summaryBuffer]', { previous_summary });
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
    logger.debug('[summaryBuffer]', { summary_buffer_messages: messages.length });
  }

  const predictSummary = await predictNewSummary({
    messages,
    previous_summary,
    memory: chatPromptMemory,
    signal,
  });

  if (debug) {
    logger.debug('[summaryBuffer]', { summary: predictSummary });
  }

  return { role: 'system', content: predictSummary };
};

module.exports = { createSummaryBufferMemory, summaryBuffer };
