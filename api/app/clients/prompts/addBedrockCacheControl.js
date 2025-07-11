/**
 * Bedrock Converse API: Adds cache points to messages in the payload.
 * Bedrock uses cachePoint as a property of content objects, not as separate content objects.
 * @param {Array<BaseMessage>} messages - The array of message objects.
 * @returns {Array<BaseMessage>} - The updated array of message objects with cache points added.
 */
function addBedrockCacheControl(messages) {
  if (!Array.isArray(messages) || messages.length < 2) {
    return messages;
  }

  const updatedMessages = [...messages];
  let messagesModified = 0;

  for (let i = updatedMessages.length - 1; i >= 0 && messagesModified < 2; i--) {
    const message = updatedMessages[i];

    if (typeof message.content === 'string') {
      // system messages
      message.content = [
        {
          type: 'text',
          text: message.content,
          cachePoint: {
            type: 'default',
          },
        },
      ];
      messagesModified++;
    } else if (Array.isArray(message.content)) {
      // user messages
      for (let j = message.content.length - 1; j >= 0; j--) {
        if (message.content[j].type === 'text') {
          message.content[j].cachePoint = {
            type: 'default',
          };
          messagesModified++;
          break;
        }
      }
    }
  }

  return updatedMessages;
}

module.exports = { addBedrockCacheControl };
