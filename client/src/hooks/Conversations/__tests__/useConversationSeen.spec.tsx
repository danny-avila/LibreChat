import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { suppressFocusAcknowledgement } from '../notificationNavigation';
import useConversationSeen from '../useConversationSeen';

const mockMarkSeen = jest.fn();
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useMarkConversationSeenMutation: () => ({ mutate: mockMarkSeen }),
}));

const CONVO_ID = 'convo-seen';
const OTHER_CONVO_ID = 'convo-other';
const RESPONDED_AT = '2026-08-16T10:00:00.000Z';
const RESPONDED_LATER_AT = '2026-08-16T10:05:00.000Z';

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

function seedUnseen(
  queryClient: QueryClient,
  lastResponseAt = RESPONDED_AT,
  conversationId = CONVO_ID,
) {
  queryClient.setQueryData([QueryKeys.allConversations, { isArchived: false }], {
    pages: [
      {
        conversations: [{ conversationId, title: 'Test', lastResponseAt }],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });
}

function setup(
  fixture: ConvoFixture | null,
  initialProps: SeenProps = { id: CONVO_ID, submitting: false },
  measureNearBottom?: () => boolean | null,
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

  const view = renderHook(
    ({ id, submitting }: SeenProps) => useConversationSeen(id, submitting, measureNearBottom),
    {
      initialProps,
      wrapper,
    },
  );

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
    /* Mirrors the real order: the user is at the bottom of a conversation with no reply yet,
       the run finishes and stamps the list cache, then the submission flips. The conversation
       the user is actively watching must not sprout a dot, and the reply is acknowledged
       exactly once rather than again on the flip. */
    const { result, rerender, queryClient } = setup(
      {},
      {
        id: CONVO_ID,
        submitting: true,
      },
    );

    act(() => result.current(true));
    expect(mockMarkSeen).not.toHaveBeenCalled();

    act(() => {
      seedUnseen(queryClient);
    });
    rerender({ id: CONVO_ID, submitting: false });

    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
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

  it('waits out a messages revalidation before acknowledging', async () => {
    /* A warm-cache open renders the old tree and reports its bottom while the messages query
       refetches in the background; acknowledging then would clear the indicator for a reply
       that has not rendered. The fetch settling is itself a cache event, so the reply is
       credited once it has actually arrived. */
    const { result, queryClient } = setup({ lastResponseAt: RESPONDED_AT });
    mockMarkSeen.mockClear();

    let resolveFetch!: (messages: unknown[]) => void;
    const fetching = queryClient.prefetchQuery(
      [QueryKeys.messages, CONVO_ID],
      () =>
        new Promise<unknown[]>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    act(() => result.current(true));
    expect(mockMarkSeen).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch([]);
      await fetching;
    });

    /* The re-check is deferred past the commit, so it lands a couple of frames later. */
    await waitFor(() =>
      expect(mockMarkSeen).toHaveBeenCalledWith({
        conversationId: CONVO_ID,
        lastResponseAt: RESPONDED_AT,
      }),
    );
  });

  it('re-measures the committed tree instead of trusting the old bottom report', async () => {
    /* The revalidated reply can extend past the viewport, and the fetch settles before React
       commits it: the stale near-bottom flag belongs to the old tree and must not acknowledge
       a reply whose end the user has not reached. */
    const measure = jest.fn<boolean | null, []>(() => false);
    const { result, queryClient } = setup(
      { lastResponseAt: RESPONDED_AT },
      { id: CONVO_ID, submitting: false },
      measure,
    );
    mockMarkSeen.mockClear();

    let resolveFetch!: (messages: unknown[]) => void;
    const fetching = queryClient.prefetchQuery(
      [QueryKeys.messages, CONVO_ID],
      () =>
        new Promise<unknown[]>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    act(() => result.current(true));

    await act(async () => {
      resolveFetch([]);
      await fetching;
    });

    await waitFor(() => expect(measure).toHaveBeenCalled());
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('does not re-send the same acknowledgement when a failed write re-arms the cache', () => {
    /* A rejected `/seen` rolls the row back to unseen, and that rollback is itself a cache
       event this hook listens to. Without a guard an offline tab would spin requests for as
       long as the network kept refusing them. */
    const { result, queryClient } = setup({ lastResponseAt: RESPONDED_AT });

    act(() => result.current(true));
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);

    act(() => {
      seedUnseen(queryClient);
    });

    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
  });

  it('acknowledges again once a genuinely newer reply arrives', () => {
    const { result, queryClient } = setup({ lastResponseAt: RESPONDED_AT });

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    act(() => {
      seedUnseen(queryClient, RESPONDED_LATER_AT);
    });

    expect(mockMarkSeen).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_LATER_AT,
    });
  });

  it('acknowledges once the point query for a directly opened conversation resolves', () => {
    /* An old conversation opened by URL can be in neither list; its messages report the bottom
       before the point query lands, so that arrival is the last trigger left. */
    const { result, queryClient } = setup(null);

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    act(() => {
      queryClient.setQueryData([QueryKeys.conversation, CONVO_ID], {
        conversationId: CONVO_ID,
        title: 'Test',
        lastResponseAt: RESPONDED_AT,
      });
    });

    expect(mockMarkSeen).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });
  });

  it('re-arms a failed acknowledgement when the route leaves and returns', () => {
    /* The hook outlives the route, so without this a write that failed here would stay
       suppressed until the window happened to blur and refocus. */
    const { result, rerender } = setup({ lastResponseAt: RESPONDED_AT });

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    rerender({ id: OTHER_CONVO_ID, submitting: false });
    rerender({ id: CONVO_ID, submitting: false });
    act(() => result.current(true));

    expect(mockMarkSeen).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });
  });

  it('ignores the focus a notification click raises on its way elsewhere', () => {
    /* The click is navigation to another conversation; the one still open behind it was never
       read and must keep its indicator. */
    const { result } = setup({ lastResponseAt: RESPONDED_AT });

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    act(() => {
      hasFocus.mockReturnValue(false);
      suppressFocusAcknowledgement();
      hasFocus.mockReturnValue(true);
      window.dispatchEvent(new Event('focus'));
    });

    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('acknowledges on the next genuine focus after a suppressed one', () => {
    const { result } = setup({ lastResponseAt: RESPONDED_AT });

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    act(() => {
      hasFocus.mockReturnValue(false);
      suppressFocusAcknowledgement();
      hasFocus.mockReturnValue(true);
      window.dispatchEvent(new Event('focus'));
    });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(mockMarkSeen).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });
  });

  it('expires a suppression whose focus event never arrived', () => {
    /* `window.focus()` is a request: a browser that leaves the window in the background raises
       no focus event, and an unbounded flag would then be spent on the next genuine focus,
       withholding that conversation's acknowledgement for no reason. */
    const { result } = setup({ lastResponseAt: RESPONDED_AT });

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_000);
      act(() => {
        hasFocus.mockReturnValue(false);
        suppressFocusAcknowledgement();
      });
      now.mockReturnValue(1_000 + 5_000);
      act(() => {
        hasFocus.mockReturnValue(true);
        window.dispatchEvent(new Event('focus'));
      });
    } finally {
      now.mockRestore();
    }

    expect(mockMarkSeen).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });
  });

  it('retries a failed acknowledgement when the user returns to the tab', () => {
    const { result } = setup({ lastResponseAt: RESPONDED_AT });

    act(() => result.current(true));
    mockMarkSeen.mockClear();

    act(() => {
      window.dispatchEvent(new Event('focus'));
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
