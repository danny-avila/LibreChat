import { render, act, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useCompactConversation, { useIsConversationCompacting } from '../useCompactConversation';

let mockSettle: (() => void) | null = null;

jest.mock('~/Providers', () => ({
  useChatContext: () => ({
    conversation: { conversationId: 'convo_1', endpoint: 'openAI' },
    latestMessageId: 'm2',
    isSubmitting: false,
  }),
}));
jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));
jest.mock('~/data-provider', () => {
  const tanstack = jest.requireActual('@tanstack/react-query');
  return {
    useCompactConversationMutation: () =>
      tanstack.useMutation({
        mutationKey: ['compactConversation'],
        mutationFn: () =>
          new Promise<{ conversationId: string }>((resolve) => {
            mockSettle = () => resolve({ conversationId: 'convo_1' });
          }),
      }),
  };
});
jest.mock('~/hooks/useLocalize', () => () => (key: string) => key);

let compactFn: () => void = () => undefined;
let canCompactValue = true;
let lockValue = false;

function Consumer() {
  const { compact, canCompact } = useCompactConversation();
  compactFn = compact;
  canCompactValue = canCompact;
  return null;
}

function Probe() {
  lockValue = useIsConversationCompacting('convo_1');
  return null;
}

/** The consumer and the probe are siblings so the probe observes the lock
 *  while the consumer is unmounted. */
function Harness({ showConsumer }: { showConsumer: boolean }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <RecoilRoot>
      <QueryClientProvider client={queryClient}>
        {showConsumer ? <Consumer /> : null}
        <Probe />
      </QueryClientProvider>
    </RecoilRoot>
  );
}

describe('useCompactConversation', () => {
  beforeEach(() => {
    mockSettle = null;
    compactFn = () => undefined;
    canCompactValue = true;
    lockValue = false;
  });

  it('raises the lock while pending and releases it when the mutation settles', async () => {
    render(<Harness showConsumer />);
    act(() => compactFn());
    await waitFor(() => expect(lockValue).toBe(true));

    await act(async () => {
      mockSettle?.();
    });
    await waitFor(() => expect(lockValue).toBe(false));
  });

  it('keeps the lock across unmount and rediscovers it on remount', async () => {
    const { rerender } = render(<Harness showConsumer />);
    act(() => compactFn());
    await waitFor(() => expect(lockValue).toBe(true));

    /** The consumer unmounts while the mutation is still in the cache: the
     *  lock must not clear, or a remounted composer would race the summary. */
    rerender(<Harness showConsumer={false} />);
    expect(lockValue).toBe(true);

    rerender(<Harness showConsumer />);
    await waitFor(() => expect(canCompactValue).toBe(false));

    await act(async () => {
      mockSettle?.();
    });
    await waitFor(() => expect(lockValue).toBe(false));
    await waitFor(() => expect(canCompactValue).toBe(true));
  });
});
