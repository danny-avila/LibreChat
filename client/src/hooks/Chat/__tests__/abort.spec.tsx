import React from 'react';
import { Constants } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { RecoilRoot, useSetRecoilState, useRecoilValue } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TSubmission, TConversation } from 'librechat-data-provider';
import type { RunEnd } from '~/store/families';
import useChatHelpers from '../useChatHelpers';
import { useAbortCleanup } from '../abort';
import store from '~/store';

const mockAbortMutateAsync = jest.fn();
const mockConvertSteersToQueued = jest.fn();

jest.mock('~/data-provider', () => ({
  useAbortStreamMutation: () => ({ mutateAsync: mockAbortMutateAsync }),
}));

jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessage: () => null,
  useLatestMessageId: () => null,
}));

jest.mock('~/hooks/Chat/useChatFunctions', () => ({
  __esModule: true,
  default: () => ({ ask: jest.fn(), regenerate: jest.fn() }),
}));

jest.mock('~/hooks/useNewConvo', () => ({
  __esModule: true,
  default: () => ({ newConversation: jest.fn() }),
}));

jest.mock('~/hooks/Chat/useSteerConvert', () => ({
  __esModule: true,
  default: () => mockConvertSteersToQueued,
}));

const INDEX = 0;
const OTHER_INDEX = 1;

const submission = (id: string) =>
  ({ userMessage: { messageId: id, text: id } }) as unknown as TSubmission;

function setup() {
  const handles: {
    captureSubmission?: ReturnType<typeof useAbortCleanup>['captureSubmission'];
    clearSubmissionsUnlessReplaced?: ReturnType<
      typeof useAbortCleanup
    >['clearSubmissionsUnlessReplaced'];
    setSubmission?: (value: TSubmission | null) => void;
    setOtherSubmission?: (value: TSubmission | null) => void;
  } = {};
  const current: { submission: TSubmission | null; otherSubmission: TSubmission | null } = {
    submission: null,
    otherSubmission: null,
  };

  function Harness() {
    const cleanup = useAbortCleanup(INDEX);
    handles.captureSubmission = cleanup.captureSubmission;
    handles.clearSubmissionsUnlessReplaced = cleanup.clearSubmissionsUnlessReplaced;
    handles.setSubmission = useSetRecoilState(store.submissionByIndex(INDEX));
    handles.setOtherSubmission = useSetRecoilState(store.submissionByIndex(OTHER_INDEX));
    current.submission = useRecoilValue(store.submissionByIndex(INDEX));
    current.otherSubmission = useRecoilValue(store.submissionByIndex(OTHER_INDEX));
    return null;
  }

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot
      initializeState={({ set }) => {
        // clearAllSubmissions iterates the registered conversation keys.
        set(store.conversationKeysAtom, [INDEX, OTHER_INDEX]);
      }}
    >
      <Harness />
      {children}
    </RecoilRoot>
  );
  renderHook(() => null, { wrapper });
  return { handles, current };
}

