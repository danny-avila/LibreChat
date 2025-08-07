import { ContentTypes } from 'librechat-data-provider';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Formats an array of messages for LangChain, making sure all content fields are strings
 * @param {Array<HumanMessage | AIMessage | SystemMessage | ToolMessage>} payload - The array of messages to format.
 * @returns {Array<HumanMessage | AIMessage | SystemMessage | ToolMessage>} - The array of formatted LangChain messages, including ToolMessages for tool calls.
 */
export const formatContentStrings = (payload: Array<BaseMessage>): Array<BaseMessage> => {
  // Create a new array to store the processed messages
  const result: Array<BaseMessage> = [];

  for (const message of payload) {
    const messageType = message.getType();
    const isValidMessage =
      messageType === 'human' || messageType === 'ai' || messageType === 'system';

    if (!isValidMessage) {
      result.push(message);
      continue;
    }

    // If content is already a string, add as-is
    if (typeof message.content === 'string') {
      result.push(message);
      continue;
    }

    // If content is not an array, add as-is
    if (!Array.isArray(message.content)) {
      result.push(message);
      continue;
    }

    // Check if all content blocks are text type
    const allTextBlocks = message.content.every((block) => block.type === ContentTypes.TEXT);

    // Only convert to string if all blocks are text type
    if (!allTextBlocks) {
      result.push(message);
      continue;
    }

    // Reduce text types to a single string
    const content = message.content.reduce((acc, curr) => {
      if (curr.type === ContentTypes.TEXT) {
        return `${acc}${curr[ContentTypes.TEXT] || ''}\n`;
      }
      return acc;
    }, '');

    message.content = content.trim();
    result.push(message);
  }

  return result;
};
