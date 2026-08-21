import { RecoilRoot, useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import type { TConversation, TEndpointsConfig } from 'librechat-data-provider';
import useNavigateToConvo from '../useNavigateToConvo';
import { SetConvoProvider } from '~/Providers';
import store from '~/store';

/** The one thing a test cannot own: the HTTP call. Deferred per conversation
 *  so the assertions can observe the window before a record lands, and can
 *  settle two in-flight requests out of order. */
const mockPending = new Map<
  string,
  { resolve: (conversation: TConversation) => void; reject: (error: unknown) => void }
>();
const mockGetConversationById = jest.fn(
  (id: string) =>
    new Promise<TConversation>((resolve, reject) => {
      mockPending.set(id, { resolve, reject });
    }),
);

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: {
    ...jest.requireActual('librechat-data-provider').dataService,
    getConversationById: (...args: unknown[]) => mockGetConversationById(...(args as [string])),
  },
}));

const B = 'convo-b';
const C = 'convo-c';

/** What `getConvosByCursor` projects into the sidebar: no prompt prefix, no
 *  sampling params. Navigating from a row must never expose these as absent. */
const rowB = {
  conversationId: B,
  title: 'Bravo',
  endpoint: 'openAI',
  model: 'gpt-4o-mini',
} as TConversation;

const rowC = {
  conversationId: C,
  title: 'Charlie',
  endpoint: 'openAI',
  model: 'gpt-4o-mini',
} as TConversation;

const recordB = {
  conversationId: B,
  title: 'Bravo (stale title)',
  endpoint: 'openAI',
  model: 'gpt-4o',
  promptPrefix: 'You are terse.',
  temperature: 0.2,
} as TConversation;

const recordC = {
  conversationId: C,
  title: 'Charlie (full)',
  endpoint: 'openAI',
  model: 'gpt-4o',
  promptPrefix: 'You are verbose.',
  temperature: 0.9,
} as TConversation;

const endpointsConfig = { openAI: {} } as unknown as TEndpointsConfig;

const notFound = () => ({ status: 404, message: 'not found' });

function Harness() {
  const { navigateToConvo } = useNavigateToConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div>
      <button
        data-testid="go-b"
        onClick={() => navigateToConvo(rowB, { currentConvoId: 'convo-a' })}
      />
      <button data-testid="go-c" onClick={() => navigateToConvo(rowC, { currentConvoId: B })} />
      {/* Every other way out of a conversation — "New chat", a link, a
          redirect, the back button — moves the route without going through
          `navigateToConvo`, exactly like `useNewConvo` does. */}
      <button data-testid="go-elsewhere" onClick={() => navigate('/c/new')} />
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="convo">{JSON.stringify(conversation ?? null)}</div>
    </div>
  );
}

/** A real history, not `MemoryRouter`: the hook abandons superseded work by
 *  reading the browser's own location, so the test has to move it for real. */
function renderHarness(cached: TConversation[] = []) {
  window.history.pushState({}, '', '/c/convo-a');

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData([QueryKeys.endpoints], endpointsConfig);
  for (const record of cached) {
    queryClient.setQueryData([QueryKeys.conversation, record.conversationId], record);
  }

  render(
    <BrowserRouter>
      <RecoilRoot>
        <QueryClientProvider client={queryClient}>
          <SetConvoProvider>
            <Harness />
          </SetConvoProvider>
        </QueryClientProvider>
      </RecoilRoot>
    </BrowserRouter>,
  );

  return queryClient;
}

const currentConvo = (): TConversation | null =>
  JSON.parse(screen.getByTestId('convo').textContent ?? 'null');
const currentPath = () => screen.getByTestId('path').textContent;

const click = (testId: string) => {
  act(() => {
    screen.getByTestId(testId).click();
  });
};

const settle = async (id: string, outcome: TConversation | { status: number }) => {
  const deferred = mockPending.get(id);
  if (!deferred) {
    throw new Error(`no in-flight request for ${id}`);
  }
  await act(async () => {
    if ('conversationId' in outcome) {
      deferred.resolve(outcome as TConversation);
    } else {
      deferred.reject(outcome);
    }
  });
};