describe('useAbortCleanup', () => {
  it('clears all submissions when the captured submission is still current', async () => {
    const { handles, current } = setup();
    const aborted = submission('aborted-run');

    act(() => {
      handles.setSubmission!(aborted);
      handles.setOtherSubmission!(submission('added-pane'));
    });

    const captured = handles.captureSubmission!();
    expect(captured).toBe(aborted);

    act(() => {
      handles.clearSubmissionsUnlessReplaced!(captured);
    });

    await waitFor(() => expect(current.submission).toBeNull());
    expect(current.otherSubmission).toBeNull();
  });

  it('keeps a submission that replaced the aborted one while the abort was in flight', async () => {
    const { handles, current } = setup();
    const aborted = submission('aborted-run');
    const nextRun = submission('interrupt-follow-up');

    act(() => {
      handles.setSubmission!(aborted);
    });
    const captured = handles.captureSubmission!();

    // The final SSE fired the interrupt drain and started the next run
    // before the abort HTTP response resolved.
    act(() => {
      handles.setSubmission!(nextRun);
    });
    act(() => {
      handles.clearSubmissionsUnlessReplaced!(captured);
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(current.submission).toBe(nextRun);
  });

  it('keeps a new submission even when the abort started with none captured', async () => {
    const { handles, current } = setup();
    const nextRun = submission('drained-after-abort');

    const captured = handles.captureSubmission!();
    expect(captured).toBeNull();

    act(() => {
      handles.setSubmission!(nextRun);
    });
    act(() => {
      handles.clearSubmissionsUnlessReplaced!(captured);
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(current.submission).toBe(nextRun);
  });

  it('still clears when the submission was already nulled elsewhere', async () => {
    const { handles, current } = setup();
    const aborted = submission('aborted-run');

    act(() => {
      handles.setSubmission!(aborted);
      handles.setOtherSubmission!(submission('added-pane'));
    });
    const captured = handles.captureSubmission!();

    act(() => {
      handles.setSubmission!(null);
    });
    act(() => {
      handles.clearSubmissionsUnlessReplaced!(captured);
    });

    await waitFor(() => expect(current.otherSubmission).toBeNull());
    expect(current.submission).toBeNull();
  });
});

describe('useChatHelpers stopGenerating (abort steer targeting)', () => {
  const observed: { runEnd: RunEnd | null } = { runEnd: null };

  function setupStop(conversationId: string) {
    function RunEndProbe() {
      observed.runEnd = useRecoilValue(store.runEndByIndex(INDEX));
      return null;
    }
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.conversationByIndex(INDEX), {
              conversationId,
              endpoint: 'agents',
            } as TConversation);
            // Arm interrupt & send so the abort response writes the drain signal.
            set(store.drainAfterAbortByIndex(INDEX), true);
          }}
        >
          <RunEndProbe />
          {children}
        </RecoilRoot>
      </QueryClientProvider>
    );
    return renderHook(() => useChatHelpers(INDEX), { wrapper });
  }

  beforeEach(() => {
    observed.runEnd = null;
    mockAbortMutateAsync.mockReset();
    mockConvertSteersToQueued.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps chips and the drain signal on the new composer while claiming under the resolved id', async () => {
    const pendingSteers = [{ steerId: 's1', text: 'leftover words' }];
    mockAbortMutateAsync.mockResolvedValue({
      success: true,
      aborted: 'convo-resolved',
      pendingSteers,
    });

    const { result } = setupStop(String(Constants.NEW_CONVO));
    await act(async () => {
      await result.current.stopGenerating();
    });

    expect(mockAbortMutateAsync).toHaveBeenCalledWith({
      conversationId: String(Constants.NEW_CONVO),
    });
    // The user is still on /c/new (nothing navigated), so the chips and the
    // drain signal key under NEW_CONVO — but the parked server copy lives
    // under the RESOLVED job id and must be claimed there.
    expect(mockConvertSteersToQueued).toHaveBeenCalledWith(
      String(Constants.NEW_CONVO),
      pendingSteers,
      { claimParked: true, claimConversationId: 'convo-resolved' },
    );
    expect(observed.runEnd).toMatchObject({
      conversationId: String(Constants.NEW_CONVO),
      outcome: 'aborted',
    });
  });

  it('prefers the response resolved id over the client-held id for an existing conversation', async () => {
    const pendingSteers = [{ steerId: 's2', text: 'other leftover' }];
    mockAbortMutateAsync.mockResolvedValue({
      success: true,
      aborted: 'convo-resolved',
      pendingSteers,
    });

    const { result } = setupStop('convo-held');
    await act(async () => {
      await result.current.stopGenerating();
    });

    expect(mockConvertSteersToQueued).toHaveBeenCalledWith('convo-resolved', pendingSteers, {
      claimParked: true,
      claimConversationId: 'convo-resolved',
    });
    expect(observed.runEnd).toMatchObject({
      conversationId: 'convo-resolved',
      outcome: 'aborted',
    });
  });

  it('falls back to the client-held id when the response carries no resolved id', async () => {
    mockAbortMutateAsync.mockResolvedValue({ success: true, pendingSteers: [] });

    const { result } = setupStop('convo-held');
    await act(async () => {
      await result.current.stopGenerating();
    });

    expect(mockConvertSteersToQueued).toHaveBeenCalledWith('convo-held', [], {
      claimParked: true,
      claimConversationId: 'convo-held',
    });
    expect(observed.runEnd).toMatchObject({ conversationId: 'convo-held', outcome: 'aborted' });
  });
});
