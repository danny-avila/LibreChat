import { QueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import type { TMessage, TConversation } from 'librechat-data-provider';
import type { LocalizeFunction, TMessageProps } from '~/common';
import {
  clearMessagesCache,
  clearDeletedConversationMessagesCache,
  isValidTimestamp,
  getMessageAriaLabel,
  getMessageTimestamp,
  getHeaderPrefixForScreenReader,
  areMessageFieldsEqual,
  areMessageRowPropsEqual,
} from '../messages';

const translations: Record<string, string> = {
  com_endpoint_message: 'Message',
  com_endpoint_message_new: 'Message {{0}}',
  com_ui_prompt: 'Prompt',
  com_ui_response: 'Response',
};

const localize: LocalizeFunction = ((key: string, args?: Record<string, string | number>) => {
  const template = translations[key] ?? key;
  if (args) {
    return Object.entries(args).reduce(
      (result, [k, v]) => result.replace(`{{${k}}}`, String(v)),
      template,
    );
  }
  return template;
}) as LocalizeFunction;

const makeMessage = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'msg-1',
    isCreatedByUser: false,
    ...overrides,
  }) as TMessage;

describe('clearMessagesCache', () => {
  it('removes existing-conversation history while resetting the new-conversation cache', () => {
    const queryClient = new QueryClient();
    const conversationId = 'conversation-1';
    const messages = [makeMessage({ conversationId })];
    queryClient.setQueryData([QueryKeys.messages, conversationId], messages);
    queryClient.setQueryData([QueryKeys.messages, Constants.NEW_CONVO], messages);

    clearMessagesCache(queryClient, conversationId);

    expect(queryClient.getQueryData([QueryKeys.messages, conversationId])).toBeUndefined();
    expect(queryClient.getQueryData([QueryKeys.messages, Constants.NEW_CONVO])).toEqual([]);
  });
});

describe('clearDeletedConversationMessagesCache', () => {
  it('clears both caches when the new-conversation cache contains deleted chat messages', () => {
    const queryClient = new QueryClient();
    const conversationId = 'conversation-1';
    const messages = [makeMessage({ conversationId })];
    queryClient.setQueryData([QueryKeys.messages, conversationId], messages);
    queryClient.setQueryData(
      [QueryKeys.messages, Constants.NEW_CONVO],
      messages.map((message) => ({ ...message })),
    );

    clearDeletedConversationMessagesCache(queryClient, conversationId);

    expect(queryClient.getQueryData([QueryKeys.messages, conversationId])).toBeUndefined();
    expect(queryClient.getQueryData([QueryKeys.messages, Constants.NEW_CONVO])).toEqual([]);
  });

  it('clears a shared new-conversation cache before its message IDs are hydrated', () => {
    const queryClient = new QueryClient();
    const conversationId = 'conversation-1';
    const messages = [makeMessage({ conversationId: Constants.NEW_CONVO as string })];
    queryClient.setQueryData([QueryKeys.messages, conversationId], messages);
    queryClient.setQueryData([QueryKeys.messages, Constants.NEW_CONVO], messages);

    clearDeletedConversationMessagesCache(queryClient, conversationId);

    expect(queryClient.getQueryData([QueryKeys.messages, conversationId])).toBeUndefined();
    expect(queryClient.getQueryData([QueryKeys.messages, Constants.NEW_CONVO])).toEqual([]);
  });

  it('preserves an unrelated new-conversation message cache', () => {
    const queryClient = new QueryClient();
    const conversationId = 'conversation-1';
    const newConversationMessages = [
      makeMessage({ messageId: 'new-message', conversationId: Constants.NEW_CONVO as string }),
    ];
    queryClient.setQueryData(
      [QueryKeys.messages, conversationId],
      [makeMessage({ conversationId })],
    );
    queryClient.setQueryData([QueryKeys.messages, Constants.NEW_CONVO], newConversationMessages);

    clearDeletedConversationMessagesCache(queryClient, conversationId);

    expect(queryClient.getQueryData([QueryKeys.messages, conversationId])).toBeUndefined();
    expect(queryClient.getQueryData([QueryKeys.messages, Constants.NEW_CONVO])).toEqual(
      newConversationMessages,
    );
  });
});