describe('useNavigateToConvo', () => {
  afterEach(() => {
    mockGetConversationById.mockClear();
    mockPending.clear();
  });

  describe('with the full record already cached', () => {
    it('changes the route and the conversation together, without waiting on the fetch', () => {
      renderHarness([recordB]);
      click('go-b');

      /** The refresh is in flight and deliberately unresolved: the route and
       *  the conversation state must already be on the target. Awaiting the
       *  response here is what left the previous conversation on screen. */
      expect(mockGetConversationById).toHaveBeenCalledWith(B);
      expect(currentPath()).toBe(`/c/${B}`);
      expect(currentConvo()?.conversationId).toBe(B);
    });

    it('underlays the cached record so the sidebar projection cannot drop settings', () => {
      renderHarness([recordB]);
      click('go-b');

      const optimistic = currentConvo();
      /** Fields only the record carries survive the switch, so a send during
       *  the refresh window still uses this conversation's real settings. */
      expect(optimistic?.promptPrefix).toBe('You are terse.');
      expect(optimistic?.temperature).toBe(0.2);
      /** ...while the row stays authoritative for what it does carry. */
      expect(optimistic?.title).toBe('Bravo');
      expect(optimistic?.model).toBe('gpt-4o-mini');
    });

    it('applies the refreshed record once it lands', async () => {
      renderHarness([recordB]);
      click('go-b');
      await settle(B, { ...recordB, title: 'Bravo (server)' });

      await waitFor(() => expect(currentConvo()?.title).toBe('Bravo (server)'));
      expect(currentConvo()?.promptPrefix).toBe('You are terse.');
    });
  });

  describe('on the first visit, with no cached record', () => {
    it('holds the route until the record that a send needs is in hand', async () => {
      renderHarness();
      click('go-b');

      /** The sidebar row alone would expose a usable composer whose sends
       *  silently carry default prompt prefix and sampling params. */
      expect(mockGetConversationById).toHaveBeenCalledWith(B);
      expect(currentPath()).toBe('/c/convo-a');

      await settle(B, recordB);

      await waitFor(() => expect(currentPath()).toBe(`/c/${B}`));
      expect(currentConvo()?.promptPrefix).toBe('You are terse.');
      expect(currentConvo()?.temperature).toBe(0.2);
    });

    it('still lands on the conversation when the record fetch fails', async () => {
      const queryClient = renderHarness();
      queryClient.setQueryData([QueryKeys.messages, B], [{ messageId: 'stale' }]);
      click('go-b');
      await settle(B, notFound());

      await waitFor(() => expect(currentPath()).toBe(`/c/${B}`));
      expect(currentConvo()?.conversationId).toBe(B);
      /** Cleared before the route moved, so the target mounts a fresh query. */
      expect(queryClient.getQueryData([QueryKeys.messages, B])).toBeUndefined();
    });
  });

  describe('when a later navigation supersedes an in-flight one', () => {
    it('discards a refresh that resolves after the user moved on', async () => {
      renderHarness([recordB, recordC]);
      click('go-b');
      click('go-c');
      expect(currentPath()).toBe(`/c/${C}`);

      /** B's refresh lands last. Writing it would restore B into state while
       *  the route and transcript show C — and sends read from state. */
      await settle(B, { ...recordB, title: 'Bravo (late)' });

      expect(currentPath()).toBe(`/c/${C}`);
      expect(currentConvo()?.conversationId).toBe(C);
      expect(currentConvo()?.title).toBe('Charlie');
    });

    it('abandons a refresh when the user left through a path that bypasses this hook', async () => {
      renderHarness([recordB]);
      click('go-b');
      expect(currentPath()).toBe(`/c/${B}`);

      /** `useNewConvo` and every link, redirect or back-button press move the
       *  route without calling `navigateToConvo`, so nothing this hook tracks
       *  for itself would notice — only the browser's own location does. */
      click('go-elsewhere');
      expect(currentPath()).toBe('/c/new');

      await settle(B, { ...recordB, title: 'Bravo (late)' });

      expect(currentPath()).toBe('/c/new');
      expect(currentConvo()?.title).not.toBe('Bravo (late)');
    });

    it('does not pull the user back when they leave before the first-visit record lands', async () => {
      renderHarness();
      click('go-b');
      /** Uncached, so the route has not moved yet — B is still only pending. */
      expect(currentPath()).toBe('/c/convo-a');

      click('go-elsewhere');
      expect(currentPath()).toBe('/c/new');

      await settle(B, recordB);

      /** Completing the navigation here would yank the user out of the chat
       *  they deliberately opened and into one they had already left. */
      expect(currentPath()).toBe('/c/new');
    });

    it('lands on the last conversation clicked, not the first record to arrive', async () => {
      renderHarness();
      click('go-b');
      click('go-c');
      /** Neither has moved the route yet — the first-visit path waits for its
       *  record — so both requests started from the same pathname and only
       *  click order can say which one the user actually wants. */
      expect(currentPath()).toBe('/c/convo-a');

      /** B answers first, but C was clicked last. */
      await settle(B, recordB);
      await settle(C, recordC);

      expect(currentPath()).toBe(`/c/${C}`);
      expect(currentConvo()?.conversationId).toBe(C);
    });

    it('discards a first-visit navigation that resolves after the user moved on', async () => {
      renderHarness([recordC]);
      click('go-b');
      click('go-c');
      expect(currentPath()).toBe(`/c/${C}`);

      await settle(B, recordB);

      expect(currentPath()).toBe(`/c/${C}`);
      expect(currentConvo()?.conversationId).toBe(C);
    });
  });

  describe('when the refresh fails after the route already moved', () => {
    it('keeps the mounted message cache on a transient failure', async () => {
      const queryClient = renderHarness([recordB]);
      queryClient.setQueryData([QueryKeys.messages, B], [{ messageId: 'loaded' }]);
      click('go-b');
      await settle(B, { status: 500 });

      /** The messages query is already mounted, so dropping it here would
       *  cancel or discard a history fetch with no remount left to retry it. */
      expect(queryClient.getQueryData([QueryKeys.messages, B])).toEqual([{ messageId: 'loaded' }]);
      expect(currentPath()).toBe(`/c/${B}`);
    });

    it('drops the message cache when the conversation is confirmed gone', async () => {
      const queryClient = renderHarness([recordB]);
      queryClient.setQueryData([QueryKeys.messages, B], [{ messageId: 'stale' }]);
      click('go-b');
      await settle(B, notFound());

      await waitFor(() =>
        expect(queryClient.getQueryData([QueryKeys.messages, B])).toBeUndefined(),
      );
    });
  });
});
