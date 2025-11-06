const { Tools } = require('librechat-data-provider');

const truncateText = (text, maxChars) => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  if (!Number.isFinite(maxChars) || maxChars <= 0) {
    return text;
  }
  return text.length > maxChars ? text.slice(0, maxChars) : text;
};

const estimateTokens = (text) => {
  if (!text) {
    return 0;
  }
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 0;
  }
  return Math.ceil(cleaned.length / 4);
};

const buildAttachmentPayload = ({ results, conversationId, messageId, toolCallId, turn = 0 }) => {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  return {
    messageId,
    conversationId,
    toolCallId,
    name: `${Tools.web_search}_${toolCallId}`,
    type: Tools.web_search,
    [Tools.web_search]: {
      turn,
      organic: results,
      topStories: [],
    },
  };
};

module.exports = {
  truncateText,
  estimateTokens,
  buildAttachmentPayload,
};
