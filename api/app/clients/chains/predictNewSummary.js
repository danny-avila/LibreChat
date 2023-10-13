const { LLMChain } = require('langchain/chains');
const { getBufferString } = require('langchain/memory');

/**
 * Predicts a new summary for the conversation given the existing messages
 * and summary.
 * @param {Object} options - The prediction options.
 * @param {Array<string>} options.messages - Existing messages in the conversation.
 * @param {string} options.previous_summary - Current summary of the conversation.
 * @param {Object} options.memory - Memory Class.
 * @param {string} options.signal - Signal for the prediction.
 * @returns {Promise<string>} A promise that resolves to a new summary string.
 */
async function predictNewSummary({ messages, previous_summary, memory, signal }) {
  const newLines = getBufferString(messages, memory.humanPrefix, memory.aiPrefix);
  const chain = new LLMChain({ llm: memory.llm, prompt: memory.prompt });
  const result = await chain.call({
    summary: previous_summary,
    new_lines: newLines,
    signal,
  });
  return result.text;
}

module.exports = predictNewSummary;
