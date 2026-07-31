import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, useSetRecoilState, type MutableSnapshot } from 'recoil';
import { Constants, ContentTypes, EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type { TConversation, TMessage } from 'librechat-data-provider';
import type { QueuedMessage } from '~/store/families';
import useSteering from '../useSteering';
import store from '~/store';

const CONVO_ID = 'convo-steer-ui';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mockMutate = jest.fn();
const mockCancelSteer = jest.fn();
const mockShowToast = jest.fn();
const mockMarkUsage = jest.fn();
let mockMessages: TMessage[] | undefined;

jest.mock('~/data-provider', () => ({
  useCancelSteerMutation: () => ({ mutateAsync: mockCancelSteer }),
  useSteerMessageMutation: () => ({ mutate: mockMutate }),
  useGetMessagesByConvoId: (_id: string, config?: { select?: (messages: unknown) => unknown }) => ({
    data: config?.select ? config.select(mockMessages) : mockMessages,
  }),
  useMarkFilesUsageMutation: () => ({ mutate: mockMarkUsage }),
  supportsGenerationProtocolV2: (value: unknown) =>
    value != null &&
    typeof value === 'object' &&
    (value as { generationProtocolVersion?: unknown }).generationProtocolVersion === 2,
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

const agentsConversation = {
  conversationId: CONVO_ID,
  endpoint: EModelEndpoint.agents,
} as TConversation;

type HookParams = Partial<Parameters<typeof useSteering>[0]>;

const withActiveGeneration =
  (initialize?: (snapshot: MutableSnapshot) => void, conversationId = CONVO_ID) =>
  (snapshot: MutableSnapshot) => {
    snapshot.set(store.activeGenerationCreatedAtByConvoId(conversationId), 41);
    snapshot.set(store.activeGenerationProtocolVersionByConvoId(conversationId), 2);
    initialize?.(snapshot);
  };

function setup(params: HookParams = {}, initialize?: (snapshot: MutableSnapshot) => void) {
  const sendNow = jest.fn();
  const stopGenerating = jest.fn();
  let setGenerationCreatedAt: ((value: number | null) => void) | undefined;
  const GenerationProbe = () => {
    setGenerationCreatedAt = useSetRecoilState(
      store.activeGenerationCreatedAtByConvoId(params.conversationId ?? CONVO_ID),
    );
    return null;
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot
      initializeState={withActiveGeneration(initialize, params.conversationId ?? CONVO_ID)}
    >
      <GenerationProbe />
      {children}
    </RecoilRoot>
  );
  const rendered = renderHook(
    () =>
      useSteering({
        index: 0,
        conversationId: CONVO_ID,
        conversation: agentsConversation,
        isSubmitting: true,
        answerModeActive: false,
        sendNow,
        stopGenerating,
        ...params,
      }),
    { wrapper },
  );
  return {
    ...rendered,
    sendNow,
    stopGenerating,
    setGenerationCreatedAt: (value: number | null) => setGenerationCreatedAt?.(value),
  };
}

function useQueue(convoId: string) {
  return useRecoilValue(store.queuedMessagesByConvoId(convoId));
}

/** Puts a message in the queue and then sends it, which is the only order the
 *  rail can produce: Send now is offered for a message the queue is holding. */
function sendFromQueue(
  current: {
    steering: ReturnType<typeof useSteering>;
    setQueue: (items: QueuedMessage[]) => void;
  },
  item: QueuedMessage,
) {
  current.setQueue([item]);
  current.steering.sendQueuedNow(item);
}

describe('useSteering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages = undefined;
  });

  describe('effectiveAction', () => {
    it('defaults to queue during an active agents run', () => {
      const { result } = setup();
      expect(result.current.duringRunActive).toBe(true);
      expect(result.current.effectiveAction).toBe('queue');
    });

    it('honors the queue preference while keeping the steer override available', () => {
      const { result } = setup({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'queue');
      });
      expect(result.current.effectiveAction).toBe('queue');
      // The per-send menu can still override to steer — availability is
      // independent of the default action.
      expect(result.current.canSteer).toBe(true);
    });

    it('degrades to queue without a real conversation id', () => {
      // Seed 'steer' so the assertion exercises the `canSteer ?` degrade
      // guard itself, not just the (now default) queue value falling through.
      const { result } = setup({ conversationId: Constants.NEW_CONVO as string }, ({ set }) => {
        set(store.duringRunDefaultAction, 'steer');
      });
      expect(result.current.effectiveAction).toBe('queue');
    });

    it('degrades to queue while paused on a tool approval', () => {
      mockMessages = [
        {
          messageId: 'resp-1',
          isCreatedByUser: false,
          content: [
            {
              type: ContentTypes.TOOL_CALL,
              tool_call: { id: 'call-1', name: 'shell', approval: { actionId: 'a1' }, output: '' },
            },
          ],
        } as unknown as TMessage,
      ];
      // Seed 'steer' so this proves the pausedOnApproval guard forces queue,
      // not just that the default happens to already be queue.
      const { result } = setup({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'steer');
      });
      expect(result.current.pausedOnApproval).toBe(true);
      expect(result.current.effectiveAction).toBe('queue');
      expect(result.current.canSteer).toBe(false);
    });

    it('queues during startup and exposes no live mutation until the generation epoch arrives', () => {
      const { result, stopGenerating, setGenerationCreatedAt } = setup({}, ({ set }) => {
        set(store.activeGenerationCreatedAtByConvoId(CONVO_ID), null);
      });

      expect(result.current.duringRunActive).toBe(true);
      expect(result.current.canControlGeneration).toBe(false);
      expect(result.current.canSteer).toBe(false);
      expect(result.current.effectiveAction).toBe('queue');

      let queued = false;
      let alternateSteer = true;
      let interrupted = true;
      act(() => {
        queued = result.current.submitDuringRun('hold this until startup finishes');
        // Cmd/Ctrl+Enter reaches this explicit alternate while Queue is the
        // effective action; it must not bypass the epoch gate.
        alternateSteer = result.current.steerFromComposer('unsafe startup steer');
        interrupted = result.current.interruptAndSend('unsafe startup abort');
      });
      expect(queued).toBe(true);
      expect(alternateSteer).toBe(false);
      expect(interrupted).toBe(false);
      expect(mockMutate).not.toHaveBeenCalled();
      expect(stopGenerating).not.toHaveBeenCalled();

      act(() => setGenerationCreatedAt(42));
      expect(result.current.canControlGeneration).toBe(true);
      expect(result.current.canSteer).toBe(true);

      act(() => {
        result.current.steerFromComposer('now fenced');
        result.current.interruptAndSend('now stoppable');
      });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ generationCreatedAt: 42, text: 'now fenced' }),
        expect.anything(),
      );
      expect(stopGenerating).toHaveBeenCalledTimes(1);
    });

    it('is inactive but exposes the paused state for ask-user answer mode', () => {
      expect(
        setup({ conversation: { endpoint: EModelEndpoint.assistants } as TConversation }).result
          .current.duringRunActive,
      ).toBe(false);
      expect(setup({ index: 1 }).result.current.duringRunActive).toBe(false);
      const answerMode = setup({ answerModeActive: true }).result.current;
      expect(answerMode.duringRunActive).toBe(false);
      expect(answerMode.pausedOnApproval).toBe(true);
      expect(answerMode.canSteer).toBe(false);
    });
  });

  describe('queueReclaimedSteer', () => {
    const reclaimed = {
      steerId: 's-reclaimed',
      text: 'reclaimed words',
      status: 'pending' as const,
      createdAt: 1_000,
    };

    /** The run-end signal `useQueueDrain` consumes; seeded here to stand for a
     *  run that already finished by the time a reclaim resolved. */
    const runEnd = (outcome: 'completed' | 'aborted' | 'error', conversationId = CONVO_ID) => ({
      conversationId,
      outcome,
      endedAt: 2_000,
    });

    function setupWithQueue(
      params: HookParams = {},
      initialize?: (snapshot: MutableSnapshot) => void,
    ) {
      const sendNow = jest.fn();
      const stopGenerating = jest.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot initializeState={withActiveGeneration(initialize)}>{children}</RecoilRoot>
      );
      const rendered = renderHook(
        () => ({
          steering: useSteering({
            index: 0,
            conversationId: CONVO_ID,
            conversation: agentsConversation,
            isSubmitting: true,
            answerModeActive: false,
            sendNow,
            stopGenerating,
            ...params,
          }),
          queue: useQueue(CONVO_ID),
          /** What `useQueueDrain` watches: re-posting it is how this hook asks
           *  the drain to reconsider a queue it already passed over. */
          parkedRunEnd: useRecoilValue(store.pendingRunEndByConvoId(CONVO_ID)),
          /** Stands in for the drain CONSUMING a signal it has acted on. */
          consumeIndexSignal: useSetRecoilState(store.runEndByIndex(0)),
          consumeParkedSignal: useSetRecoilState(store.pendingRunEndByConvoId(CONVO_ID)),
        }),
        { wrapper },
      );
      return { ...rendered, sendNow };
    }

    it('keeps the steer ahead of a follow-up queued after it', () => {
      // The steer was accepted BEFORE the follow-up, so it must drain first.
      // Minting a fresh id/createdAt here would sort it last.
      const { result } = setupWithQueue();
      act(() => {
        result.current.steering.enqueue('queued later', {});
      });
      act(() => {
        result.current.steering.queueReclaimedSteer(reclaimed);
      });
      expect(result.current.queue.map((item) => item.text)).toEqual([
        'reclaimed words',
        'queued later',
      ]);
      // The original identity survives, which is what the ordering rests on.
      expect(result.current.queue[0].id).toBe('s-reclaimed');
      expect(result.current.queue[0].createdAt).toBe(1_000);
    });

    it('leaves the item to the drain while the run is still going', () => {
      const { result, sendNow } = setupWithQueue({ isSubmitting: true });
      act(() => {
        result.current.steering.queueReclaimedSteer(reclaimed);
      });
      expect(sendNow).not.toHaveBeenCalled();
      // The run's own end is still ahead of this item and will drain it, so
      // nothing needs re-arming.
      expect(result.current.parkedRunEnd).toBeNull();
      expect(result.current.queue).toHaveLength(1);
    });

    it('re-arms the drain when the run completed cleanly while the reclaim was in flight', () => {
      // The drain already consumed its one-shot signal against an empty queue,
      // so re-post it: the DRAIN sends (FIFO, via `ask`, which does not reset
      // the composer), never this hook.
      const { result, sendNow } = setupWithQueue({ isSubmitting: false }, ({ set }) => {
        set(store.runEndByIndex(0), runEnd('completed'));
      });
      act(() => {
        // The drain ran against an empty queue and consumed the signal — the
        // outcome was already captured during render.
        result.current.consumeIndexSignal(null);
      });
      act(() => {
        result.current.steering.queueReclaimedSteer(reclaimed);
      });
      expect(result.current.parkedRunEnd).toMatchObject({
        conversationId: CONVO_ID,
        outcome: 'completed',
      });
      // The item stays queued for the drain to pick up in its turn.
      expect(result.current.queue.map((item) => item.id)).toEqual(['s-reclaimed']);
      expect(sendNow).not.toHaveBeenCalled();
    });

    it('re-arms from a run-end parked while the user was in another chat', () => {
      // The run finished with this conversation off-screen, so its signal was
      // parked rather than delivered on the index. Without watching the parked
      // carrier too, the outcome would never be seen and the item would strand.
      const { result } = setupWithQueue({ isSubmitting: false }, ({ set }) => {
        set(store.pendingRunEndByConvoId(CONVO_ID), runEnd('completed'));
      });
      act(() => {
        result.current.consumeParkedSignal(null);
      });
      act(() => {
        result.current.steering.queueReclaimedSteer(reclaimed);
      });
      expect(result.current.parkedRunEnd).toMatchObject({ outcome: 'completed' });
      expect(result.current.queue.map((item) => item.id)).toEqual(['s-reclaimed']);
    });

    it.each(['aborted', 'error'] as const)(
      'leaves the item for manual send when the run %s',
      (outcome) => {
        // The drain auto-sends only on a clean completion: a Stop or an error
        // means the user is taking over, so nothing may smuggle the text out.
        const { result, sendNow } = setupWithQueue({ isSubmitting: false }, ({ set }) => {
          set(store.runEndByIndex(0), runEnd(outcome));
        });
        act(() => {
          result.current.consumeIndexSignal(null);
        });
        act(() => {
          result.current.steering.queueReclaimedSteer(reclaimed);
        });
        expect(sendNow).not.toHaveBeenCalled();
        expect(result.current.parkedRunEnd).toBeNull();
        expect(result.current.queue.map((item) => item.id)).toEqual(['s-reclaimed']);
      },
    );

    it('leaves the item for manual send when the completed run was another chat', () => {
      const { result, sendNow } = setupWithQueue({ isSubmitting: false }, ({ set }) => {
        set(store.runEndByIndex(0), runEnd('completed', 'convo-elsewhere'));
      });
      act(() => {
        result.current.consumeIndexSignal(null);
      });
      act(() => {
        result.current.steering.queueReclaimedSteer(reclaimed);
      });
      expect(sendNow).not.toHaveBeenCalled();
      expect(result.current.parkedRunEnd).toBeNull();
      expect(result.current.queue).toHaveLength(1);
    });

    it('keeps older queued follow-ups ahead of the reclaimed steer', () => {
      // The drain sends ONE item per run end, FIFO. Re-arming (rather than
      // sending here) is what keeps an older follow-up from being skipped.
      const { result } = setupWithQueue({ isSubmitting: false }, ({ set }) => {
        set(store.runEndByIndex(0), runEnd('completed'));
        set(store.queuedMessagesByConvoId(CONVO_ID), [
          { id: 'older', text: 'queued first', createdAt: 500 },
        ]);
      });
      act(() => {
        result.current.consumeIndexSignal(null);
      });
      act(() => {
        result.current.steering.queueReclaimedSteer(reclaimed);
      });
      expect(result.current.queue.map((item) => item.id)).toEqual(['older', 's-reclaimed']);
    });

    it('does not re-arm while this conversation’s run-end is still unconsumed', () => {
      // The drain has not run yet, so it will see this item on its own. Arming
      // a second carrier would drain twice and send two messages.
      const { result } = setupWithQueue({ isSubmitting: false }, ({ set }) => {
        set(store.pendingRunEndByConvoId(CONVO_ID), runEnd('completed'));
        set(store.runEndByIndex(0), runEnd('completed'));
      });
      act(() => {
        result.current.steering.queueReclaimedSteer(reclaimed);
      });
      // Untouched: the already-armed signal drains it.
      expect(result.current.parkedRunEnd).toMatchObject({ outcome: 'completed' });
      expect(result.current.queue.map((item) => item.id)).toEqual(['s-reclaimed']);
    });

    /** Renders the hook so the chat it points at can change under it, the way
     *  ChatForm reuses it when the user navigates. */
    function setupNavigable(
      initialProps: { convoId: string; isSubmitting: boolean },
      initialize?: (snapshot: MutableSnapshot) => void,
    ) {
      const sendNow = jest.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot initializeState={withActiveGeneration(initialize)}>{children}</RecoilRoot>
      );
      const rendered = renderHook(
        ({ convoId, isSubmitting }: { convoId: string; isSubmitting: boolean }) => ({
          steering: useSteering({
            index: 0,
            conversationId: convoId,
            conversation: agentsConversation,
            isSubmitting,
            answerModeActive: false,
            sendNow,
            stopGenerating: jest.fn(),
          }),
          parkedHere: useRecoilValue(store.pendingRunEndByConvoId(CONVO_ID)),
          queueHere: useQueue(CONVO_ID),
          /** Stands in for the drain CONSUMING a signal it has acted on. */
          consumeIndexSignal: useSetRecoilState(store.runEndByIndex(0)),
        }),
        { wrapper, initialProps },
      );
      return { ...rendered, sendNow };
    }

    it('still re-arms the origin chat after the user navigates away', () => {
      // Navigating away does not make the words any less owed a send: the run
      // they belong to completed, so its queue must still drain on return.
      const { result, rerender, sendNow } = setupNavigable(
        { convoId: CONVO_ID, isSubmitting: false },
        ({ set }) => {
          set(store.runEndByIndex(0), runEnd('completed'));
        },
      );
      // Captured while still on this chat, resolving after the user left.
      const queueReclaimed = result.current.steering.queueReclaimedSteer;
      act(() => {
        result.current.consumeIndexSignal(null);
      });
      act(() => {
        rerender({ convoId: 'convo-elsewhere', isSubmitting: false });
      });
      act(() => {
        queueReclaimed(reclaimed);
      });

      expect(result.current.parkedHere).toMatchObject({
        conversationId: CONVO_ID,
        outcome: 'completed',
      });
      expect(result.current.queueHere.map((item) => item.id)).toEqual(['s-reclaimed']);
      expect(sendNow).not.toHaveBeenCalled();
    });

    it('re-arms the origin completion when a delayed refusal lands off-screen', () => {
      let rejectSteer: ((error: unknown) => void) | undefined;
      mockMutate.mockImplementationOnce((_params, { onError }) => {
        rejectSteer = onError;
      });
      const { result, rerender, sendNow } = setupNavigable({
        convoId: CONVO_ID,
        isSubmitting: true,
      });

      act(() => {
        result.current.steering.submitSteer('refused after navigation');
      });
      // The origin run completes and its empty-queue drain consumes the signal
      // before the POST response arrives.
      act(() => {
        result.current.consumeIndexSignal(runEnd('completed'));
      });
      act(() => {
        rerender({ convoId: CONVO_ID, isSubmitting: false });
      });
      act(() => {
        result.current.consumeIndexSignal(null);
      });
      act(() => {
        rerender({ convoId: 'convo-elsewhere', isSubmitting: false });
      });
      act(() => {
        rejectSteer?.({ response: { status: 409, data: { code: 'RUN_PAUSED' } } });
      });

      expect(result.current.queueHere).toEqual([
        expect.objectContaining({ text: 'refused after navigation' }),
      ]);
      expect(result.current.parkedHere).toMatchObject({
        conversationId: CONVO_ID,
        outcome: 'completed',
      });
      expect(sendNow).not.toHaveBeenCalled();
    });

    it('never parks another chat’s run-end under this conversation', () => {
      // The run-end is keyed by conversation, so the new chat's end can never
      // be mistaken for this one's. Parking it here would give `drainNext` a
      // foreign `end.conversationId` and drain the wrong queue into this chat.
      const { result, rerender } = setupNavigable({ convoId: CONVO_ID, isSubmitting: true });
      const queueReclaimed = result.current.steering.queueReclaimedSteer;
      act(() => {
        // The user leaves for a chat whose own run then completes.
        rerender({ convoId: 'convo-elsewhere', isSubmitting: false });
      });
      act(() => {
        result.current.consumeIndexSignal(runEnd('completed', 'convo-elsewhere'));
      });
      act(() => {
        queueReclaimed(reclaimed);
      });

      expect(result.current.parkedHere).toBeNull();
      expect(result.current.queueHere.map((item) => item.id)).toEqual(['s-reclaimed']);
    });

    it('does not re-arm from the end of an earlier run of the same chat', () => {
      // A stale end must not authorize a drain: this chat's NEXT run is what
      // owns the item, and its own end will drain it.
      const { result, rerender } = setupNavigable(
        { convoId: CONVO_ID, isSubmitting: false },
        ({ set }) => {
          set(store.runEndByIndex(0), runEnd('completed'));
        },
      );
      act(() => {
        result.current.consumeIndexSignal(null);
      });
      act(() => {
        // A new run starts on this same chat, superseding that end.
        rerender({ convoId: CONVO_ID, isSubmitting: true });
      });
      act(() => {
        result.current.steering.queueReclaimedSteer(reclaimed);
      });

      expect(result.current.parkedHere).toBeNull();
      expect(result.current.queueHere.map((item) => item.id)).toEqual(['s-reclaimed']);
    });

    it('re-arms even when another conversation’s run-end occupies the index slot', () => {
      // The index slot is shared. The drain parks a foreign signal under ITS
      // conversation and then only inspects the active one's queue, so treating
      // it as proof of an upcoming drain would strand this item.
      const { result } = setupWithQueue({ isSubmitting: false }, ({ set }) => {
        set(store.runEndByIndex(0), runEnd('completed'));
      });
      act(() => {
        result.current.consumeIndexSignal(null);
      });
      act(() => {
        // A later run on the shared index slot, belonging to a different chat.
        result.current.consumeIndexSignal(runEnd('completed', 'convo-elsewhere'));
      });
      act(() => {
        result.current.steering.queueReclaimedSteer(reclaimed);
      });
      expect(result.current.parkedRunEnd).toMatchObject({
        conversationId: CONVO_ID,
        outcome: 'completed',
      });
      expect(result.current.queue.map((item) => item.id)).toEqual(['s-reclaimed']);
    });

    it('re-arms a consumed completion drain when receipt replay recovers a leftover', () => {
      mockMutate.mockImplementationOnce((_params, { onSuccess }) => {
        onSuccess({
          steerId: 's-receipt-leftover',
          status: 'queued',
          position: 1,
          conversationId: CONVO_ID,
          settled: true,
          leftover: true,
          replayed: true,
          generationProtocolVersion: 2,
        });
      });
      const { result } = setupWithQueue({ isSubmitting: false }, ({ set }) => {
        set(store.runEndByIndex(0), runEnd('completed'));
      });
      act(() => {
        result.current.consumeIndexSignal(null);
      });
      act(() => {
        result.current.steering.submitSteer('recovered after drain');
      });

      expect(result.current.queue).toEqual([
        expect.objectContaining({
          id: 's-receipt-leftover',
          text: 'recovered after drain',
        }),
      ]);
      expect(result.current.parkedRunEnd).toMatchObject({
        conversationId: CONVO_ID,
        outcome: 'completed',
      });
    });
  });

  describe('submitDuringRun', () => {
    it('routes to the steer POST with an optimistic sending chip', () => {
      const { result } = setup({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'steer');
      });
      let consumed = false;
      act(() => {
        consumed = result.current.submitDuringRun('steer this');
      });
      expect(consumed).toBe(true);
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVO_ID,
          text: 'steer this',
          clientSteerId: expect.any(String),
        }),
        expect.anything(),
      );
    });

    it('routes to the client queue when the preference is queue', () => {
      const { result } = setup({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'queue');
      });
      act(() => {
        result.current.submitDuringRun('after the run');
      });
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('ignores empty submissions', () => {
      // Seed 'steer' so the mockMutate assertion actually exercises the
      // steer path's blank-text guard, not the (now default) queue path.
      const { result } = setup({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'steer');
      });
      let consumed = true;
      act(() => {
        consumed = result.current.submitDuringRun('   ');
      });
      expect(consumed).toBe(false);
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('steer POST outcomes', () => {
    it('queues on NO_ACTIVE_RUN while the final SSE is still settling', () => {
      // isSubmitting is still true: ask()'s in-flight guard would drop a
      // direct send, so the text must go to the queue for the run-end drain.
      mockMutate.mockImplementation((_params, { onError }) => {
        onError({ response: { data: { code: 'NO_ACTIVE_RUN' } } });
      });
      const { result, sendNow } = setup({ isSubmitting: true });
      act(() => {
        result.current.submitSteer('too late');
      });
      expect(sendNow).not.toHaveBeenCalled();
    });

    it('sends as a normal turn on NO_ACTIVE_RUN once submission has settled', () => {
      mockMutate.mockImplementation((_params, { onError }) => {
        onError({ response: { data: { code: 'NO_ACTIVE_RUN' } } });
      });
      const { result, sendNow } = setup({ isSubmitting: false });
      act(() => {
        result.current.submitSteer('too late');
      });
      expect(sendNow).toHaveBeenCalledWith(
        'too late',
        [],
        expect.objectContaining({
          expectedPredecessorCreatedAt: 41,
          queuedMessageOrigin: {
            item: expect.objectContaining({
              id: expect.stringMatching(/^local-/),
              text: 'too late',
              createdAt: expect.any(Number),
              expectedPredecessorCreatedAt: 41,
            }),
            beforeIds: [],
            afterIds: [],
          },
        }),
      );
    });

    it('fences a queued-origin fallback and carries its exact restoration slot', () => {
      mockMutate.mockImplementation((_params, { onError }) => {
        onError({ response: { data: { code: 'NO_ACTIVE_RUN' } } });
      });
      const queuedOrigin = {
        item: { id: 'queued-original', text: 'late queued turn', createdAt: 10 },
        beforeIds: ['queued-before'],
        afterIds: ['queued-after'],
      };
      const { result, sendNow } = setup({ isSubmitting: false });

      act(() => {
        result.current.submitSteer('late queued turn', undefined, undefined, { queuedOrigin });
      });

      expect(sendNow).toHaveBeenCalledWith('late queued turn', [], {
        expectedPredecessorCreatedAt: 41,
        queuedMessageOrigin: queuedOrigin,
      });
    });

    it('queues + toasts when the run is paused (RUN_PAUSED)', () => {
      mockMutate.mockImplementation((_params, { onError }) => {
        onError({ response: { data: { code: 'RUN_PAUSED' } } });
      });
      const { result } = setup();
      act(() => {
        result.current.submitSteer('paused steer');
      });
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('never normal-sends into a newer live run on RUN_REPLACED', () => {
      mockMutate.mockImplementation((_params, { onError }) => {
        onError({
          response: { data: { code: 'RUN_REPLACED', generationProtocolVersion: 2 } },
        });
      });
      const { result, sendNow } = setup({ isSubmitting: false });
      act(() => {
        result.current.submitSteer('wait for the newer run');
      });
      expect(sendNow).not.toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalled();
    });
  });

  describe('interrupt & steer (preempt)', () => {
    it('posts preempt: true and marks the optimistic chip', () => {
      const { result } = setup();
      act(() => {
        result.current.interruptSteer('stop and do this');
      });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'stop and do this', preempt: true }),
        expect.anything(),
      );
    });

    /**
     * Steering needs a server-side job, so `submitSteer` hard-refuses without
     * a real conversationId. Without this fallback the always-visible button
     * would be dead for the whole first turn.
     */
    it('falls back to interruptAndSend before a conversation exists', () => {
      const { result, stopGenerating } = setup({
        conversationId: Constants.NEW_CONVO as string,
      });
      let consumed = false;
      act(() => {
        consumed = result.current.interruptSteer('turn one interrupt');
      });
      expect(consumed).toBe(true);
      expect(mockMutate).not.toHaveBeenCalled();
      expect(stopGenerating).toHaveBeenCalled();
    });

    it('refuses empty text without touching the run', () => {
      const { result, stopGenerating } = setup();
      let consumed = true;
      act(() => {
        consumed = result.current.interruptSteer('   ');
      });
      expect(consumed).toBe(false);
      expect(mockMutate).not.toHaveBeenCalled();
      expect(stopGenerating).not.toHaveBeenCalled();
    });

    /**
     * `canSteer` is false while paused, but routing that into
     * `interruptAndSend` would hard-abort the run and discard the partial
     * answer — the opposite of what the action promises.
     */
    it('refuses while paused on tool approval instead of aborting', () => {
      mockMessages = [
        {
          messageId: 'm1',
          conversationId: CONVO_ID,
          isCreatedByUser: false,
          content: [
            {
              type: ContentTypes.TOOL_CALL,
              [ContentTypes.TOOL_CALL]: { id: 'call_1', name: 't', approval: 'pending' },
            },
          ],
        } as unknown as TMessage,
      ];
      const { result, stopGenerating } = setup();
      let consumed = true;
      act(() => {
        consumed = result.current.interruptSteer('do not abort me');
      });
      mockMessages = undefined;

      expect(consumed).toBe(false);
      expect(stopGenerating).not.toHaveBeenCalled();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    /**
     * The explicit Steer row and the Ctrl/Cmd+Enter alternate must stay
     * non-preempting, or they become indistinguishable from Interrupt & steer.
     */
    it('leaves the explicit Steer action non-preempting even with the preference on', () => {
      const { result } = setup({}, ({ set }) => {
        set(store.steerInterruptsByDefault, true);
      });
      act(() => {
        result.current.steerFromComposer('explicit steer row');
      });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.not.objectContaining({ preempt: true }),
        expect.anything(),
      );
    });

    /* Retry lives in `useSteerRecovery` now, which owns the chip actions the
       thread's pending block renders; its own spec covers the preempt carry. */

    it('an ordinary steer does not preempt by default', () => {
      const { result } = setup({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'steer');
      });
      act(() => {
        result.current.submitDuringRun('just steer');
      });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.not.objectContaining({ preempt: true }),
        expect.anything(),
      );
    });

    it('steerInterruptsByDefault makes the default Enter route preempt', () => {
      const { result } = setup({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'steer');
        set(store.steerInterruptsByDefault, true);
      });
      act(() => {
        result.current.submitDuringRun('enter should interrupt');
      });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ preempt: true }),
        expect.anything(),
      );
    });

    /**
     * Capability degradation is a relabel, never an error: the server echoes
     * what it actually armed and the chip follows it.
     */
    it('honours a server echo of preempt: false on the ACK', () => {
      mockMutate.mockImplementation((_params, { onSuccess }) => {
        onSuccess({
          status: 'queued',
          steerId: 'server-1',
          position: 1,
          conversationId: CONVO_ID,
          preempt: false,
        });
      });
      const { result } = setup();
      act(() => {
        result.current.interruptSteer('interrupt me');
      });
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ preempt: true }),
        expect.anything(),
      );
    });

    it('serializes rapid steer POSTs in submission order', () => {
      const acknowledge: Array<(serverId: string) => void> = [];
      mockMutate.mockImplementation((params, { onSuccess }) => {
        acknowledge.push((serverId) =>
          onSuccess({
            status: 'queued',
            steerId: serverId,
            position: 1,
            conversationId: params.conversationId,
          }),
        );
      });
      const { result } = setup();
      act(() => {
        result.current.interruptSteer('first');
        result.current.interruptSteer('second');
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'first', preempt: true, generationCreatedAt: 41 }),
        expect.anything(),
      );

      act(() => {
        acknowledge[0]('server-first');
      });

      expect(mockMutate).toHaveBeenCalledTimes(2);
      expect(mockMutate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ text: 'second', preempt: true, generationCreatedAt: 41 }),
        expect.anything(),
      );

      act(() => {
        acknowledge[1]('server-second');
        result.current.interruptSteer('third');
      });
      expect(mockMutate).toHaveBeenCalledTimes(3);
      expect(mockMutate).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ text: 'third', preempt: true, generationCreatedAt: 41 }),
        expect.anything(),
      );
    });

    it('keeps different conversations dispatching in parallel', () => {
      const otherConversationId = 'convo-steer-ui-other';
      const acknowledge: Array<(serverId: string) => void> = [];
      mockMutate.mockImplementation((params, { onSuccess }) => {
        acknowledge.push((serverId) =>
          onSuccess({
            status: 'queued',
            steerId: serverId,
            position: 1,
            conversationId: params.conversationId,
          }),
        );
      });
      const sendNow = jest.fn();
      const stopGenerating = jest.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.activeGenerationCreatedAtByConvoId(CONVO_ID), 41);
            set(store.activeGenerationProtocolVersionByConvoId(CONVO_ID), 2);
            set(store.activeGenerationCreatedAtByConvoId(otherConversationId), 42);
            set(store.activeGenerationProtocolVersionByConvoId(otherConversationId), 2);
          }}
        >
          {children}
        </RecoilRoot>
      );
      const { result, rerender } = renderHook(
        ({ conversationId }: { conversationId: string }) =>
          useSteering({
            index: 0,
            conversationId,
            conversation: { ...agentsConversation, conversationId } as TConversation,
            isSubmitting: true,
            answerModeActive: false,
            sendNow,
            stopGenerating,
          }),
        { initialProps: { conversationId: CONVO_ID }, wrapper },
      );

      act(() => {
        result.current.submitSteer('first conversation');
      });
      rerender({ conversationId: otherConversationId });
      act(() => {
        result.current.submitSteer('second conversation');
      });

      expect(mockMutate).toHaveBeenCalledTimes(2);
      expect(mockMutate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ conversationId: CONVO_ID, text: 'first conversation' }),
        expect.anything(),
      );
      expect(mockMutate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          conversationId: otherConversationId,
          text: 'second conversation',
        }),
        expect.anything(),
      );

      act(() => {
        acknowledge[0]('server-first-conversation');
        acknowledge[1]('server-second-conversation');
      });
    });
  });

  describe('interruptAndSend + queue helpers', () => {
    function setupWithState(
      params: HookParams = {},
      initialize?: (snapshot: MutableSnapshot) => void,
    ) {
      const sendNow = jest.fn();
      const stopGenerating = jest.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot initializeState={withActiveGeneration(initialize)}>{children}</RecoilRoot>
      );
      const rendered = renderHook(
        () => ({
          steering: useSteering({
            index: 0,
            conversationId: CONVO_ID,
            conversation: agentsConversation,
            isSubmitting: true,
            answerModeActive: false,
            sendNow,
            stopGenerating,
            ...params,
          }),
          queue: useQueue(CONVO_ID),
          setQueue: useSetRecoilState(store.queuedMessagesByConvoId(CONVO_ID)),
          setActiveEpoch: useSetRecoilState(store.activeGenerationCreatedAtByConvoId(CONVO_ID)),
          setActiveProtocol: useSetRecoilState(
            store.activeGenerationProtocolVersionByConvoId(CONVO_ID),
          ),
          setAcceptedIds: useSetRecoilState(store.acceptedSteerClientIdsByConvoId(CONVO_ID)),
          chips: useRecoilValue(store.pendingSteersByConvoId(CONVO_ID)),
          setAppliedIds: useSetRecoilState(store.appliedSteerIdsByConvoId(CONVO_ID)),
          drainFlag: useRecoilValue(store.drainAfterAbortByIndex(0)),
        }),
        { wrapper },
      );
      return { ...rendered, sendNow, stopGenerating };
    }

    it('drops the ACK chip when FINAL settlement lands before the delayed 202', () => {
      let acknowledge: (() => void) | undefined;
      let clientSteerId = '';
      mockMutate.mockImplementation((params, { onSuccess }) => {
        clientSteerId = params.clientSteerId;
        acknowledge = () =>
          onSuccess({
            steerId: 'srv-1',
            status: 'queued',
            position: 1,
            conversationId: CONVO_ID,
          });
      });
      const { result } = setupWithState();
      act(() => {
        result.current.steering.submitSteer('already injected');
      });
      expect(result.current.chips).toEqual([
        expect.objectContaining({ steerId: clientSteerId, status: 'sending' }),
      ]);
      act(() => {
        result.current.setAppliedIds([clientSteerId, 'srv-1']);
      });
      act(() => {
        acknowledge?.();
      });
      // No pending chip may survive — its only removal event already passed.
      expect(result.current.chips).toEqual([]);
      expect(result.current.queue).toEqual([]);
    });

    it.each([
      [
        'a definite origin 400',
        { response: { status: 400, data: { code: 'INVALID_STEER' } } },
        false,
      ],
      ['a transport failure', new Error('network disconnected'), true],
    ] as const)('marks delivery uncertainty correctly for %s', (_scenario, error, uncertain) => {
      mockMutate.mockImplementationOnce((_params, { onError }) => onError(error));
      const { result } = setupWithState();

      act(() => {
        result.current.steering.submitSteer('classify the failure');
      });

      expect(result.current.chips).toEqual([
        expect.objectContaining({
          status: 'failed',
          ...(uncertain && { deliveryUncertain: true }),
        }),
      ]);
      if (!uncertain) {
        expect(result.current.chips[0].deliveryUncertain).toBeUndefined();
      }
    });

    it('marks an ambiguous legacy delivery as non-retryable protocol v1', () => {
      mockMutate.mockImplementationOnce((_params, { onError }) =>
        onError(new Error('network disconnected')),
      );
      const { result } = setupWithState({}, ({ set }) => {
        set(store.activeGenerationProtocolVersionByConvoId(CONVO_ID), 1);
      });

      act(() => {
        result.current.steering.submitSteer('legacy ambiguous delivery');
      });

      expect(result.current.chips).toEqual([
        expect.objectContaining({
          status: 'failed',
          deliveryUncertain: true,
          generationProtocolVersion: 1,
        }),
      ]);
    });

    it('converts the ACK chip to pending when the steer is not yet applied', () => {
      mockMutate.mockImplementation((_params, { onSuccess }) => {
        onSuccess({ steerId: 'srv-2', status: 'queued', position: 1, conversationId: CONVO_ID });
      });
      const { result } = setupWithState();
      act(() => {
        result.current.steering.submitSteer('awaiting boundary');
      });
      expect(result.current.chips).toEqual([
        expect.objectContaining({ steerId: 'srv-2', status: 'pending' }),
      ]);
    });

    it('recovers a delayed ACK when a replacement generation is already active', () => {
      let acknowledge: (() => void) | undefined;
      let clientSteerId = '';
      mockMutate.mockImplementation((params, { onSuccess }) => {
        clientSteerId = params.clientSteerId;
        acknowledge = () =>
          onSuccess({
            steerId: 'srv-replaced',
            status: 'queued',
            position: 1,
            conversationId: CONVO_ID,
          });
      });
      const { result } = setupWithState();

      act(() => {
        result.current.steering.submitSteer('accepted by the old generation');
      });
      // The server's correlation update may arrive before both replacement
      // handoff and the delayed HTTP ACK. Acceptance is not proof of delivery.
      act(() => {
        result.current.setAcceptedIds([clientSteerId]);
      });
      act(() => {
        result.current.setActiveEpoch(42);
      });
      act(() => {
        acknowledge?.();
      });

      expect(result.current.chips).toEqual([]);
      expect(result.current.queue).toEqual([
        expect.objectContaining({
          id: 'srv-replaced',
          text: 'accepted by the old generation',
          recoverySteerId: 'srv-replaced',
        }),
      ]);
    });

    it('recovers a delayed ACK after the source generation epoch is cleared', () => {
      let acknowledge: (() => void) | undefined;
      mockMutate.mockImplementation((params, { onSuccess }) => {
        acknowledge = () =>
          onSuccess({
            steerId: 'srv-ended',
            status: 'queued',
            position: 1,
            conversationId: params.conversationId,
          });
      });
      const { result } = setupWithState();

      act(() => {
        result.current.steering.submitSteer('accepted before the epoch cleared');
      });
      act(() => {
        result.current.setActiveEpoch(null);
      });
      act(() => {
        acknowledge?.();
      });

      expect(result.current.chips).toEqual([]);
      expect(result.current.queue).toEqual([
        expect.objectContaining({
          id: 'srv-ended',
          text: 'accepted before the epoch cleared',
          recoverySteerId: 'srv-ended',
        }),
      ]);
    });

    it('fences steer submission and its retry chip to the attached generation epoch', () => {
      mockMutate.mockImplementation((_params, { onError }) => {
        onError({ response: { status: 400, data: { code: 'INVALID_STEER' } } });
      });
      const { result } = setupWithState({}, ({ set }) => {
        set(store.activeGenerationCreatedAtByConvoId(CONVO_ID), 41);
      });

      act(() => {
        result.current.steering.submitSteer('epoch-bound');
      });

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVO_ID,
          generationCreatedAt: 41,
        }),
        expect.anything(),
      );
      expect(result.current.chips).toEqual([
        expect.objectContaining({ generationCreatedAt: 41, status: 'failed' }),
      ]);
    });

    it('carries the submit time through the ACK so the pending chip is not re-timestamped', () => {
      // A draft queued during the 202 round-trip must not drain ahead of a
      // steer submitted before it — so the ACK'd chip keeps its SUBMIT time,
      // not the (later) ACK time.
      const now = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValue(9_000);
      try {
        mockMutate.mockImplementation((_params, { onSuccess }) => {
          onSuccess({ steerId: 'srv-t', status: 'queued', position: 1, conversationId: CONVO_ID });
        });
        const { result } = setupWithState();
        act(() => {
          result.current.steering.submitSteer('submitted first');
        });
        expect(result.current.chips).toEqual([
          expect.objectContaining({ steerId: 'srv-t', status: 'pending', createdAt: 1_000 }),
        ]);
      } finally {
        now.mockRestore();
      }
    });

    it('preserves the original submit time through a same-id receipt retry', () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
      try {
        mockMutate.mockImplementationOnce((_params, { onError }) => {
          onError(new Error('lost response'));
        });
        const { result } = setupWithState();
        act(() => {
          result.current.steering.submitSteer('retry without reordering');
        });
        const failed = result.current.chips[0];

        now.mockReturnValue(9_000);
        act(() => {
          // A replacement deployment/run may now advertise v1. The receipt
          // still belongs to the v2 source generation captured on the chip.
          result.current.setActiveProtocol(1);
        });
        mockMutate.mockImplementationOnce((_params, { onSuccess }) => {
          onSuccess({
            steerId: 'srv-retry-leftover',
            settled: true,
            leftover: true,
            replayed: true,
            generationProtocolVersion: 2,
          });
        });
        act(() => {
          result.current.steering.retrySteer(failed.steerId, failed.text, failed.files, undefined, {
            createdAt: failed.createdAt,
            generationCreatedAt: failed.generationCreatedAt,
            generationProtocolVersion: failed.generationProtocolVersion,
          });
        });

        expect(result.current.queue).toEqual([
          expect.objectContaining({
            id: 'srv-retry-leftover',
            createdAt: 1_000,
            clientRequestId: expect.stringMatching(UUID_V4_PATTERN),
            recoverySteerId: 'srv-retry-leftover',
          }),
        ]);
      } finally {
        now.mockRestore();
      }
    });

    it('does not duplicate a chip already reseeded under the server id (SSE reconnect)', () => {
      mockMutate.mockImplementation((_params, { onSuccess }) => {
        onSuccess({ steerId: 'srv-3', status: 'queued', position: 1, conversationId: CONVO_ID });
      });
      const { result } = setupWithState({}, ({ set }) => {
        // seedSteerChips already re-minted this chip from resumeState before
        // the 202 ACK landed — the ACK must upsert, not append.
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 'srv-3', text: 'reseeded', status: 'pending', createdAt: 1 },
        ]);
      });
      act(() => {
        result.current.steering.submitSteer('reseeded');
      });
      expect(result.current.chips.filter((chip) => chip.steerId === 'srv-3')).toHaveLength(1);
    });

    it('restores the queued item (same id, original slot) when sendNow refuses', () => {
      const refusingSendNow = jest.fn().mockReturnValue(false);
      const { result } = setupWithState({ isSubmitting: false, sendNow: refusingSendNow });
      act(() => {
        result.current.steering.enqueue('refused send');
        result.current.steering.enqueue('still behind');
      });
      const [first, second] = result.current.queue;
      act(() => {
        result.current.steering.sendQueuedNow(first);
      });
      expect(refusingSendNow).toHaveBeenCalledWith('refused send', [], {
        quotes: undefined,
        manualSkills: undefined,
        clientRequestId: undefined,
        recoverySteerId: undefined,
        expectedPredecessorCreatedAt: 41,
        queuedMessageOrigin: {
          item: first,
          beforeIds: [],
          afterIds: [second.id],
        },
      });
      // `ask` refused without sending — the ORIGINAL item returns to its slot.
      expect(result.current.queue.map((item) => item.id)).toEqual([first.id, second.id]);
      expect(result.current.queue[0]).toEqual(first);
    });

    it('queues the steer text+files when a settled NO_ACTIVE_RUN send is refused', () => {
      const steerFiles = [
        { file_id: 'file-refused', filepath: '/uploads/file-refused.png', type: 'image/png' },
      ];
      mockMutate.mockImplementationOnce((_params, { onError }) => {
        onError({ response: { data: { code: 'NO_ACTIVE_RUN' } } });
      });
      const refusingSendNow = jest.fn().mockReturnValue(false);
      const { result } = setupWithState({ isSubmitting: false, sendNow: refusingSendNow });
      act(() => {
        result.current.steering.submitSteer('refused words', steerFiles);
      });
      expect(refusingSendNow).toHaveBeenCalledWith(
        'refused words',
        steerFiles,
        expect.objectContaining({
          expectedPredecessorCreatedAt: 41,
          queuedMessageOrigin: expect.objectContaining({
            item: expect.objectContaining({ text: 'refused words', files: steerFiles }),
          }),
        }),
      );
      // The chip is already gone — a refused send must land in the queue, not drop.
      expect(result.current.chips).toEqual([]);
      expect(result.current.queue).toEqual([
        expect.objectContaining({ text: 'refused words', files: steerFiles }),
      ]);
    });

    it('queues the steer text+files when a settled-run rejection send is refused', () => {
      const steerFiles = [
        { file_id: 'file-paused', filepath: '/uploads/file-paused.png', type: 'image/png' },
      ];
      mockMutate.mockImplementationOnce((_params, { onError }) => {
        onError({ response: { data: { code: 'STEER_UNSUPPORTED' } } });
      });
      const refusingSendNow = jest.fn().mockReturnValue(false);
      const { result } = setupWithState({ isSubmitting: false, sendNow: refusingSendNow });
      act(() => {
        result.current.steering.submitSteer('unsupported words', steerFiles);
      });
      expect(refusingSendNow).toHaveBeenCalledWith(
        'unsupported words',
        steerFiles,
        expect.objectContaining({
          expectedPredecessorCreatedAt: 41,
          queuedMessageOrigin: expect.objectContaining({
            item: expect.objectContaining({ text: 'unsupported words', files: steerFiles }),
          }),
        }),
      );
      expect(result.current.chips).toEqual([]);
      expect(result.current.queue).toEqual([
        expect.objectContaining({ text: 'unsupported words', files: steerFiles }),
      ]);
    });

    it('does not restore the queued item when sendNow accepts', () => {
      const acceptingSendNow = jest.fn().mockReturnValue(undefined);
      const { result } = setupWithState({ isSubmitting: false, sendNow: acceptingSendNow });
      act(() => {
        result.current.steering.enqueue('accepted send');
      });
      const queued = result.current.queue[0];
      act(() => {
        result.current.steering.sendQueuedNow(queued);
      });
      expect(acceptingSendNow).toHaveBeenCalledWith('accepted send', [], {
        quotes: undefined,
        manualSkills: undefined,
        clientRequestId: undefined,
        recoverySteerId: undefined,
        expectedPredecessorCreatedAt: 41,
        queuedMessageOrigin: {
          item: queued,
          beforeIds: [],
          afterIds: [],
        },
      });
      expect(result.current.queue).toEqual([]);
    });

    it('leaves a queued item untouched when answer mode owns the submission slot', () => {
      const { result, sendNow } = setupWithState({ answerModeActive: true });
      act(() => {
        result.current.steering.enqueue('wait for the answer');
      });
      const queued = result.current.queue[0];

      expect(result.current.steering.canSendQueuedNow).toBe(false);
      act(() => {
        result.current.steering.sendQueuedNow(queued);
      });

      expect(result.current.queue).toEqual([queued]);
      expect(sendNow).not.toHaveBeenCalled();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('does not lose a second queued item clicked before submitting state renders', () => {
      const acceptingSendNow = jest.fn().mockReturnValue(undefined);
      const { result } = setupWithState({ isSubmitting: false, sendNow: acceptingSendNow });
      act(() => {
        result.current.steering.enqueue('first send');
        result.current.steering.enqueue('second send');
      });
      const [first, second] = result.current.queue;

      act(() => {
        result.current.steering.sendQueuedNow(first);
        result.current.steering.sendQueuedNow(second);
      });

      expect(acceptingSendNow).toHaveBeenCalledTimes(1);
      expect(acceptingSendNow).toHaveBeenCalledWith('first send', [], {
        quotes: undefined,
        manualSkills: undefined,
        clientRequestId: undefined,
        recoverySteerId: undefined,
        expectedPredecessorCreatedAt: 41,
        queuedMessageOrigin: {
          item: first,
          beforeIds: [],
          afterIds: [second.id],
        },
      });
      expect(result.current.queue).toEqual([second]);
    });

    it('interruptAndSend queues at the front, arms the drain flag, and stops the run', () => {
      const { result, stopGenerating } = setupWithState();
      act(() => {
        result.current.steering.enqueue('already queued');
      });
      act(() => {
        result.current.steering.interruptAndSend('urgent redirect');
      });
      expect(result.current.queue.map((item) => item.text)).toEqual([
        'urgent redirect',
        'already queued',
      ]);
      expect(result.current.drainFlag).toEqual({
        conversationId: CONVO_ID,
        generationCreatedAt: 41,
      });
      expect(stopGenerating).toHaveBeenCalledTimes(1);
    });

    it('keeps multiple interrupt-and-send items FIFO ahead of ordinary follow-ups', () => {
      const now = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(10)
        .mockReturnValueOnce(20);
      try {
        const { result } = setupWithState();
        act(() => {
          result.current.steering.enqueue('ordinary');
          result.current.steering.interruptAndSend('first interrupt');
          result.current.steering.interruptAndSend('second interrupt');
        });

        expect(result.current.queue.map((item) => item.text)).toEqual([
          'first interrupt',
          'second interrupt',
          'ordinary',
        ]);
      } finally {
        now.mockRestore();
      }
    });

    it('enqueue appends and removeQueued deletes by id', () => {
      const { result } = setupWithState();
      act(() => {
        result.current.steering.enqueue('one');
        result.current.steering.enqueue('two');
      });
      expect(result.current.queue.map((item) => item.text)).toEqual(['one', 'two']);
      const firstId = result.current.queue[0].id;
      act(() => {
        result.current.steering.removeQueued(firstId);
      });
      expect(result.current.queue.map((item) => item.text)).toEqual(['two']);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('atomically discards a recovered source and downgrades its row in place', async () => {
      mockCancelSteer.mockResolvedValueOnce({ removed: true, generationProtocolVersion: 2 });
      const before: QueuedMessage = { id: 'queued-before', text: 'before', createdAt: 0 };
      const recovered: QueuedMessage = {
        id: 'queued-leftover',
        text: 'edit this next',
        createdAt: 1,
        clientRequestId: 'recovery-attempt',
        recoverySteerId: 'server-leftover',
        recoveryClientSteerId: 'client-leftover',
        expectedPredecessorCreatedAt: 41,
        files: [{ file_id: 'file-1', filepath: '/uploads/file-1.txt', type: 'text/plain' }],
        quotes: ['keep quote'],
        manualSkills: ['keep skill'],
        priority: true,
      };
      const after: QueuedMessage = { id: 'queued-after', text: 'after', createdAt: 2 };
      const { result } = setupWithState({}, ({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), [before, recovered, after]);
      });

      let discarded = false;
      await act(async () => {
        discarded = await result.current.steering.discardQueued(recovered);
      });

      expect(discarded).toBe(true);
      expect(mockCancelSteer).toHaveBeenCalledWith({
        conversationId: CONVO_ID,
        steerId: 'server-leftover',
        clientSteerId: 'client-leftover',
      });
      expect(result.current.queue).toEqual([
        before,
        {
          id: 'queued-leftover',
          text: 'edit this next',
          createdAt: 1,
          expectedPredecessorCreatedAt: 41,
          files: [{ file_id: 'file-1', filepath: '/uploads/file-1.txt', type: 'text/plain' }],
          quotes: ['keep quote'],
          manualSkills: ['keep skill'],
          priority: true,
        },
        after,
      ]);
    });

    it('keeps a recovered queue row when its parked source cannot be discarded', async () => {
      mockCancelSteer.mockResolvedValueOnce({ removed: false, generationProtocolVersion: 2 });
      const recovered = {
        id: 'queued-leftover',
        text: 'do not duplicate me',
        createdAt: 1,
        recoverySteerId: 'server-leftover',
        recoveryClientSteerId: 'client-leftover',
      };
      const { result } = setupWithState({}, ({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), [recovered]);
      });

      let discarded = true;
      await act(async () => {
        discarded = await result.current.steering.discardQueued(recovered);
      });

      expect(discarded).toBe(false);
      expect(result.current.queue).toEqual([recovered]);
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'Could not cancel the steering message — it may still reach the agent',
        status: 'error',
      });
    });

    it('fails closed for a recovered row without a durable receipt correlation', async () => {
      const recovered = {
        id: 'queued-leftover',
        text: 'keep this visible',
        createdAt: 1,
        recoverySteerId: 'server-leftover',
      };
      const { result } = setupWithState({}, ({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), [recovered]);
      });

      let discarded = true;
      await act(async () => {
        discarded = await result.current.steering.discardQueued(recovered);
      });

      expect(discarded).toBe(false);
      expect(mockCancelSteer).not.toHaveBeenCalled();
      expect(result.current.queue).toEqual([recovered]);
    });

    it('sendQueuedNow steers whenever steering is available, even under the queue preference', () => {
      const { result } = setupWithState({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'queue');
      });
      act(() => {
        result.current.steering.enqueue('send me now');
      });
      const queued = result.current.queue[0];
      act(() => {
        result.current.steering.sendQueuedNow(queued);
      });
      expect(result.current.queue).toEqual([]);
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVO_ID,
          text: 'send me now',
          clientSteerId: expect.any(String),
        }),
        expect.anything(),
      );
    });

    it.each([
      ['an ordinary paused steer', 'RUN_PAUSED', undefined],
      ['a preempt steer rejected at capacity', 'STEER_QUEUE_FULL', { preempt: true }],
      ['a preempt steer racing run settlement', 'NO_ACTIVE_RUN', { preempt: true }],
    ] as const)('restores a non-front queued item in place after %s', (_scenario, code, opts) => {
      mockMutate.mockImplementationOnce((_params, { onError }) => {
        onError({ response: { data: { code } } });
      });
      const before = { id: 'q-before', text: 'before', createdAt: 10 };
      const selected = {
        id: 'q-selected',
        text: 'restore exactly',
        createdAt: 20,
        priority: true,
        quotes: ['carried quote'],
        manualSkills: ['carried-skill'],
        files: [
          {
            file_id: 'file-selected',
            filepath: '/uploads/file-selected.txt',
            type: 'text/plain',
          },
        ],
      };
      const after = { id: 'q-after', text: 'after', createdAt: 30 };
      const originalQueue = [before, selected, after];
      const { result } = setupWithState({}, ({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), originalQueue);
      });

      act(() => {
        result.current.steering.sendQueuedNow(selected, opts);
      });

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVO_ID,
          text: selected.text,
          files: selected.files,
          clientSteerId: expect.any(String),
          ...(opts?.preempt === true && { preempt: true }),
        }),
        expect.anything(),
      );
      expect(result.current.chips).toEqual([]);
      expect(result.current.queue).toEqual(originalQueue);
      expect(result.current.queue[1]).toBe(selected);
    });

    it('restores before a surviving successor when the queue drains during the request', () => {
      let rejectSteer: ((error: unknown) => void) | undefined;
      mockMutate.mockImplementationOnce((_params, { onError }) => {
        rejectSteer = onError;
      });
      const before = { id: 'q-drained', text: 'drained meanwhile', createdAt: 10 };
      const selected = { id: 'q-racing', text: 'restore before successor', createdAt: 20 };
      const after = { id: 'q-survives', text: 'surviving successor', createdAt: 30 };
      const addedLater = { id: 'q-later', text: 'queued during request', createdAt: 40 };
      const { result } = setupWithState({}, ({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), [before, selected, after]);
      });

      act(() => {
        result.current.steering.sendQueuedNow(selected);
      });
      expect(result.current.queue).toEqual([before, after]);

      act(() => {
        result.current.setQueue([after, addedLater]);
        rejectSteer?.({ response: { data: { code: 'NO_ACTIVE_RUN' } } });
      });

      expect(result.current.queue).toEqual([selected, after, addedLater]);
      expect(result.current.queue[0]).toBe(selected);
    });

    it('serializes two queue-origin sends and reconstructs their order when both reject', () => {
      const rejectSteer: Array<(error: unknown) => void> = [];
      mockMutate.mockImplementation((_params, { onError }) => {
        rejectSteer.push(onError);
      });
      const first = { id: 'q-concurrent-first', text: 'first instruction', createdAt: 10 };
      const second = { id: 'q-concurrent-second', text: 'second instruction', createdAt: 20 };
      const { result } = setupWithState({}, ({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), [first, second]);
      });

      act(() => {
        result.current.steering.sendQueuedNow(first);
      });
      act(() => {
        result.current.steering.sendQueuedNow(second);
      });
      expect(result.current.queue).toEqual([]);
      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ text: first.text }),
        expect.anything(),
      );

      act(() => {
        rejectSteer[0]({ response: { data: { code: 'RUN_PAUSED' } } });
      });
      expect(mockMutate).toHaveBeenCalledTimes(2);
      expect(mockMutate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ text: second.text }),
        expect.anything(),
      );

      act(() => {
        rejectSteer[1]({ response: { data: { code: 'RUN_PAUSED' } } });
      });

      expect(result.current.queue).toEqual([first, second]);
      expect(result.current.queue[0]).toBe(first);
      expect(result.current.queue[1]).toBe(second);

      act(() => {
        result.current.steering.submitSteer('third after rejections');
      });
      expect(mockMutate).toHaveBeenCalledTimes(3);
      expect(mockMutate).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ text: 'third after rejections' }),
        expect.anything(),
      );
    });

    it('reconstructs FIFO when two serialized queue-origin receipts report leftovers', () => {
      const settle: Array<(serverId: string) => void> = [];
      mockMutate.mockImplementation((_params, { onSuccess }) => {
        settle.push((serverId) =>
          onSuccess({
            steerId: serverId,
            settled: true,
            leftover: true,
            replayed: true,
            generationProtocolVersion: 2,
          }),
        );
      });
      const first = { id: 'q-receipt-first', text: 'first accepted', createdAt: 10 };
      const second = { id: 'q-receipt-second', text: 'second accepted', createdAt: 20 };
      const { result } = setupWithState({}, ({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), [first, second]);
      });

      act(() => {
        result.current.steering.sendQueuedNow(first);
      });
      act(() => {
        result.current.steering.sendQueuedNow(second);
      });
      expect(result.current.queue).toEqual([]);
      expect(settle).toHaveLength(1);

      act(() => {
        settle[0]('srv-receipt-first');
      });
      expect(settle).toHaveLength(2);
      act(() => {
        settle[1]('srv-receipt-second');
      });

      expect(result.current.queue).toEqual([
        expect.objectContaining({
          ...first,
          clientRequestId: expect.stringMatching(UUID_V4_PATTERN),
          recoverySteerId: 'srv-receipt-first',
        }),
        expect.objectContaining({
          ...second,
          clientRequestId: expect.stringMatching(UUID_V4_PATTERN),
          recoverySteerId: 'srv-receipt-second',
        }),
      ]);
      expect(result.current.queue[0].clientRequestId).not.toBe(
        result.current.queue[1].clientRequestId,
      );
      expect(result.current.queue[0].clientRequestId).not.toBe('steer-recovery:srv-receipt-first');
      expect(result.current.queue[1].clientRequestId).not.toBe('steer-recovery:srv-receipt-second');
    });
  });

  describe('attachments', () => {
    const composerFile = {
      file_id: 'file-1',
      filepath: '/uploads/file-1.png',
      type: 'image/png',
      height: 10,
      width: 10,
    };
    const queuedFiles = [{ file_id: 'file-1', filepath: '/uploads/file-1.png', type: 'image/png' }];

    /** Steering is gated on the active-generation epoch, so seed it by default
     *  or every steer here is refused as pre-epoch. `null` seeds nothing, which
     *  is the pre-epoch case itself; an initializer seeds the epoch and then
     *  whatever else that test needs. */
    function setupWithFiles(
      params: HookParams = {},
      initialize?: ((snapshot: MutableSnapshot) => void) | null,
    ) {
      const setFiles = jest.fn();
      const files = new Map([['file-1', composerFile]]) as unknown as NonNullable<
        Parameters<typeof useSteering>[0]['files']
      >;
      const sendNow = jest.fn();
      const stopGenerating = jest.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot
          initializeState={
            initialize === null
              ? undefined
              : (snapshot) => {
                  snapshot.set(store.activeGenerationCreatedAtByConvoId(CONVO_ID), 41);
                  initialize?.(snapshot);
                }
          }
        >
          {children}
        </RecoilRoot>
      );
      const rendered = renderHook(
        () => ({
          steering: useSteering({
            index: 0,
            conversationId: CONVO_ID,
            conversation: agentsConversation,
            isSubmitting: true,
            answerModeActive: false,
            files,
            setFiles,
            sendNow,
            stopGenerating,
            ...params,
          }),
          queue: useQueue(CONVO_ID),
          setQueue: useSetRecoilState(store.queuedMessagesByConvoId(CONVO_ID)),
        }),
        { wrapper },
      );
      return { ...rendered, setFiles, sendNow, stopGenerating };
    }

    it('steers with the composer attachments as one unit', () => {
      const { result, setFiles } = setupWithFiles({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'steer');
      });
      let consumed = false;
      act(() => {
        consumed = result.current.steering.submitDuringRun('look at this image');
      });
      expect(consumed).toBe(true);
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVO_ID,
          text: 'look at this image',
          clientSteerId: expect.any(String),
          files: [expect.objectContaining({ file_id: 'file-1' })],
        }),
        expect.anything(),
      );
      expect(result.current.queue).toEqual([]);
      expect(setFiles).toHaveBeenCalledWith(new Map());
    });

    it('holds during-run submits while uploads are in flight', () => {
      // Seed 'steer' so this covers steerFromComposer's own filesLoading
      // guard; the queue-path guard is covered separately (queueFromComposer
      // is exercised directly with filesLoading in the composer-draft tests).
      const { result } = setupWithFiles({ filesLoading: true }, ({ set }) => {
        set(store.duringRunDefaultAction, 'steer');
      });
      let consumed = true;
      act(() => {
        consumed = result.current.steering.submitDuringRun('too early');
      });
      expect(consumed).toBe(false);
      expect(result.current.queue).toEqual([]);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('does not consume composer attachments when an explicit pre-epoch steer is refused', () => {
      const { result, setFiles } = setupWithFiles({}, null);
      let consumed = true;

      act(() => {
        consumed = result.current.steering.steerFromComposer('wait for startup');
      });

      expect(consumed).toBe(false);
      expect(mockMutate).not.toHaveBeenCalled();
      expect(setFiles).not.toHaveBeenCalled();
    });

    /* The drain can take the head between the click dispatching and the row
       unmounting. Falling back to the captured item sent the same words twice. */
    it('refuses to send a message the queue no longer holds', () => {
      const { result, sendNow } = setupWithFiles({ isSubmitting: false });
      act(() => {
        result.current.steering.sendQueuedNow({
          id: 'already-drained',
          text: 'sent moments ago',
          createdAt: Date.now(),
        });
      });
      expect(sendNow).not.toHaveBeenCalled();
      expect(mockMutate).not.toHaveBeenCalled();
      expect(result.current.queue).toEqual([]);
    });

    it('steers a queued media item with its own files during a live run', () => {
      const { result, sendNow } = setupWithFiles();
      act(() => {
        sendFromQueue(result.current, {
          id: 'q-media',
          text: 'media message',
          createdAt: Date.now(),
          files: queuedFiles,
        });
      });
      expect(sendNow).not.toHaveBeenCalled();
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVO_ID,
          text: 'media message',
          files: queuedFiles,
          clientSteerId: expect.any(String),
        }),
        expect.anything(),
      );
      expect(result.current.queue).toEqual([]);
    });

    it('sends a media item as a normal turn with its own files when idle', () => {
      const { result, sendNow } = setupWithFiles({ isSubmitting: false });
      act(() => {
        sendFromQueue(result.current, {
          id: 'q-media',
          text: 'media message',
          createdAt: Date.now(),
          files: queuedFiles,
        });
      });
      expect(sendNow).toHaveBeenCalledWith('media message', queuedFiles, {
        quotes: undefined,
        manualSkills: undefined,
        clientRequestId: undefined,
        recoverySteerId: undefined,
        expectedPredecessorCreatedAt: undefined,
        queuedMessageOrigin: {
          item: {
            id: 'q-media',
            text: 'media message',
            createdAt: expect.any(Number),
            files: queuedFiles,
          },
          beforeIds: [],
          afterIds: [],
        },
      });
    });

    it('marks queued files used exactly once when queueing from the composer', () => {
      const { result } = setupWithFiles();
      act(() => {
        result.current.steering.queueFromComposer('queued with media');
      });
      expect(mockMarkUsage).toHaveBeenCalledTimes(1);
      expect(mockMarkUsage).toHaveBeenCalledWith({ file_ids: ['file-1'] });
    });

    it('marks queued files used on interrupt & send', () => {
      const { result } = setupWithFiles();
      act(() => {
        result.current.steering.interruptAndSend('urgent with media');
      });
      expect(mockMarkUsage).toHaveBeenCalledTimes(1);
      expect(mockMarkUsage).toHaveBeenCalledWith({ file_ids: ['file-1'] });
    });

    it('does not mark usage for text-only queueing', () => {
      const { result } = setupWithFiles({ files: new Map() });
      act(() => {
        result.current.steering.queueFromComposer('just text');
      });
      expect(mockMarkUsage).not.toHaveBeenCalled();
    });

    it('does not mark usage on the steer path (the 202 already marked)', () => {
      const { result } = setupWithFiles({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'steer');
      });
      act(() => {
        result.current.steering.submitDuringRun('steer with media');
      });
      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(mockMarkUsage).not.toHaveBeenCalled();
    });

    it('restores an unchanged queued media item without re-marking its files', () => {
      // Paused on approval → steering unavailable while the run is live, so
      // sendQueuedNow restores the item unchanged — its files were already marked.
      mockMessages = [
        {
          messageId: 'resp-1',
          isCreatedByUser: false,
          content: [
            {
              type: ContentTypes.TOOL_CALL,
              tool_call: { id: 'call-1', name: 'shell', approval: { actionId: 'a1' }, output: '' },
            },
          ],
        } as unknown as TMessage,
      ];
      const { result } = setupWithFiles();
      const queued = {
        id: 'q-requeue',
        text: 'requeued media',
        createdAt: Date.now(),
        files: queuedFiles,
      };
      act(() => {
        result.current.setQueue([queued]);
      });
      act(() => {
        result.current.steering.sendQueuedNow(queued);
      });
      expect(result.current.queue).toEqual([queued]);
      expect(result.current.queue[0]).toBe(queued);
      expect(mockMarkUsage).not.toHaveBeenCalled();
    });
  });

  describe('composer quotes + manual skill capture', () => {
    function setupWithContext(
      params: HookParams = {},
      initialize?: (snapshot: MutableSnapshot) => void,
    ) {
      const sendNow = jest.fn();
      const stopGenerating = jest.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot initializeState={withActiveGeneration(initialize)}>{children}</RecoilRoot>
      );
      const rendered = renderHook(
        () => ({
          steering: useSteering({
            index: 0,
            conversationId: CONVO_ID,
            conversation: agentsConversation,
            isSubmitting: true,
            answerModeActive: false,
            sendNow,
            stopGenerating,
            ...params,
          }),
          queue: useQueue(CONVO_ID),
          setQueue: useSetRecoilState(store.queuedMessagesByConvoId(CONVO_ID)),
          chips: useRecoilValue(store.pendingSteersByConvoId(CONVO_ID)),
          pendingQuotes: useRecoilValue(store.pendingQuotesByConvoId(CONVO_ID)),
          pendingSkills: useRecoilValue(store.pendingManualSkillsByConvoId(CONVO_ID)),
        }),
        { wrapper },
      );
      return { ...rendered, sendNow };
    }

    const stageContext = ({ set }: MutableSnapshot) => {
      set(store.pendingQuotesByConvoId(CONVO_ID), ['quoted excerpt']);
      set(store.pendingManualSkillsByConvoId(CONVO_ID), ['skill-1']);
    };

    it('queueFromComposer consumes staged quotes + skills into the queued item', () => {
      const { result } = setupWithContext({}, stageContext);
      act(() => {
        result.current.steering.queueFromComposer('with context');
      });
      expect(result.current.queue).toEqual([
        expect.objectContaining({
          text: 'with context',
          quotes: ['quoted excerpt'],
          manualSkills: ['skill-1'],
        }),
      ]);
      // Consumed, not copied: the composer chips must not ride the NEXT send.
      expect(result.current.pendingQuotes).toEqual([]);
      expect(result.current.pendingSkills).toEqual([]);
    });

    it('interruptAndSend captures the staged context on the front item', () => {
      const { result } = setupWithContext({}, stageContext);
      act(() => {
        result.current.steering.enqueue('already queued');
      });
      act(() => {
        result.current.steering.interruptAndSend('urgent redirect');
      });
      expect(result.current.queue[0]).toEqual(
        expect.objectContaining({
          text: 'urgent redirect',
          quotes: ['quoted excerpt'],
          manualSkills: ['skill-1'],
        }),
      );
      expect(result.current.queue[1].quotes).toBeUndefined();
      expect(result.current.pendingQuotes).toEqual([]);
      expect(result.current.pendingSkills).toEqual([]);
    });

    it('leaves staged context untouched on the steer path (steers do not carry it)', () => {
      const { result } = setupWithContext({}, stageContext);
      act(() => {
        result.current.steering.steerFromComposer('steer text');
      });
      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(result.current.pendingQuotes).toEqual(['quoted excerpt']);
      expect(result.current.pendingSkills).toEqual(['skill-1']);
    });

    it('queues without quotes/skills fields when nothing is staged', () => {
      const { result } = setupWithContext();
      act(() => {
        result.current.steering.queueFromComposer('plain text');
      });
      expect(result.current.queue[0].quotes).toBeUndefined();
      expect(result.current.queue[0].manualSkills).toBeUndefined();
    });

    it('sendQueuedNow passes the carried context to sendNow when idle', () => {
      const { result, sendNow } = setupWithContext({ isSubmitting: false });
      act(() => {
        sendFromQueue(result.current, {
          id: 'q-ctx',
          text: 'context send',
          createdAt: Date.now(),
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        });
      });
      expect(sendNow).toHaveBeenCalledWith('context send', [], {
        quotes: ['carried quote'],
        manualSkills: ['carried-skill'],
        clientRequestId: undefined,
        recoverySteerId: undefined,
        expectedPredecessorCreatedAt: undefined,
        queuedMessageOrigin: {
          item: {
            id: 'q-ctx',
            text: 'context send',
            createdAt: expect.any(Number),
            quotes: ['carried quote'],
            manualSkills: ['carried-skill'],
          },
          beforeIds: [],
          afterIds: [],
        },
      });
    });

    it('requeues a degraded queued-origin steer with its carried quotes + skills', () => {
      // The item left the queue before the POST settled; the 409 fallback
      // must restore its FULL context, not just text + files.
      mockMutate.mockImplementationOnce((_params, { onError }) => {
        onError({ response: { data: { code: 'RUN_PAUSED' } } });
      });
      const { result } = setupWithContext();
      act(() => {
        sendFromQueue(result.current, {
          id: 'q-degraded',
          text: 'carried context',
          createdAt: Date.now(),
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        });
      });
      expect(result.current.queue).toEqual([
        expect.objectContaining({
          text: 'carried context',
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        }),
      ]);
    });

    it('sends a settled NO_ACTIVE_RUN fallback with the carried context as overrides', () => {
      mockMutate.mockImplementationOnce((_params, { onError }) => {
        onError({ response: { data: { code: 'NO_ACTIVE_RUN' } } });
      });
      const { result, sendNow } = setupWithContext({ isSubmitting: false });
      act(() => {
        result.current.steering.submitSteer('late context', undefined, {
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        });
      });
      expect(sendNow).toHaveBeenCalledWith('late context', [], {
        quotes: ['carried quote'],
        manualSkills: ['carried-skill'],
        expectedPredecessorCreatedAt: 41,
        queuedMessageOrigin: {
          item: expect.objectContaining({
            id: expect.stringMatching(/^local-/),
            text: 'late context',
            createdAt: expect.any(Number),
            expectedPredecessorCreatedAt: 41,
            quotes: ['carried quote'],
            manualSkills: ['carried-skill'],
          }),
          beforeIds: [],
          afterIds: [],
        },
      });
    });

    it('carries a queued-origin context onto the sending chip and the 202 ACK chip', () => {
      mockMutate.mockImplementationOnce((_params, { onSuccess }) => {
        onSuccess({ steerId: 'srv-ctx', status: 'queued', position: 1, conversationId: CONVO_ID });
      });
      const { result } = setupWithContext();
      act(() => {
        result.current.steering.submitSteer('carried steer', undefined, {
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        });
      });
      expect(result.current.chips).toEqual([
        expect.objectContaining({
          steerId: 'srv-ctx',
          status: 'pending',
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        }),
      ]);
    });

    it('restores the carried context when a late ACK converts straight to queued', () => {
      // The run ended before the 202 landed: the ACK's queued conversion is
      // the only surviving copy of the steer, so it must keep quotes + skills.
      mockMutate.mockImplementationOnce((_params, { onSuccess }) => {
        onSuccess({ steerId: 'srv-late', status: 'queued', position: 1, conversationId: CONVO_ID });
      });
      const { result } = setupWithContext({ isSubmitting: false });
      act(() => {
        result.current.steering.submitSteer('late carried', undefined, {
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        });
      });
      expect(result.current.chips).toEqual([]);
      expect(result.current.queue).toEqual([
        expect.objectContaining({
          id: 'srv-late',
          text: 'late carried',
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        }),
      ]);
    });

    it('restores an exact queued-origin item when its 202 lands after run end', () => {
      let acknowledge: (() => void) | undefined;
      mockMutate.mockImplementationOnce((_params, { onSuccess }) => {
        acknowledge = () =>
          onSuccess({
            steerId: 'server-late-id',
            status: 'queued',
            position: 1,
            conversationId: CONVO_ID,
          });
      });
      const params: HookParams = { isSubmitting: true };
      const before = { id: 'late-before', text: 'before', createdAt: 10 };
      const selected = {
        id: 'late-selected',
        text: 'accepted before run end',
        createdAt: 20,
        priority: true,
        quotes: ['original quote'],
      };
      const after = { id: 'late-after', text: 'after', createdAt: 30 };
      const { result, rerender } = setupWithContext(params, ({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), [before, selected, after]);
      });

      act(() => {
        result.current.steering.sendQueuedNow(selected);
      });
      expect(result.current.queue).toEqual([before, after]);

      params.isSubmitting = false;
      rerender();
      act(() => {
        acknowledge?.();
      });

      expect(result.current.queue).toEqual([
        before,
        expect.objectContaining({
          ...selected,
          clientRequestId: expect.stringMatching(UUID_V4_PATTERN),
          recoverySteerId: 'server-late-id',
          recoveryClientSteerId: expect.any(String),
        }),
        after,
      ]);
      expect(result.current.queue[1].clientRequestId).not.toBe('steer-recovery:server-late-id');
    });

    it('keeps the carried context on a failed chip through retry', () => {
      mockMutate.mockImplementationOnce((_params, { onError }) => {
        onError({ response: { data: { code: 'SOME_ERROR' } } });
      });
      const { result } = setupWithContext();
      act(() => {
        result.current.steering.submitSteer('failed carried', undefined, {
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        });
      });
      const failed = result.current.chips[0];
      expect(failed).toEqual(
        expect.objectContaining({
          status: 'failed',
          deliveryUncertain: true,
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        }),
      );
      mockMutate.mockImplementationOnce((_params, { onSuccess }) => {
        onSuccess({
          steerId: 'srv-retry',
          status: 'queued',
          position: 1,
          conversationId: CONVO_ID,
        });
      });
      act(() => {
        result.current.steering.retrySteer(failed.steerId, failed.text, failed.files, {
          quotes: failed.quotes,
          manualSkills: failed.manualSkills,
        });
      });
      expect(mockMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({ clientSteerId: failed.steerId }),
        expect.anything(),
      );
      expect(result.current.chips).toEqual([
        expect.objectContaining({
          steerId: 'srv-retry',
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        }),
      ]);
    });

    it('leaves composer atoms staged when a composer-origin steer degrades', () => {
      mockMutate.mockImplementationOnce((_params, { onError }) => {
        onError({ response: { data: { code: 'RUN_PAUSED' } } });
      });
      const { result } = setupWithContext({}, stageContext);
      act(() => {
        result.current.steering.steerFromComposer('degraded steer');
      });
      // Degrades to a text-only queued item; the staged chips stay put for
      // the user's next composer send.
      expect(result.current.queue).toEqual([expect.objectContaining({ text: 'degraded steer' })]);
      expect(result.current.queue[0].quotes).toBeUndefined();
      expect(result.current.queue[0].manualSkills).toBeUndefined();
      expect(result.current.pendingQuotes).toEqual(['quoted excerpt']);
      expect(result.current.pendingSkills).toEqual(['skill-1']);
    });
  });

  describe('composer draft consumption', () => {
    /** `useAutoSave` drafts under PENDING_CONVO for the whole run, and the
     *  composer clears via the form's programmatic `reset()` — which fires no
     *  `input` event, so nothing else drops the draft. Left behind, run end
     *  migrates it onto the conversation and restores it into the textarea,
     *  resurfacing text the user already sent. */
    const pendingDraftKey = `${LocalStorageKeys.TEXT_DRAFT}${Constants.PENDING_CONVO}`;

    const stageDraft = () => localStorage.setItem(pendingDraftKey, 'ZHJhZnRlZCB0ZXh0');

    beforeEach(() => {
      localStorage.clear();
    });

    it('drops the pending draft when queueing from the composer', () => {
      stageDraft();
      const { result } = setup();
      act(() => {
        result.current.queueFromComposer('queued follow up');
      });
      expect(result.current.queueKey).toBe(CONVO_ID);
      expect(localStorage.getItem(pendingDraftKey)).toBeNull();
    });

    it('drops the pending draft when steering from the composer', () => {
      stageDraft();
      const { result } = setup();
      act(() => {
        result.current.steerFromComposer('steered text');
      });
      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(pendingDraftKey)).toBeNull();
    });

    it('drops the pending draft on interrupt & send', () => {
      stageDraft();
      const { result } = setup();
      act(() => {
        result.current.interruptAndSend('interrupting text');
      });
      expect(localStorage.getItem(pendingDraftKey)).toBeNull();
    });

    it('keeps the pending draft when the submit is refused', () => {
      // Nothing left the composer, so its draft must survive: an empty
      // submission and an in-flight upload both refuse without consuming.
      stageDraft();
      const { result } = setup({ filesLoading: true });
      act(() => {
        expect(result.current.queueFromComposer('held by upload')).toBe(false);
        expect(result.current.submitDuringRun('   ')).toBe(false);
      });
      expect(localStorage.getItem(pendingDraftKey)).toBe('ZHJhZnRlZCB0ZXh0');
    });
  });
});
