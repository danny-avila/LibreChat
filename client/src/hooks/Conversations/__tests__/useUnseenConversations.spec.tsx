import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useUnseenConversations from '../useUnseenConversations';

const listKeyActive = [QueryKeys.allConversations, { isArchived: false }];
const listKeyArchived = [QueryKeys.allConversations, { isArchived: true }];
const pinnedKey = [QueryKeys.pinnedConversations, { limit: 10 }];

const RESPONDED_AT = '2026-08-16T10:00:00.000Z';
const SEEN_AFTER = '2026-08-16T11:00:00.000Z';
const RESPONDED_AGAIN_AT = '2026-08-16T12:00:00.000Z';

function page(conversations: unknown[]) {
  return { pages: [{ conversations, nextCursor: null }], pageParams: [null] };
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useUnseenConversations(), { wrapper }), queryClient };
}

describe('useUnseenConversations', () => {
  it('derives the unseen set from the cached lists', () => {
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([
          { conversationId: 'unseen-a', title: 'A', lastResponseAt: RESPONDED_AT },
          {
            conversationId: 'seen-a',
            title: 'S',
            lastResponseAt: RESPONDED_AT,
            lastSeenAt: SEEN_AFTER,
          },
          { conversationId: 'never-replied', title: 'N' },
        ]),
      );
    });

    expect(result.current?.unseen).toEqual([
      { conversationId: 'unseen-a', title: 'A', lastResponseAt: RESPONDED_AT, flagged: false },
    ]);
  });

  it('records the reply stamps of seen conversations as the alerts baseline', () => {
    /* A seen conversation marked unread from another device re-enters the unseen set with the
       stamp it always had; only this record lets the alerts tell that from a new reply. */
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([
          { conversationId: 'unseen-a', title: 'A', lastResponseAt: RESPONDED_AT },
          {
            conversationId: 'seen-a',
            title: 'S',
            lastResponseAt: RESPONDED_AT,
            lastSeenAt: SEEN_AFTER,
          },
          { conversationId: 'never-replied', title: 'N' },
        ]),
      );
    });

    expect(result.current?.stamps).toEqual([
      ['seen-a', RESPONDED_AT],
      ['unseen-a', RESPONDED_AT],
    ]);
  });

  it('dedupes a conversation cached in more than one list query', () => {
    const { result, queryClient } = setup();
    const convo = { conversationId: 'dup', title: 'D', lastResponseAt: RESPONDED_AT };

    act(() => {
      queryClient.setQueryData(listKeyActive, page([convo]));
      queryClient.setQueryData(listKeyArchived, page([convo]));
    });

    expect(result.current).toEqual({
      unseen: [{ conversationId: 'dup', title: 'D', lastResponseAt: RESPONDED_AT, flagged: false }],
      stamps: [['dup', RESPONDED_AT]],
    });
  });

  it('ignores cache events outside the conversation lists', () => {
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(listKeyActive, page([]));
      queryClient.setQueryData(
        [QueryKeys.messages, 'm1'],
        page([{ conversationId: 'not-a-list-row', title: 'M', lastResponseAt: RESPONDED_AT }]),
      );
    });

    expect(result.current).toEqual({ unseen: [], stamps: [] });
  });

  it('counts a pin that lives only in the pinned cache', () => {
    /* A pin older than the loaded chat pages is in no `allConversations` page, so leaving it
       out would show its dot while the tab count and the alerts never knew about it. */
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(listKeyActive, page([]));
      queryClient.setQueryData(pinnedKey, {
        conversations: [
          { conversationId: 'old-pin', title: 'Pinned', lastResponseAt: RESPONDED_AT },
        ],
        nextCursor: null,
      });
    });

    expect(result.current?.unseen).toEqual([
      { conversationId: 'old-pin', title: 'Pinned', lastResponseAt: RESPONDED_AT, flagged: false },
    ]);
  });

  it('tags the manual-unread marker of a never-replied conversation', () => {
    /* "Mark as unread" copies the conversation's own activity date into the stamp and leaves
       `updatedAt` alone, so the two being equal is the marker; a reply writes its stamp
       separately from the activity date it bumps. */
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([
          {
            conversationId: 'flagged-a',
            title: 'F',
            updatedAt: RESPONDED_AT,
            lastResponseAt: RESPONDED_AT,
          },
          {
            conversationId: 'replied-a',
            title: 'R',
            updatedAt: RESPONDED_AT,
            lastResponseAt: RESPONDED_AGAIN_AT,
          },
        ]),
      );
    });

    expect(result.current?.unseen).toEqual([
      {
        conversationId: 'flagged-a',
        title: 'F',
        lastResponseAt: RESPONDED_AT,
        flagged: true,
      },
      {
        conversationId: 'replied-a',
        title: 'R',
        lastResponseAt: RESPONDED_AGAIN_AT,
        flagged: false,
      },
    ]);
  });

  it('keeps a manual marker out of the alerts baseline', () => {
    /* A flagged row is not an arrival, and baselining its marker would make the reply that
       later lands look like a stamp the tab had already accounted for. */
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([
          {
            conversationId: 'flagged-a',
            title: 'F',
            updatedAt: RESPONDED_AT,
            lastResponseAt: RESPONDED_AT,
          },
        ]),
      );
    });

    expect(result.current?.unseen).toHaveLength(1);
    expect(result.current?.stamps).toEqual([]);

    /* The reply arrives, stamped apart from the activity date it moved. */
    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([
          {
            conversationId: 'flagged-a',
            title: 'F',
            updatedAt: RESPONDED_AT,
            lastResponseAt: RESPONDED_AGAIN_AT,
          },
        ]),
      );
    });

    expect(result.current?.unseen).toEqual([
      {
        conversationId: 'flagged-a',
        title: 'F',
        lastResponseAt: RESPONDED_AGAIN_AT,
        flagged: false,
      },
    ]);
    expect(result.current?.stamps).toEqual([['flagged-a', RESPONDED_AGAIN_AT]]);
  });

  it('stops counting an unmounted variant once it has gone unanswered too long', () => {
    /* Deleted or archived on another device: refetching the mounted list drops the row there,
       while the leftover variant keeps it. Absence never supersedes presence in the scan, so
       counting the leftover would keep a phantom dot in the badge. Local cache writes must not
       renew it either, which is why the age is measured from the variant's last answer. */
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(
        listKeyArchived,
        page([{ conversationId: 'gone', title: 'G', lastResponseAt: RESPONDED_AT }]),
      );
      queryClient.setQueryData(
        listKeyActive,
        page([{ conversationId: 'unseen-a', title: 'A', lastResponseAt: RESPONDED_AT }]),
      );
    });

    expect(result.current?.unseen.map((c) => c.conversationId).sort()).toEqual([
      'gone',
      'unseen-a',
    ]);

    /* The sidebar is looking at the active variant; only the other one is a leftover. */
    const mounted = queryClient.getQueryCache().find(listKeyActive);
    jest.spyOn(mounted!, 'getObserversCount').mockReturnValue(1);

    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(Date.now() + 6 * 60_000);
      act(() => {
        /* An unrelated local write touches every variant, including the leftover. */
        queryClient.setQueryData(
          listKeyActive,
          page([{ conversationId: 'unseen-a', title: 'A', lastResponseAt: RESPONDED_AGAIN_AT }]),
        );
        queryClient.setQueryData(
          listKeyArchived,
          page([{ conversationId: 'gone', title: 'G', lastResponseAt: RESPONDED_AT }]),
        );
      });

      expect(result.current?.unseen.map((c) => c.conversationId)).toEqual(['unseen-a']);
    } finally {
      now.mockRestore();
    }
  });

  it('counts a conversation held in both caches once', () => {
    const { result, queryClient } = setup();
    const convo = { conversationId: 'both', title: 'B', lastResponseAt: RESPONDED_AT };

    act(() => {
      queryClient.setQueryData(listKeyActive, page([convo]));
      queryClient.setQueryData(pinnedKey, { conversations: [convo], nextCursor: null });
    });

    expect(result.current?.unseen).toHaveLength(1);
    expect(result.current?.stamps).toHaveLength(1);
  });

  it('reports null until a conversation list has actually resolved', () => {
    /* An empty result and an unloaded one look the same from the outside; the alerts have to
       tell them apart or a backlog arriving late reads as a burst of new replies. */
    const { result, queryClient } = setup();

    expect(result.current).toBeNull();

    act(() => {
      queryClient.setQueryData(listKeyActive, page([]));
    });

    expect(result.current).toEqual({ unseen: [], stamps: [] });
  });

  it('reports a fresh reply to an already-unseen conversation', () => {
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([{ conversationId: 'unseen-a', title: 'A', lastResponseAt: RESPONDED_AT }]),
      );
    });
    const before = result.current;

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([{ conversationId: 'unseen-a', title: 'A', lastResponseAt: RESPONDED_AGAIN_AT }]),
      );
    });

    expect(result.current).not.toBe(before);
    expect(result.current?.unseen).toEqual([
      {
        conversationId: 'unseen-a',
        title: 'A',
        lastResponseAt: RESPONDED_AGAIN_AT,
        flagged: false,
      },
    ]);
  });

  it('reports a fresh reply that was caught up the moment it landed', () => {
    /* The row never turns unseen, but the alerts baseline still has to move with it, or a
       later mark-as-unread from another device would announce this reply as a new one. */
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([
          {
            conversationId: 'seen-a',
            title: 'S',
            lastResponseAt: RESPONDED_AT,
            lastSeenAt: SEEN_AFTER,
          },
        ]),
      );
    });
    const before = result.current;

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([
          {
            conversationId: 'seen-a',
            title: 'S',
            lastResponseAt: RESPONDED_AGAIN_AT,
            lastSeenAt: RESPONDED_AGAIN_AT,
          },
        ]),
      );
    });

    expect(result.current).not.toBe(before);
    expect(result.current?.stamps).toEqual([['seen-a', RESPONDED_AGAIN_AT]]);
  });

  it('keeps the state identity when nothing relevant changed', () => {
    const { result, queryClient } = setup();

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([{ conversationId: 'unseen-a', title: 'A', lastResponseAt: RESPONDED_AT }]),
      );
    });
    const before = result.current;

    act(() => {
      queryClient.setQueryData(
        listKeyActive,
        page([{ conversationId: 'unseen-a', title: 'A', lastResponseAt: RESPONDED_AT }]),
      );
    });

    expect(result.current).toBe(before);
  });
});
