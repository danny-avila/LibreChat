import { render, act } from '@testing-library/react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import useCompactConversation from '../useCompactConversation';
import store from '~/store';

const mockMutate = jest.fn();
jest.mock('~/Providers', () => ({
  useChatContext: () => ({
    conversation: { conversationId: 'convo_1', endpoint: 'openAI' },
    latestMessageId: 'm2',
    isSubmitting: false,
    index: 0,
  }),
}));
jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));
jest.mock('~/data-provider', () => ({
  useCompactConversationMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));
jest.mock('~/hooks/useLocalize', () => () => (key: string) => key);

let compactFn: () => void = () => undefined;
let lockValue = false;

function Consumer() {
  const { compact } = useCompactConversation();
  compactFn = compact;
  return null;
}

function Probe() {
  lockValue = useRecoilValue(store.isCompactingFamily(0));
  return null;
}

/** The consumer and the probe are siblings so the probe survives the
 *  consumer's unmount and can still read the lock. */
function Harness({ showConsumer }: { showConsumer: boolean }) {
  return (
    <RecoilRoot>
      {showConsumer ? <Consumer /> : null}
      <Probe />
    </RecoilRoot>
  );
}

describe('useCompactConversation', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    compactFn = () => undefined;
    lockValue = false;
  });

  it('raises the lock while pending and clears it when the settle callback runs', () => {
    const { rerender } = render(<Harness showConsumer />);
    expect(lockValue).toBe(false);

    act(() => compactFn());
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(lockValue).toBe(true);

    const [, options] = mockMutate.mock.calls[0] as [unknown, { onSettled?: () => void }];
    act(() => options.onSettled?.());
    expect(lockValue).toBe(false);

    rerender(<Harness showConsumer />);
  });

  it('clears the lock when the caller unmounts mid-flight, as v4 drops its callbacks', () => {
    const { rerender } = render(<Harness showConsumer />);
    act(() => compactFn());
    expect(lockValue).toBe(true);

    /** The settle callback never fires after unmount, so the unmount cleanup
     *  is what must release the submission gate. */
    rerender(<Harness showConsumer={false} />);
    expect(lockValue).toBe(false);
  });
});