describe('getMessageAriaLabel', () => {
  it('returns "Message N" when depth is present and valid', () => {
    const msg = makeMessage({ depth: 2 });
    expect(getMessageAriaLabel(msg, localize)).toBe('Message 3');
  });

  it('returns "Message" when depth is undefined', () => {
    const msg = makeMessage({ depth: undefined });
    expect(getMessageAriaLabel(msg, localize)).toBe('Message');
  });

  it('returns "Message" when depth is negative', () => {
    const msg = makeMessage({ depth: -1 });
    expect(getMessageAriaLabel(msg, localize)).toBe('Message');
  });

  it('returns "Message 1" for depth 0 (root message)', () => {
    const msg = makeMessage({ depth: 0 });
    expect(getMessageAriaLabel(msg, localize)).toBe('Message 1');
  });
});

describe('getHeaderPrefixForScreenReader', () => {
  it('returns "Prompt N: " for user messages with valid depth', () => {
    const msg = makeMessage({ isCreatedByUser: true, depth: 2 });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Prompt 3: ');
  });

  it('returns "Response N: " for AI messages with valid depth', () => {
    const msg = makeMessage({ isCreatedByUser: false, depth: 0 });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Response 1: ');
  });

  it('returns "Prompt: " for user messages without depth', () => {
    const msg = makeMessage({ isCreatedByUser: true, depth: undefined });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Prompt: ');
  });

  it('returns "Response: " for AI messages without depth', () => {
    const msg = makeMessage({ isCreatedByUser: false, depth: undefined });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Response: ');
  });

  it('omits number when depth is -1 (no "Prompt 0:" regression)', () => {
    const msg = makeMessage({ isCreatedByUser: true, depth: -1 });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Prompt: ');
  });

  it('omits number when depth is negative', () => {
    const msg = makeMessage({ isCreatedByUser: false, depth: -5 });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Response: ');
  });
});

describe('isValidTimestamp', () => {
  it('returns false for missing values', () => {
    expect(isValidTimestamp(undefined)).toBe(false);
    expect(isValidTimestamp(null)).toBe(false);
    expect(isValidTimestamp('')).toBe(false);
  });

  it('returns false for unparseable strings', () => {
    expect(isValidTimestamp('not-a-date')).toBe(false);
  });

  it('returns true for ISO date strings', () => {
    expect(isValidTimestamp('2026-06-12T15:42:00.000Z')).toBe(true);
  });
});

describe('getMessageTimestamp', () => {
  const NOW = new Date('2026-06-12T15:42:00.000Z').getTime();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null for missing or invalid values', () => {
    expect(getMessageTimestamp(undefined, 'en-US')).toBeNull();
    expect(getMessageTimestamp(null, 'en-US')).toBeNull();
    expect(getMessageTimestamp('not-a-date', 'en-US')).toBeNull();
  });

  it('formats relative and absolute time for a recent message', () => {
    const twoHoursAgo = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    const result = getMessageTimestamp(twoHoursAgo, 'en-US');
    expect(result).not.toBeNull();
    expect(result?.relative).toBe('2 hours ago');
    expect(result?.iso).toBe(twoHoursAgo);
    expect(result?.absolute).toContain('2026');
  });

  it('flags messages under 24h as recent (prefer relative)', () => {
    const justUnderADay = new Date(NOW - 23 * 60 * 60 * 1000).toISOString();
    expect(getMessageTimestamp(justUnderADay, 'en-US')?.isRecent).toBe(true);
  });

  it('flags older messages as not recent (prefer absolute date)', () => {
    const overADay = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(NOW - 38 * 24 * 60 * 60 * 1000).toISOString();
    expect(getMessageTimestamp(overADay, 'en-US')?.isRecent).toBe(false);
    expect(getMessageTimestamp(monthAgo, 'en-US')?.isRecent).toBe(false);
  });

  it('uses "now" for the current instant', () => {
    const result = getMessageTimestamp(new Date(NOW).toISOString(), 'en-US');
    expect(result?.relative).toBe('now');
    expect(result?.isRecent).toBe(true);
  });

  it('falls back to the default locale for a malformed locale tag', () => {
    const iso = new Date(NOW - 60 * 1000).toISOString();
    expect(() => getMessageTimestamp(iso, 'not a locale!!')).not.toThrow();
    expect(getMessageTimestamp(iso, 'not a locale!!')).not.toBeNull();
  });
});

const noop = () => {};
/** Shared content reference so the baseline compares equal on `content` (which
 *  the comparator diffs BY REFERENCE); the mutation below hands a fresh array. */
const SHARED_CONTENT = [] as TMessage['content'];

const makeFieldsMsg = (over: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'm1',
    text: 'hello',
    error: false,
    unfinished: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    depth: 0,
    isCreatedByUser: false,
    content: SHARED_CONTENT,
    model: 'gpt-4',
    endpoint: 'openAI',
    iconURL: '',
    ...over,
  }) as TMessage;

