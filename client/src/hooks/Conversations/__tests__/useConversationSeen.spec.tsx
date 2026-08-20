import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useConversationSeen from '../useConversationSeen';

const mockMarkSeen = jest.fn();
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useMarkConversationSeenMutation: () => ({ mutate: mockMarkSeen }),
}));

const CONVO_ID = 'convo-seen';
const OTHER_CONVO_ID = 'convo-other';
const RESPONDED_AT = '2026-08-16T10:00:00.000Z';

type ConvoFixture = {
  lastResponseAt?: string;
  lastSeenAt?: string;
};

type SeededConvo = {
  conversationId: string;
  title: string;
  lastResponseAt?: string;
  lastSeenAt?: string;
};

type SeenProps = { id: string; submitting: boolean };

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function seedUnseen(queryClient: QueryClient, conversationId = CONVO_ID) {
  queryClient.setQueryData([QueryKeys.allConversations, { isArchived: false }], {
    pages: [
      {
        conversations: [{ conversationId, title: 'Test', lastResponseAt: RESPONDED_AT }],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });
}

function setup(
  fixture: ConvoFixture | null,
  initialProps: SeenProps = { id: CONVO_ID, submitting: false },
) {
  const queryClient = createClient();
  if (fixture !== null) {
    const conversations: SeededConvo[] = [
      {
        conversationId: initialProps.id,
        title: 'Test',
        lastResponseAt: fixture.lastResponseAt,
        lastSeenAt: fixture.lastSeenAt,
      },
    ];
    if (initialProps.id !== OTHER_CONVO_ID) {
      conversations.push({
        conversationId: OTHER_CONVO_ID,
        title: 'Other',
        lastResponseAt: RESPONDED_AT,
      });
    }
    queryClient.setQueryData([QueryKeys.allConversations, { isArchived: false }], {
      pages: [{ conversations, nextCursor: null }],
      pageParams: [null],
    });
  }

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const view = renderHook(({ id, submitting }: SeenProps) => useConversationSeen(id, submitting), {
    initialProps,
    wrapper,
  });

  return { ...view, queryClient };
}

describe('useConversationSeen', () => {
  let hasFocus: jest.SpyInstance;

  beforeEach(() => {
    mockMarkSeen.mockClear();
    hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    hasFocus.mockRestore();
  });

  it('records the conversation as seen once the newest message is reached', () => {
    const { result } = setup({ lastResponseAt: RESPONDED_AT });
    mockMarkSeen.mockClear();

    act(() => result.current(true));

    expect(mockMarkSeen).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });
  });

  it('sends nothing while the user is scrolled away from the newest message', () => {
    const { result } = setup({ lastResponseAt: RESPONDED_AT });
    mockMarkSeen.mockClear();

    act(() => result.current(false));

    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('sends nothing when the tab is not focused', () => {
    hasFocus.mockReturnValue(false);
    const { result } = setup({ lastResponseAt: RESPONDED_AT });
    mockMarkSeen.mockClear();

    act(() => result.current(true));

    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('sends nothing when the conversation is already caught up', () => {
    const { result } = setup({
      lastResponseAt: RESPONDED_AT,
      lastSeenAt: '2026-08-16T11:00:00.000Z',
    });
    mockMarkSeen.mockClear();

    act(() => result.current(true));

    /* The cost guard: re-reading an already-seen conversation must not issue a write. */
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('sends nothing for a conversation that has never been replied to', () => {
    const { result } = setup({});
    mockMarkSeen.mockClear();

    act(() => result.current(true));

    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('marks seen when a reply lands while the user sits at the newest message', () => {
    /* The submission flip, not another intersection callback, is what stands in for
       "the response just completed". Without it the conversation the user is actively
       watching would sprout a dot of its own. */
    const { result, rerender } = setup(
      { lastResponseAt: RESPONDED_AT },
      {
        id: CONVO_ID,
        submitting: true,
      },
    );

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    rerender({ id: CONVO_ID, submitting: false });

    expect(mockMarkSeen).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });
  });

  it('marks seen once the list cache loads with the conversation still unread', () => {
    /* Direct-URL open: the initial intersection fires before the list query resolves,
       so nothing marks seen until the cache itself reports the conversation. */
    const { result, queryClient } = setup(null);

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    act(() => {
      seedUnseen(queryClient);
    });

    expect(mockMarkSeen).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });
  });

  it('does not carry the previous conversation’s scroll position into a new one', () => {
    const { result, rerender } = setup(
      { lastResponseAt: RESPONDED_AT },
      {
        id: CONVO_ID,
        submitting: false,
      },
    );

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    /* Switching conversations recreates the observer; until it reports, the new
       conversation's position is unknown and must not inherit "near bottom". */
    rerender({ id: OTHER_CONVO_ID, submitting: false });

    expect(mockMarkSeen).not.toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: OTHER_CONVO_ID }),
    );
  });
});
