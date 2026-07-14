import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, type MutableSnapshot } from 'recoil';
import { Constants, ContentTypes, EModelEndpoint } from 'librechat-data-provider';
import type { TConversation, TMessage } from 'librechat-data-provider';
import useSteering from '../useSteering';
import store from '~/store';

const CONVO_ID = 'convo-steer-ui';

const mockMutate = jest.fn();
const mockShowToast = jest.fn();
let mockMessages: TMessage[] | undefined;

jest.mock('~/data-provider', () => ({
  useSteerMessageMutation: () => ({ mutate: mockMutate }),
  useGetMessagesByConvoId: () => ({ data: mockMessages }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

const agentsConversation = {
  conversationId: CONVO_ID,
  endpoint: EModelEndpoint.agents,
} as TConversation;

type HookParams = Partial<Parameters<typeof useSteering>[0]>;

function setup(params: HookParams = {}, initialize?: (snapshot: MutableSnapshot) => void) {
  const sendNow = jest.fn();
  const stopGenerating = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot initializeState={initialize}>{children}</RecoilRoot>
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
  return { ...rendered, sendNow, stopGenerating };
}

function useQueue(convoId: string) {
  return useRecoilValue(store.queuedMessagesByConvoId(convoId));
}

describe('useSteering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages = undefined;
  });

  describe('effectiveAction', () => {
    it('defaults to steer during an active agents run', () => {
      const { result } = setup();
      expect(result.current.duringRunActive).toBe(true);
      expect(result.current.effectiveAction).toBe('steer');
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
      const { result } = setup({ conversationId: Constants.NEW_CONVO as string });
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
      const { result } = setup();
      expect(result.current.pausedOnApproval).toBe(true);
      expect(result.current.effectiveAction).toBe('queue');
      expect(result.current.canSteer).toBe(false);
    });

    it('is inactive for assistants endpoints, secondary composers, and answer mode', () => {
      expect(
        setup({ conversation: { endpoint: EModelEndpoint.assistants } as TConversation }).result
          .current.duringRunActive,
      ).toBe(false);
      expect(setup({ index: 1 }).result.current.duringRunActive).toBe(false);
      expect(setup({ answerModeActive: true }).result.current.duringRunActive).toBe(false);
    });
  });

  describe('submitDuringRun', () => {
    it('routes to the steer POST with an optimistic sending chip', () => {
      const { result } = setup();
      let consumed = false;
      act(() => {
        consumed = result.current.submitDuringRun('steer this');
      });
      expect(consumed).toBe(true);
      expect(mockMutate).toHaveBeenCalledWith(
        { conversationId: CONVO_ID, text: 'steer this' },
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
      const { result } = setup();
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
      expect(sendNow).toHaveBeenCalledWith('too late', []);
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
  });

  describe('interruptAndSend + queue helpers', () => {
    function setupWithState(
      params: HookParams = {},
      initialize?: (snapshot: MutableSnapshot) => void,
    ) {
      const sendNow = jest.fn();
      const stopGenerating = jest.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot initializeState={initialize}>{children}</RecoilRoot>
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
          chips: useRecoilValue(store.pendingSteersByConvoId(CONVO_ID)),
          drainFlag: useRecoilValue(store.drainAfterAbortByIndex(0)),
        }),
        { wrapper },
      );
      return { ...rendered, sendNow, stopGenerating };
    }

    it('drops the ACK chip when on_steer_applied already landed (SSE beat the 202)', () => {
      mockMutate.mockImplementation((_params, { onSuccess }) => {
        onSuccess({ steerId: 'srv-1', status: 'queued', position: 1, conversationId: CONVO_ID });
      });
      const { result } = setupWithState({}, ({ set }) => {
        set(store.appliedSteerIdsByConvoId(CONVO_ID), ['srv-1']);
      });
      act(() => {
        result.current.steering.submitSteer('already injected');
      });
      // No pending chip may survive — its only removal event already passed.
      expect(result.current.chips).toEqual([]);
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

    it('restores the queued item (same id, front) when sendNow refuses', () => {
      const refusingSendNow = jest.fn().mockReturnValue(false);
      const { result } = setupWithState({ isSubmitting: false, sendNow: refusingSendNow });
      act(() => {
        result.current.steering.enqueue('refused send');
        result.current.steering.enqueue('still behind');
      });
      const [first, second] = result.current.queue;
      act(() => {
        result.current.steering.sendQueuedNow(first.id, first.text);
      });
      expect(refusingSendNow).toHaveBeenCalledWith('refused send', []);
      // `ask` refused without sending — the ORIGINAL item returns to the front.
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
      expect(refusingSendNow).toHaveBeenCalledWith('refused words', steerFiles);
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
      expect(refusingSendNow).toHaveBeenCalledWith('unsupported words', steerFiles);
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
      const queuedId = result.current.queue[0].id;
      act(() => {
        result.current.steering.sendQueuedNow(queuedId, 'accepted send');
      });
      expect(acceptingSendNow).toHaveBeenCalledWith('accepted send', []);
      expect(result.current.queue).toEqual([]);
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
      expect(result.current.drainFlag).toBe(true);
      expect(stopGenerating).toHaveBeenCalledTimes(1);
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

    it('sendQueuedNow steers whenever steering is available, even under the queue preference', () => {
      const { result } = setupWithState({}, ({ set }) => {
        set(store.duringRunDefaultAction, 'queue');
      });
      act(() => {
        result.current.steering.enqueue('send me now');
      });
      const queuedId = result.current.queue[0].id;
      act(() => {
        result.current.steering.sendQueuedNow(queuedId, 'send me now');
      });
      expect(result.current.queue).toEqual([]);
      expect(mockMutate).toHaveBeenCalledWith(
        { conversationId: CONVO_ID, text: 'send me now' },
        expect.anything(),
      );
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

    function setupWithFiles(params: HookParams = {}) {
      const setFiles = jest.fn();
      const files = new Map([['file-1', composerFile]]) as unknown as NonNullable<
        Parameters<typeof useSteering>[0]['files']
      >;
      const sendNow = jest.fn();
      const stopGenerating = jest.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot>{children}</RecoilRoot>
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
        }),
        { wrapper },
      );
      return { ...rendered, setFiles, sendNow, stopGenerating };
    }

    it('steers with the composer attachments as one unit', () => {
      const { result, setFiles } = setupWithFiles();
      let consumed = false;
      act(() => {
        consumed = result.current.steering.submitDuringRun('look at this image');
      });
      expect(consumed).toBe(true);
      expect(mockMutate).toHaveBeenCalledWith(
        {
          conversationId: CONVO_ID,
          text: 'look at this image',
          files: [expect.objectContaining({ file_id: 'file-1' })],
        },
        expect.anything(),
      );
      expect(result.current.queue).toEqual([]);
      expect(setFiles).toHaveBeenCalledWith(new Map());
    });

    it('holds during-run submits while uploads are in flight', () => {
      const { result } = setupWithFiles({ filesLoading: true });
      let consumed = true;
      act(() => {
        consumed = result.current.steering.submitDuringRun('too early');
      });
      expect(consumed).toBe(false);
      expect(result.current.queue).toEqual([]);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('steers a queued media item with its own files during a live run', () => {
      const { result, sendNow } = setupWithFiles();
      act(() => {
        result.current.steering.sendQueuedNow('q-media', 'media message', queuedFiles);
      });
      expect(sendNow).not.toHaveBeenCalled();
      expect(mockMutate).toHaveBeenCalledWith(
        { conversationId: CONVO_ID, text: 'media message', files: queuedFiles },
        expect.anything(),
      );
      expect(result.current.queue).toEqual([]);
    });

    it('sends a media item as a normal turn with its own files when idle', () => {
      const { result, sendNow } = setupWithFiles({ isSubmitting: false });
      act(() => {
        result.current.steering.sendQueuedNow('q-media', 'media message', queuedFiles);
      });
      expect(sendNow).toHaveBeenCalledWith('media message', queuedFiles);
    });
  });
});