/**
 * One entry per field `areMessageFieldsEqual` compares, each differing from the
 * `makeFieldsMsg` baseline. This list is the guard: dropping a field from the
 * comparator makes its case here fail (a bailed row would show stale content),
 * and adding a rendered field should mean adding it in both places.
 */
const FIELD_MUTATIONS: Array<[string, Partial<TMessage>]> = [
  ['messageId', { messageId: 'm2' }],
  ['text', { text: 'changed' }],
  ['error', { error: true }],
  ['unfinished', { unfinished: true }],
  ['createdAt', { createdAt: '2026-07-02T00:00:00.000Z' }],
  ['depth', { depth: 3 }],
  ['isCreatedByUser', { isCreatedByUser: true }],
  ['children length', { children: [makeFieldsMsg(), makeFieldsMsg()] }],
  ['content reference', { content: [] as TMessage['content'] }],
  ['model', { model: 'gpt-5' }],
  ['endpoint', { endpoint: 'anthropic' }],
  ['iconURL', { iconURL: 'https://example.com/icon.png' }],
  ['feedback rating', { feedback: { rating: 'thumbsDown' } as unknown as TMessage['feedback'] }],
  ['files', { files: [{ file_id: 'f1' }] as TMessage['files'] }],
  [
    'attachments length',
    { attachments: [{ file_id: 'a1' }] as unknown as TMessage['attachments'] },
  ],
  ['manualSkills length', { manualSkills: ['skill'] as unknown as TMessage['manualSkills'] }],
  [
    'alwaysAppliedSkills length',
    { alwaysAppliedSkills: ['skill'] as unknown as TMessage['alwaysAppliedSkills'] },
  ],
  ['quotes length', { quotes: [{ text: 'q' }] as unknown as TMessage['quotes'] }],
];

describe('areMessageFieldsEqual', () => {
  it('is true for the same reference', () => {
    const message = makeFieldsMsg();
    expect(areMessageFieldsEqual(message, message)).toBe(true);
  });

  it('is true for distinct objects with identical compared fields', () => {
    expect(areMessageFieldsEqual(makeFieldsMsg(), makeFieldsMsg())).toBe(true);
  });

  it('handles nullish operands', () => {
    expect(areMessageFieldsEqual(makeFieldsMsg(), null)).toBe(false);
    expect(areMessageFieldsEqual(null, makeFieldsMsg())).toBe(false);
    expect(areMessageFieldsEqual(null, null)).toBe(true);
    expect(areMessageFieldsEqual(undefined, undefined)).toBe(true);
  });

  it.each(FIELD_MUTATIONS)('re-renders when %s changes', (_label, mutation) => {
    expect(areMessageFieldsEqual(makeFieldsMsg(), makeFieldsMsg(mutation))).toBe(false);
  });
});

const baseMessage = makeFieldsMsg();

const makeProps = (over: Partial<TMessageProps> = {}): TMessageProps =>
  ({
    currentEditId: null,
    setCurrentEditId: noop,
    siblingIdx: 0,
    siblingCount: 1,
    setSiblingIdx: noop,
    isSearchView: false,
    conversation: null,
    message: baseMessage,
    ...over,
  }) as TMessageProps;

const PROP_MUTATIONS: Array<[string, Partial<TMessageProps>]> = [
  ['currentEditId', { currentEditId: 'edit-1' }],
  ['setCurrentEditId', { setCurrentEditId: () => {} }],
  ['siblingIdx', { siblingIdx: 1 }],
  ['siblingCount', { siblingCount: 2 }],
  ['setSiblingIdx', { setSiblingIdx: () => {} }],
  ['isSearchView', { isSearchView: true }],
  ['conversation', { conversation: { conversationId: 'c1' } as unknown as TConversation }],
];

describe('areMessageRowPropsEqual', () => {
  it('is true for distinct prop objects with identical values', () => {
    expect(areMessageRowPropsEqual(makeProps(), makeProps())).toBe(true);
  });

  it.each(PROP_MUTATIONS)('re-renders when %s changes', (_label, mutation) => {
    expect(areMessageRowPropsEqual(makeProps(), makeProps(mutation))).toBe(false);
  });

  it('re-renders when only a message field changes (delegates to areMessageFieldsEqual)', () => {
    expect(
      areMessageRowPropsEqual(
        makeProps(),
        makeProps({ message: makeFieldsMsg({ text: 'edited' }) }),
      ),
    ).toBe(false);
  });
});
