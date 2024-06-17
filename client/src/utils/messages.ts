import { ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

export const getLengthAndFirstFiveChars = (str?: string) => {
  const length = str ? str.length : 0;
  const firstFiveChars = str ? str.substring(0, 5) : '';
  return `${length}${firstFiveChars}`;
};

export const getLatestText = (message?: TMessage | null) => {
  if (!message) {
    return '';
  }
  if (message.text) {
    return message.text;
  }
  if (message.content?.length) {
    for (let i = message.content.length - 1; i >= 0; i--) {
      const part = message.content[i];
      if (part.type === ContentTypes.TEXT && part[ContentTypes.TEXT]?.value?.length > 0) {
        return part[ContentTypes.TEXT].value;
      }
    }
  }
  return '';
};
