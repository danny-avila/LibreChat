import { ContentTypes, QueryKeys, Constants } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { LocalizeFunction } from '~/common';
import _ from 'lodash';

export const TEXT_KEY_DIVIDER = '|||';

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
      .filter((part) => part != null && part.type === ContentTypes.TEXT)
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
  const formatText = (str: string, index: number): string => {
    if (str.length === 0) {
      return '0';
    }
    const length = str.length;
    const lastChars = str.slice(-16);
    return `${length}${TEXT_KEY_DIVIDER}${lastChars}${TEXT_KEY_DIVIDER}${index}`;
  };

  if (message.text) {
    return formatText(message.text, -1);
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
      text = String(part.error || 'err').slice(0, 30);
    }
    // Handle TOOL_CALL - use simple marker with type
    else if (type === ContentTypes.TOOL_CALL && 'tool_call' in part) {
      const tcType = part.tool_call?.type || 'x';
      const tcName = String(part.tool_call?.['name'] || 'unknown').slice(0, 20);
      const tcArgs = String(part.tool_call?.['args'] || 'none').slice(0, 20);
      const tcOutput = String(part.tool_call?.['output'] || 'none').slice(0, 20);
      text = `tc_${tcType}_${tcName}_${tcArgs}_${tcOutput}`;
    }
    // Handle IMAGE_FILE - use simple marker with file_id suffix
    else if (type === ContentTypes.IMAGE_FILE && 'image_file' in part) {
      const fileId = part.image_file?.file_id || 'x';
      text = `if_${fileId.slice(-8)}`;
    }
    // Handle IMAGE_URL - use simple marker
    else if (type === ContentTypes.IMAGE_URL) {
      text = 'iu';
    }
    // Handle AGENT_UPDATE - use simple marker with agentId suffix
    else if (type === ContentTypes.AGENT_UPDATE && 'agent_update' in part) {
      const agentId = String(part.agent_update?.agentId || 'x').slice(0, 30);
      text = `au_${agentId}`;
    } else {
      text = type;
    }

    if (text.length > 0) {
      return formatText(text, i);
    }
  }

  return '';
};

export const getTextKey = (message?: TMessage | null, convoId?: string | null) => {
  if (!message) {
    return '';
  }
  const contentKey = getLatestContentForKey(message);
  return `${(message.messageId as string | null) ?? ''}${TEXT_KEY_DIVIDER}${contentKey}${TEXT_KEY_DIVIDER}${message.conversationId ?? convoId}`;
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

/**
 * Clears messages for both the specified conversation ID and the NEW_CONVO query key.
 * This ensures that messages are properly cleared in all contexts, preventing stale data
 * from persisting in the NEW_CONVO cache.
 *
 * @param queryClient - The React Query client instance
 * @param conversationId - The conversation ID to clear messages for
 */
export const clearMessagesCache = (
  queryClient: QueryClient,
  conversationId: string | undefined | null,
): void => {
  const convoId = conversationId ?? Constants.NEW_CONVO;

  // Clear messages for the current conversation
  queryClient.setQueryData<TMessage[]>([QueryKeys.messages, convoId], []);

  // Also clear NEW_CONVO messages if we're not already on NEW_CONVO
  if (convoId !== Constants.NEW_CONVO) {
    queryClient.setQueryData<TMessage[]>([QueryKeys.messages, Constants.NEW_CONVO], []);
  }
};

export const getMessageAriaLabel = (message: TMessage, localize: LocalizeFunction): string => {
  return !_.isNil(message.depth)
    ? localize('com_endpoint_message_new', { 0: message.depth + 1 })
    : localize('com_endpoint_message');
};
