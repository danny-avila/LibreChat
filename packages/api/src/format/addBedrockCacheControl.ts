import type { BaseMessage } from '@langchain/core/messages';
import type { Agents } from 'librechat-data-provider';
import { ContentTypes } from 'librechat-data-provider';

type MessageWithContent = {
  content?: string | Agents.MessageContentComplex[];
};

/**
 * Adds Bedrock Converse API cache points to the last two messages.
 * Inserts `{ cachePoint: { type: 'default' } }` as a separate content block
 * immediately after the last text block in each targeted message.
 */
export function addBedrockCacheControl<T extends Partial<BaseMessage> & MessageWithContent>(
  messages: T[],
): T[] {
  if (!Array.isArray(messages) || messages.length < 2) {
    return messages;
  }

  const updatedMessages: T[] = messages.slice();
  let messagesModified = 0;

  for (let i = updatedMessages.length - 1; i >= 0 && messagesModified < 2; i--) {
    const message = updatedMessages[i];
    const content = message.content;

    if (typeof content === 'string') {
      message.content = [
        { type: ContentTypes.TEXT, text: content },
        { cachePoint: { type: 'default' } },
      ] as Agents.MessageContentComplex[];
      messagesModified++;
      continue;
    }

    if (Array.isArray(content)) {
      let inserted = false;
      for (let j = content.length - 1; j >= 0; j--) {
        const block = content[j] as Agents.MessageContentComplex;
        const type = (block as { type?: string }).type;
        if (type === ContentTypes.TEXT || type === 'text') {
          content.splice(j + 1, 0, {
            cachePoint: { type: 'default' },
          } as Agents.MessageContentComplex);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        content.push({ cachePoint: { type: 'default' } } as Agents.MessageContentComplex);
      }
      messagesModified++;
    }
  }

  return updatedMessages;
}

export default addBedrockCacheControl;
