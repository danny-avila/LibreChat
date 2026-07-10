import {
  QueryKeys,
  Constants,
  buildTree,
  ContentTypes,
  isEphemeralAgentId,
  appendAgentIdSuffix,
  encodeEphemeralAgentId,
} from 'librechat-data-provider';
import type {
  TMessage,
  TConversation,
  TEndpointsConfig,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { LocalizeFunction } from '~/common';

export const TEXT_KEY_DIVIDER = '|||';
export const STREAM_START_FAILED_METADATA_KEY = 'streamStartFailed';

type SiblingIndexLookup = (parentMessageId: string | null | undefined) => number;

export type BranchSiblingIndex = {
  parentMessageId: string | null | undefined;
  siblingIdx: number;
};

export const selectActiveBranchTail = (
  messages: TMessage[] | null | undefined,
  rootSiblingKey: string | null | undefined,
  getSiblingIndex: SiblingIndexLookup = () => 0,
): TMessage | null => {
  const messagesTree = buildTree({ messages: messages ?? null });
  if (!messagesTree?.length) {
    return null;
  }

  let siblings = messagesTree;
  let parentMessageId = rootSiblingKey;
  let tail: TMessage | null = null;

  while (siblings.length > 0) {
    const siblingIdx = getSiblingIndex(parentMessageId);
    const normalizedSiblingIdx = siblingIdx >= 0 && siblingIdx < siblings.length ? siblingIdx : 0;
    const activeSiblingIndex = siblings.length - normalizedSiblingIdx - 1;
    const message = siblings[activeSiblingIndex] ?? siblings[siblings.length - 1];
    if (!message) {
      return tail;
    }

    tail = message;
    parentMessageId = message.messageId;
    siblings = message.children ?? [];
  }

  return tail;
};

export const getMessageBranchSiblingParentIds = (
  messages: TMessage[] | null | undefined,
  rootSiblingKey: string | null | undefined,
): (string | null)[] => {
  const messagesTree = buildTree({ messages: messages ?? null });
  if (!messagesTree?.length) {
    return [];
  }

  const parentIds = new Set<string | null>();
  const collectBranchParents = (
    siblings: TMessage[] | undefined,
    parentMessageId: string | null | undefined,
  ) => {
    if (!siblings?.length) {
      return;
    }

    if (siblings.length > 1) {
      parentIds.add(parentMessageId ?? null);
    }

    for (const message of siblings) {
      collectBranchParents(message.children, message.messageId);
    }
  };

  collectBranchParents(messagesTree, rootSiblingKey);
  return Array.from(parentIds);
};

export const getBranchSiblingIndexesForTarget = (
  messages: TMessage[] | null | undefined,
  targetMessageId: string | null | undefined,
  rootSiblingKey: string | null | undefined,
): BranchSiblingIndex[] => {
  if (!targetMessageId) {
    return [];
  }

  const messagesTree = buildTree({ messages: messages ?? null });
  if (!messagesTree?.length) {
    return [];
  }

  const branchIndexes: BranchSiblingIndex[] = [];
  const findTargetPath = (
    siblings: TMessage[] | undefined,
    parentMessageId: string | null | undefined,
  ): boolean => {
    if (!siblings?.length) {
      return false;
    }

    for (let index = 0; index < siblings.length; index++) {
      const message = siblings[index];
      if (!message) {
        continue;
      }

      const isTarget = message.messageId === targetMessageId;
      const childHasTarget = findTargetPath(message.children, message.messageId);
      if (isTarget || childHasTarget) {
        if (siblings.length > 1) {
          branchIndexes.unshift({
            parentMessageId,
            siblingIdx: siblings.length - index - 1,
          });
        }
        return true;
      }
    }

    return false;
  };

  findTargetPath(messagesTree, rootSiblingKey);
  return branchIndexes;
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

export const hasStreamStartFailed = (message?: Pick<TMessage, 'metadata'> | null): boolean =>
  message?.metadata?.[STREAM_START_FAILED_METADATA_KEY] === true;

export const markStreamStartFailedMetadata = (
  metadata?: TMessage['metadata'],
): TMessage['metadata'] => ({
  ...(metadata ?? {}),
  [STREAM_START_FAILED_METADATA_KEY]: true,
});

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
 * Removes an existing conversation's message query so reopening it starts cold, and resets the
 * NEW_CONVO query to an empty cache for immediate optimistic messages.
 *
 * @param queryClient - The React Query client instance
 * @param conversationId - The conversation ID to clear messages for
 */
export const clearMessagesCache = (
  queryClient: QueryClient,
  conversationId: string | undefined | null,
): void => {
  const convoId = conversationId ?? Constants.NEW_CONVO;

  // An absent existing-conversation cache means its history must load before sending.
  if (convoId !== Constants.NEW_CONVO) {
    queryClient.removeQueries([QueryKeys.messages, convoId], { exact: true });
  }

  queryClient.setQueryData<TMessage[]>([QueryKeys.messages, Constants.NEW_CONVO], []);
};

/** Returns a 1-based message number, or null if depth is absent or invalid. */
const getMessageNumber = (message: TMessage): number | null => {
  if (message.depth == null || message.depth < 0) {
    return null;
  }
  return message.depth + 1;
};

export const getMessageAriaLabel = (message: TMessage, localize: LocalizeFunction): string => {
  const number = getMessageNumber(message);
  return number != null
    ? localize('com_endpoint_message_new', { 0: number })
    : localize('com_endpoint_message');
};

/**
 * Provides a screen-reader-only heading prefix distinguishing prompts from responses,
 * with an optional 1-based turn number derived from message depth.
 */
export const getHeaderPrefixForScreenReader = (
  message: TMessage,
  localize: LocalizeFunction,
): string => {
  const number = getMessageNumber(message);
  const suffix = number != null ? ` ${number}` : '';
  return message.isCreatedByUser
    ? `${localize('com_ui_prompt')}${suffix}: `
    : `${localize('com_ui_response')}${suffix}: `;
};

export type MessageTimestamp = {
  /** Localized relative time, e.g. "2 hours ago". */
  relative: string;
  /** Localized absolute date and time, e.g. "Jun 12, 2026, 3:42 PM". */
  absolute: string;
  /** ISO 8601 string for the `<time>` element's `dateTime` attribute. */
  iso: string;
  /**
   * True when the message is recent enough that the relative form ("10 minutes ago")
   * reads better than the absolute date. Past this window the absolute date is clearer.
   */
  isRecent: boolean;
};

/** Below this age the relative form is preferred over the absolute date. */
const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Returns true when `value` parses to a valid date. */
export const isValidTimestamp = (value?: string | null): value is string => {
  if (!value) {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
};

const RELATIVE_TIME_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

/** Returns the locale only when it is a syntactically valid BCP-47 tag, else undefined. */
const resolveLocale = (locale?: string): string | undefined => {
  if (!locale) {
    return undefined;
  }
  try {
    Intl.DateTimeFormat.supportedLocalesOf(locale);
    return locale;
  } catch {
    return undefined;
  }
};

const formatRelativeTime = (from: Date, to: Date, locale?: string): string => {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  let duration = (from.getTime() - to.getTime()) / 1000;
  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(Math.round(duration), 'year');
};

/**
 * Formats a message timestamp into locale-aware relative and absolute strings.
 * Returns null when the value is missing or unparseable, so callers can skip
 * rendering the timestamp entirely.
 */
export const getMessageTimestamp = (
  value?: string | null,
  locale?: string,
): MessageTimestamp | null => {
  if (!isValidTimestamp(value)) {
    return null;
  }

  const date = new Date(value);
  const now = new Date(Date.now());
  const safeLocale = resolveLocale(locale);

  return {
    iso: date.toISOString(),
    relative: formatRelativeTime(date, now, safeLocale),
    absolute: new Intl.DateTimeFormat(safeLocale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date),
    isRecent: Math.abs(now.getTime() - date.getTime()) < RECENT_THRESHOLD_MS,
  };
};

/**
 * Creates initial content parts for dual message display with agent-based grouping.
 * Sets up primary and added agent content parts with agentId for column rendering.
 *
 * @param primaryConvo - The primary conversation configuration
 * @param addedConvo - The added conversation configuration
 * @param endpointsConfig - Endpoints configuration for getting model display labels
 * @param modelSpecs - Model specs list for getting spec labels
 * @returns Array of content parts with agentId for side-by-side rendering
 */
export const createDualMessageContent = (
  primaryConvo: TConversation,
  addedConvo: TConversation,
  endpointsConfig?: TEndpointsConfig,
  modelSpecs?: { name: string; label?: string }[],
): TMessageContentParts[] => {
  // For real agents (agent_id starts with "agent_"), use agent_id directly
  // Otherwise create ephemeral ID from endpoint/model
  let primaryAgentId: string;
  if (primaryConvo.agent_id && !isEphemeralAgentId(primaryConvo.agent_id)) {
    primaryAgentId = primaryConvo.agent_id;
  } else {
    const primaryEndpoint = primaryConvo.endpoint;
    const primaryModel = primaryConvo.model ?? '';
    // Look up model spec for label fallback
    const primarySpec =
      primaryConvo.spec != null && primaryConvo.spec !== ''
        ? modelSpecs?.find((s) => s.name === primaryConvo.spec)
        : undefined;
    // For ephemeral agents, use modelLabel if provided, then model spec's label,
    // then modelDisplayLabel from endpoint config, otherwise empty string to show model name
    const primarySender =
      primaryConvo.modelLabel ??
      primarySpec?.label ??
      (primaryEndpoint ? endpointsConfig?.[primaryEndpoint]?.modelDisplayLabel : undefined) ??
      '';
    primaryAgentId = encodeEphemeralAgentId({
      endpoint: primaryEndpoint ?? '',
      model: primaryModel,
      sender: primarySender,
    });
  }

  // Both agents run in parallel, so they share the same groupId
  const parallelGroupId = 1;

  // Use empty type - these are just placeholders to establish agentId/groupId
  // The actual type will be set when real content arrives from the server
  const primaryContent = {
    type: '' as const,
    agentId: primaryAgentId,
    groupId: parallelGroupId,
  };

  // For added agent, use agent_id if it's a real agent (starts with "agent_")
  // Otherwise create ephemeral ID with index suffix
  // Always append index suffix for added agent to distinguish from primary (even if same agent_id)
  let addedAgentId: string;
  if (addedConvo.agent_id && !isEphemeralAgentId(addedConvo.agent_id)) {
    // Append suffix to distinguish from primary agent (matches ephemeral format)
    addedAgentId = appendAgentIdSuffix(addedConvo.agent_id, 1);
  } else {
    const addedEndpoint = addedConvo.endpoint;
    const addedModel = addedConvo.model ?? '';
    // Look up model spec for label fallback
    const addedSpec =
      addedConvo.spec != null && addedConvo.spec !== ''
        ? modelSpecs?.find((s) => s.name === addedConvo.spec)
        : undefined;
    // For ephemeral agents, use modelLabel if provided, then model spec's label,
    // then modelDisplayLabel from endpoint config, otherwise empty string to show model name
    const addedSender =
      addedConvo.modelLabel ??
      addedSpec?.label ??
      (addedEndpoint ? endpointsConfig?.[addedEndpoint]?.modelDisplayLabel : undefined) ??
      '';
    addedAgentId = encodeEphemeralAgentId({
      endpoint: addedEndpoint ?? '',
      model: addedModel,
      sender: addedSender,
      index: 1,
    });
  }

  // Use empty type - placeholder to establish agentId/groupId
  const addedContent = {
    type: '' as const,
    agentId: addedAgentId,
    groupId: parallelGroupId,
  };

  // Cast through unknown since these are placeholder objects with empty type
  // that will be replaced by real content with proper types from the server
  return [primaryContent, addedContent] as unknown as TMessageContentParts[];
};
