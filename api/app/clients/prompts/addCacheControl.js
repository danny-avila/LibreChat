/**
 * Anthropic API: Adds cache control to the appropriate user messages in the payload.
 * @param {Array<AnthropicMessage | BaseMessage>} messages - The array of message objects.
 * @returns {Array<AnthropicMessage | BaseMessage>} - The updated array of message objects with cache control added.
 */
function addCacheControl(messages) {
  if (!Array.isArray(messages) || messages.length < 2) {
    return messages;
  }

  const updatedMessages = [...messages];
  let userMessagesModified = 0;

  for (let i = updatedMessages.length - 1; i >= 0 && userMessagesModified < 2; i--) {
    const message = updatedMessages[i];
    if (message.getType != null && message.getType() !== 'human') {
      continue;
    } else if (message.getType == null && message.role !== 'user') {
      continue;
    }

    if (typeof message.content === 'string') {
      message.content = [
        {
          type: 'text',
          text: message.content,
          cache_control: { type: 'ephemeral' },
        },
      ];
      userMessagesModified++;
    } else if (Array.isArray(message.content)) {
      for (let j = message.content.length - 1; j >= 0; j--) {
        if (message.content[j].type === 'text') {
          message.content[j].cache_control = { type: 'ephemeral' };
          userMessagesModified++;
          break;
        }
      }
    }
  }

  return updatedMessages;
}

module.exports = addCacheControl;
