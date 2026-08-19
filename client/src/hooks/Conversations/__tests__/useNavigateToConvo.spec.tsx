import { RecoilRoot, useRecoilValue } from 'recoil';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryKeys } from 'librechat-data-provider';
import type { TConversation, TEndpointsConfig } from 'librechat-data-provider';
import { SetConvoProvider } from '~/Providers';
import useNavigateToConvo from '../useNavigateToConvo';
import store from '~/store';

/** The one thing a test cannot own: the HTTP call. Deferred so the assertions
 *  can observe the window between the click and the record landing. */
let resolveFetch: (conversation: TConversation) => void;
let rejectFetch: (error: unknown) => void;
const mockGetConversationById = jest.fn(
  () =>
    new Promise<TConversation>((resolve, reject) => {
      resolveFetch = resolve;
      rejectFetch = reject;
    }),
);

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: {
    ...jest.requireActual('librechat-data-provider').dataService,
    getConversationById: (...args: unknown[]) => mockGetConversationById(...(args as [])),
  },
}));

const CONVO_ID = 'convo-b';

/** What `getConvosByCursor` projects into the sidebar: no sampling params, no
 *  prompt prefix. Navigating from a row must not overwrite those with nothing. */
const sidebarRow = {
  conversationId: CONVO_ID,
  title: 'Bravo',
  endpoint: 'openAI',
  model: 'gpt-4o-mini',
} as TConversation;

const fullRecord = {
  conversationId: CONVO_ID,
  title: 'Bravo (stale title)',
  endpoint: 'openAI',
  model: 'gpt-4o',
  promptPrefix: 'You are terse.',
  temperature: 0.2,
} as TConversation;

const endpointsConfig = { openAI: {} } as unknown as TEndpointsConfig;

function Harness() {
  const { navigateToConvo } = useNavigateToConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const location = useLocation();

  return (
    <div>
      <button
        data-testid="navigate"
        onClick={() => navigateToConvo(sidebarRow, { currentConvoId: 'convo-a' })}
      />
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="convo">{JSON.stringify(conversation ?? null)}</div>
    </div>
  );
}

function renderHarness(cachedConversation?: TConversation) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData([QueryKeys.endpoints], endpointsConfig);
  if (cachedConversation) {
    queryClient.setQueryData([QueryKeys.conversation, CONVO_ID], cachedConversation);
  }

  render(
    <MemoryRouter initialEntries={['/c/convo-a']}>
      <RecoilRoot>
        <QueryClientProvider client={queryClient}>
          <SetConvoProvider>
            <Harness />
          </SetConvoProvider>
        </QueryClientProvider>
      </RecoilRoot>
    </MemoryRouter>,
  );

  return queryClient;
}

const currentConvo = (): TConversation | null =>
  JSON.parse(screen.getByTestId('convo').textContent ?? 'null');

const clickRow = () => {
  act(() => {
    screen.getByTestId('navigate').click();
  });
};

describe('useNavigateToConvo', () => {
  afterEach(() => {
    mockGetConversationById.mockClear();
  });

  it('changes the route and the conversation together, without waiting on the fetch', () => {
    renderHarness();
    clickRow();

    /** The record request is in flight and deliberately unresolved: the route
     *  and the conversation state must already be on the target. Awaiting the
     *  response here is what left the previous conversation on screen. */
    expect(mockGetConversationById).toHaveBeenCalledWith(CONVO_ID);
    expect(screen.getByTestId('path')).toHaveTextContent(`/c/${CONVO_ID}`);
    expect(currentConvo()?.conversationId).toBe(CONVO_ID);
  });

  it('underlays the cached full record so the projection cannot drop settings', () => {
    renderHarness(fullRecord);
    clickRow();

    const optimistic = currentConvo();
    /** Fields only the full record carries survive the switch — a send during
     *  the reconcile window still uses this conversation's real settings. */
    expect(optimistic?.promptPrefix).toBe('You are terse.');
    expect(optimistic?.temperature).toBe(0.2);
    /** ...while the row stays authoritative for what it does carry. */
    expect(optimistic?.title).toBe('Bravo');
    expect(optimistic?.model).toBe('gpt-4o-mini');
  });

  it('applies the server record once it lands', async () => {
    renderHarness();
    clickRow();

    await act(async () => {
      resolveFetch({ ...fullRecord, title: 'Bravo (server)' });
    });

    await waitFor(() => expect(currentConvo()?.title).toBe('Bravo (server)'));
    expect(currentConvo()?.promptPrefix).toBe('You are terse.');
    expect(screen.getByTestId('path')).toHaveTextContent(`/c/${CONVO_ID}`);
  });

  it('keeps the user on the conversation when the record fetch fails, and drops its message cache', async () => {
    const queryClient = renderHarness();
    queryClient.setQueryData([QueryKeys.messages, CONVO_ID], [{ messageId: 'stale' }]);
    clickRow();

    await act(async () => {
      rejectFetch(new Error('network down'));
    });

    await waitFor(() =>
      expect(queryClient.getQueryData([QueryKeys.messages, CONVO_ID])).toBeUndefined(),
    );
    expect(screen.getByTestId('path')).toHaveTextContent(`/c/${CONVO_ID}`);
    expect(currentConvo()?.conversationId).toBe(CONVO_ID);
  });
});
