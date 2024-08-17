/**
 * Anthropic API: Adds cache control to the appropriate user messages in the payload.
 * @param {Array<AnthropicMessage>} messages - The array of message objects.
 * @returns {Array<AnthropicMessage>} - The updated array of message objects with cache control added.
 */
function addCacheControl(messages) {
  if (!Array.isArray(messages) || messages.length < 2) {
    return messages;
  }

  const updatedMessages = [...messages];
  let userMessagesFound = 0;

  for (let i = updatedMessages.length - 1; i >= 0 && userMessagesFound < 2; i--) {
    if (updatedMessages[i].role === 'user') {
      if (typeof updatedMessages[i].content === 'string') {
        updatedMessages[i] = {
          ...updatedMessages[i],
          content: [
            {
              type: 'text',
              text: updatedMessages[i].content,
              cache_control: { type: 'ephemeral' },
            },
          ],
        };
      } else if (Array.isArray(updatedMessages[i].content)) {
        updatedMessages[i] = {
          ...updatedMessages[i],
          content: updatedMessages[i].content.map((item) => ({
            ...item,
            cache_control: { type: 'ephemeral' },
          })),
        };
      }
      userMessagesFound++;
    }
  }

  return updatedMessages;
}

module.exports = addCacheControl;
