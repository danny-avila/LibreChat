import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';

export const getLengthAndLastNChars = (str?: string, n?: number): string => {
  if (typeof str !== 'string' || str.length === 0) {
    return 'len=0';
  }

  const length = str.length;
  const lastNChars = str.slice(-(n ?? 10));
  return `len=${length}&last_${n}=${lastNChars}`;
};

export const getLatestText = (message?: TMessage | null, includeIndex?: boolean): string => {
  if (!message) {
    return '';
  }
  if (message.text) {
    return message.text;
  }
  if (message.content && message.content.length > 0) {
    for (let i = message.content.length - 1; i >= 0; i--) {
      const part = message.content[i] as TMessageContentParts | undefined;
      if (part && part.type !== ContentTypes.TEXT) {
        continue;
      }

      const text = (typeof part?.text === 'string' ? part.text : part?.text?.value) ?? '';
      if (text.length > 0) {
        if (includeIndex === true) {
          return `${text}-${i}`;
        } else {
          return text;
        }
      } else {
        continue;
      }
    }
  }
  return '';
};

export const getAllContentText = (message?: TMessage | null): string => {
  if (!message) {
    return '';
  }

  if (message.text) {
    return message.text;
  }

  if (message.content && message.content.length > 0) {
    return message.content
      .filter((part) => part.type === ContentTypes.TEXT)
      .map((part) => {
        if (!('text' in part)) return '';
        const text = part.text;
        if (typeof text === 'string') return text;
        return text?.value || '';
      })
      .filter((text) => text.length > 0)
      .join('\n');
  }

  return '';
};

const getLatestContentForKey = (message: TMessage): string => {
  if (message.text) {
    return message.text;
  }

  if (!message.content || message.content.length === 0) {
    return '';
  }

  for (let i = message.content.length - 1; i >= 0; i--) {
    const part = message.content[i] as TMessageContentParts | undefined;
    if (!part?.type) {
      continue;
    }

    const type = part.type;
    let text = '';

    // Handle THINK type - extract think content
    if (type === ContentTypes.THINK && 'think' in part) {
      text = typeof part.think === 'string' ? part.think : (part.think?.value ?? '');
    }
    // Handle TEXT type
    else if (type === ContentTypes.TEXT && 'text' in part) {
      text = typeof part.text === 'string' ? part.text : (part.text?.value ?? '');
    }
    // Handle ERROR type
    else if (type === ContentTypes.ERROR && 'error' in part) {
      text = part.error || '[err]';
    }
    // Handle TOOL_CALL - use simple marker with type
    else if (type === ContentTypes.TOOL_CALL && 'tool_call' in part) {
      text = `[tc:${part.tool_call?.type || 'x'}|name:${part.tool_call?.['name'] || 'unknown'}|args:${part.tool_call?.['args'] || 'none'}|output:${part.tool_call?.['output'] || 'none'}]`;
    }
    // Handle IMAGE_FILE - use simple marker with file_id suffix
    else if (type === ContentTypes.IMAGE_FILE && 'image_file' in part) {
      const fileId = part.image_file?.file_id || 'x';
      text = `[if:${fileId.slice(-8)}]`;
    }
    // Handle IMAGE_URL - use simple marker
    else if (type === ContentTypes.IMAGE_URL) {
      text = '[iu]';
    }
    // Handle AGENT_UPDATE - use simple marker with agentId suffix
    else if (type === ContentTypes.AGENT_UPDATE && 'agent_update' in part) {
      const agentId = part.agent_update?.agentId || 'x';
      text = `[au:${agentId}]`;
    } else {
      text = `[${type}]`;
    }

    if (text.length > 0) {
      return `${text}-${i}`;
    }
  }

  return '';
};

export const getTextKey = (message?: TMessage | null, convoId?: string | null) => {
  if (!message) {
    return '';
  }
  const text = getLatestContentForKey(message);
  return `?messageId=${(message.messageId as string | null) ?? ''}&convoId=${
    message.conversationId ?? convoId
  }&${getLengthAndLastNChars(text, 12)}`;
};

export const scrollToEnd = (callback?: () => void) => {
  const messagesEndElement = document.getElementById('messages-end');
  if (messagesEndElement) {
    messagesEndElement.scrollIntoView({ behavior: 'instant' });
    if (callback) {
      callback();
    }
  }
};
