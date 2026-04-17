import { renderHook, act } from '@testing-library/react';
import { RecoilRoot, useRecoilCallback } from 'recoil';
import {
  Constants,
  StepTypes,
  StepEvents,
  ContentTypes,
  ToolCallTypes,
} from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SummaryContentPart,
  EventSubmission,
  TEndpointOption,
  TConversation,
  TMessage,
  SubagentUpdateEvent,
  Agents,
} from 'librechat-data-provider';
import useStepHandler from '~/hooks/SSE/useStepHandler';
import { subagentProgressByToolCallId } from '~/store/subagents';

type TSubmissionForTest = {
  userMessage: TMessage;
  isEdited?: boolean;
  isContinued?: boolean;
  isTemporary: boolean;
  messages: TMessage[];
  isRegenerate?: boolean;
  conversation: Partial<TConversation>;
  endpointOption: TEndpointOption;
  initialResponse: TMessage;
  editedContent?: { index: number; type: string; [key: string]: unknown } | null;
};

describe('useStepHandler', () => {
  const mockSetMessages = jest.fn();
  const mockGetMessages = jest.fn();
  const mockAnnouncePolite = jest.fn();
  const mockLastAnnouncementTimeRef = { current: 0 };

  const createHookParams = () => ({
    setMessages: mockSetMessages,
    getMessages: mockGetMessages,
    announcePolite: mockAnnouncePolite,
    lastAnnouncementTimeRef: mockLastAnnouncementTimeRef,
  });

  const createUserMessage = (overrides: Partial<TMessage> = {}): TMessage => ({
    messageId: 'user-msg-1',
    conversationId: 'conv-1',
    parentMessageId: '00000000-0000-0000-0000-000000000000',
    isCreatedByUser: true,
    text: 'Hello',
    sender: 'User',
    ...overrides,
  });

  const createResponseMessage = (overrides: Partial<TMessage> = {}): TMessage => ({
    messageId: 'response-msg-1',
    conversationId: 'conv-1',
    parentMessageId: 'user-msg-1',
    isCreatedByUser: false,
    text: '',
    sender: 'Assistant',
    content: [],
    ...overrides,
  });

  const createSubmission = (overrides: Partial<TSubmissionForTest> = {}): EventSubmission =>
    ({
      userMessage: createUserMessage(),
      isRegenerate: false,
      isEdited: false,
      isContinued: false,
      isTemporary: false,
      messages: [],
      conversation: {},
      endpointOption: {} as TEndpointOption,
      initialResponse: createResponseMessage(),
      ...overrides,
    }) as unknown as EventSubmission;

  const createRunStep = (overrides: Partial<Agents.RunStep> = {}): Agents.RunStep => ({
    id: 'step-1',
    runId: 'response-msg-1',
    index: 0,
    type: StepTypes.MESSAGE_CREATION,
    stepDetails: {
      type: StepTypes.MESSAGE_CREATION,
      message_creation: { message_id: 'msg-1' },
    },
    usage: null,
    ...overrides,
  });

  const createToolCallRunStep = (overrides: Partial<Agents.RunStep> = {}): Agents.RunStep => ({
    id: 'step-tool-1',
    runId: 'response-msg-1',
    index: 0,
    type: StepTypes.TOOL_CALLS,
    stepDetails: {
      type: StepTypes.TOOL_CALLS,
      tool_calls: [
        {
          id: 'tool-call-1',
          name: 'test_tool',
          args: '{}',
          type: ToolCallTypes.TOOL_CALL,
        },
      ],
    },
    usage: null,
    ...overrides,
  });

  const createMessageDelta = (
    stepId: string,
    text: string,
    overrides: Partial<Agents.MessageDeltaEvent> = {},
  ): Agents.MessageDeltaEvent => ({
    id: stepId,
    delta: {
      content: [{ type: ContentTypes.TEXT, text }],
    },
    ...overrides,
  });

  const createReasoningDelta = (
    stepId: string,
    think: string,
    overrides: Partial<Agents.ReasoningDeltaEvent> = {},
  ): Agents.ReasoningDeltaEvent => ({
    id: stepId,
    delta: {
      content: [{ type: ContentTypes.THINK, think }],
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLastAnnouncementTimeRef.current = 0;
    mockGetMessages.mockReturnValue([]);
  });

  describe('initialization', () => {
    it('should return stepHandler, clearStepMaps, and syncStepMessage functions', () => {
      const { result } = renderHook(() => useStepHandler(createHookParams()));

      expect(typeof result.current.stepHandler).toBe('function');
      expect(typeof result.current.clearStepMaps).toBe('function');
      expect(typeof result.current.syncStepMessage).toBe('function');
    });
  });

  describe('on_run_step event', () => {
    it('should create response message when not in messageMap', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const setMessagesCall = mockSetMessages.mock.calls[0][0];
      expect(setMessagesCall).toContainEqual(
        expect.objectContaining({ messageId: 'response-msg-1' }),
      );
    });

    it('should warn and return early when no responseMessageId', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep({ runId: '' });
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(consoleSpy).toHaveBeenCalledWith('No message id found in run step event');
      expect(mockSetMessages).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle USE_PRELIM_RESPONSE_MESSAGE_ID by using initialResponse', () => {
      const initialResponse = createResponseMessage({ messageId: 'initial-response-id' });
      mockGetMessages.mockReturnValue([initialResponse]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep({ runId: 'USE_PRELIM_RESPONSE_MESSAGE_ID' });
      const submission = createSubmission({
        initialResponse,
      });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should handle tool call steps and store tool call IDs', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createToolCallRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall.find((m: TMessage) => !m.isCreatedByUser);
      expect(responseMsg?.content).toContainEqual(
        expect.objectContaining({
          type: ContentTypes.TOOL_CALL,
          tool_call: expect.objectContaining({ name: 'test_tool' }),
        }),
      );
    });

    it('should replay buffered deltas after registering step', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const submission = createSubmission();
      const stepId = 'step-buffered';

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: createMessageDelta(stepId, 'Hello') },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();

      const runStep = createRunStep({ id: stepId });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall.find((m: TMessage) => !m.isCreatedByUser);
      expect(responseMsg?.content).toContainEqual(
        expect.objectContaining({ type: ContentTypes.TEXT, text: 'Hello' }),
      );
    });

    it('should ensure userMessage is present in multi-tab scenarios', () => {
      const userMsg = createUserMessage();
      mockGetMessages.mockReturnValue([]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission({ userMessage: userMsg });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const setMessagesCall = mockSetMessages.mock.calls[0][0];
      expect(setMessagesCall).toContainEqual(
        expect.objectContaining({ messageId: userMsg.messageId }),
      );
    });

    it('should propagate step metadata (agentId, groupId) for parallel rendering', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createToolCallRunStep({
        agentId: 'agent-1',
        groupId: 2,
      });
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall.find((m: TMessage) => !m.isCreatedByUser);
      const toolCallContent = responseMsg?.content?.find(
        (c: TMessageContentParts) => c.type === ContentTypes.TOOL_CALL,
      );
      expect(toolCallContent).toMatchObject({
        agentId: 'agent-1',
        groupId: 2,
      });
    });
  });

  describe('on_agent_update event', () => {
    it('should update message with agent update content', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const agentUpdate: Agents.AgentUpdate = {
        type: ContentTypes.AGENT_UPDATE,
        agent_update: {
          runId: 'response-msg-1',
          index: 1,
          agentId: 'agent-1',
        },
      };

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_AGENT_UPDATE, data: agentUpdate },
          submission,
        );
      });

      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should warn when no responseMessageId for agent update', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const agentUpdate: Agents.AgentUpdate = {
        type: ContentTypes.AGENT_UPDATE,
        agent_update: {
          runId: '',
          index: 0,
          agentId: 'agent-1',
        },
      };
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_AGENT_UPDATE, data: agentUpdate },
          submission,
        );
      });

      expect(consoleSpy).toHaveBeenCalledWith('No message id found in agent update event');
      consoleSpy.mockRestore();
    });
  });

  describe('on_message_delta event', () => {
    it('should append text delta to existing content', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const messageDelta = createMessageDelta('step-1', 'Hello');

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: messageDelta },
          submission,
        );
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall[lastCall.length - 1];
      expect(responseMsg.content).toContainEqual(
        expect.objectContaining({ type: ContentTypes.TEXT, text: 'Hello' }),
      );
    });

    it('should buffer delta when step does not exist', () => {
      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const messageDelta = createMessageDelta('nonexistent-step', 'Buffered');
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: messageDelta },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();
    });

    it('should concatenate multiple text deltas', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: createMessageDelta('step-1', 'Hello ') },
          submission,
        );
      });

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: createMessageDelta('step-1', 'World') },
          submission,
        );
      });

      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall[lastCall.length - 1];
      expect(responseMsg.content).toContainEqual(
        expect.objectContaining({ type: ContentTypes.TEXT, text: 'Hello World' }),
      );
    });

    it('should return early when contentPart is null', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const messageDelta: Agents.MessageDeltaEvent = {
        id: 'step-1',
        delta: { content: [] },
      };

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: messageDelta },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();
    });
  });

  describe('on_reasoning_delta event', () => {
    it('should append reasoning delta to existing content', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const reasoningDelta = createReasoningDelta('step-1', 'Thinking...');

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_REASONING_DELTA, data: reasoningDelta },
          submission,
        );
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall[lastCall.length - 1];
      expect(responseMsg.content).toContainEqual(
        expect.objectContaining({ type: ContentTypes.THINK, think: 'Thinking...' }),
      );
    });

    it('should buffer reasoning delta when step does not exist', () => {
      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const reasoningDelta = createReasoningDelta('nonexistent-step', 'Buffered');
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_REASONING_DELTA, data: reasoningDelta },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();
    });

    it('should concatenate multiple reasoning deltas', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_REASONING_DELTA, data: createReasoningDelta('step-1', 'First ') },
          submission,
        );
      });

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_REASONING_DELTA, data: createReasoningDelta('step-1', 'thought') },
          submission,
        );
      });

      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall[lastCall.length - 1];
      expect(responseMsg.content).toContainEqual(
        expect.objectContaining({ type: ContentTypes.THINK, think: 'First thought' }),
      );
    });
  });

  describe('on_run_step_delta event', () => {
    it('should update tool call with delta args', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createToolCallRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const runStepDelta: Agents.RunStepDeltaEvent = {
        id: 'step-tool-1',
        delta: {
          type: StepTypes.TOOL_CALLS,
          tool_calls: [{ name: 'test_tool', args: '{"key": "value"}' }],
        },
      };

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_RUN_STEP_DELTA, data: runStepDelta },
          submission,
        );
      });

      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should buffer run step delta when step does not exist', () => {
      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStepDelta: Agents.RunStepDeltaEvent = {
        id: 'nonexistent-step',
        delta: {
          type: StepTypes.TOOL_CALLS,
          tool_calls: [{ name: 'test_tool', args: '{}' }],
        },
      };
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_RUN_STEP_DELTA, data: runStepDelta },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();
    });

    it('should handle auth information in run step delta', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createToolCallRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const runStepDelta: Agents.RunStepDeltaEvent = {
        id: 'step-tool-1',
        delta: {
          type: StepTypes.TOOL_CALLS,
          tool_calls: [{ name: 'test_tool', args: '{}' }],
          auth: 'oauth-token-123',
          expires_at: 1704067200,
        },
      };

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_RUN_STEP_DELTA, data: runStepDelta },
          submission,
        );
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall.find((m: TMessage) => !m.isCreatedByUser);
      const toolCallContent = responseMsg?.content?.find(
        (c: TMessageContentParts) => c.type === ContentTypes.TOOL_CALL,
      );
      expect(toolCallContent?.tool_call?.auth).toEqual('oauth-token-123');
    });
  });

  describe('on_run_step_completed event', () => {
    it('should finalize tool call with output', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createToolCallRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const completedEvent = {
        result: {
          id: 'step-tool-1',
          index: 0,
          tool_call: {
            id: 'tool-call-1',
            name: 'test_tool',
            args: '{}',
            output: 'Tool result output',
            type: ToolCallTypes.TOOL_CALL,
          },
        },
      };

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_RUN_STEP_COMPLETED,
            data: completedEvent as { result: Agents.ToolEndEvent },
          },
          submission,
        );
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall.find((m: TMessage) => !m.isCreatedByUser);
      const toolCallContent = responseMsg?.content?.find(
        (c: TMessageContentParts) => c.type === ContentTypes.TOOL_CALL,
      );
      expect(toolCallContent?.tool_call?.output).toBe('Tool result output');
      expect(toolCallContent?.tool_call?.progress).toBe(1);
    });

    it('should warn when step not found for completed event', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const completedEvent = {
        result: {
          id: 'nonexistent-step',
          index: 0,
          tool_call: {
            id: 'tool-call-1',
            name: 'test_tool',
            args: '{}',
            type: ToolCallTypes.TOOL_CALL,
          },
        },
      };
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_RUN_STEP_COMPLETED,
            data: completedEvent as { result: Agents.ToolEndEvent },
          },
          submission,
        );
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'No run step or runId found for completed tool call event',
      );
      consoleSpy.mockRestore();
    });
  });

  describe('clearStepMaps', () => {
    it('should clear all internal maps', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      act(() => {
        result.current.clearStepMaps();
      });

      mockSetMessages.mockClear();

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: createMessageDelta('step-1', 'Test') },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();
    });
  });

  describe('syncStepMessage', () => {
    it('should sync message into messageMap', () => {
      const responseMessage = createResponseMessage({
        content: [{ type: ContentTypes.TEXT, text: 'Synced content' }],
      });
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      act(() => {
        result.current.syncStepMessage(responseMessage);
      });

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: createMessageDelta('step-1', ' more') },
          submission,
        );
      });

      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall[lastCall.length - 1];
      expect(responseMsg.content).toContainEqual(
        expect.objectContaining({ type: ContentTypes.TEXT, text: 'Synced content more' }),
      );
    });

    it('should handle null message gracefully', () => {
      const { result } = renderHook(() => useStepHandler(createHookParams()));

      expect(() => {
        act(() => {
          result.current.syncStepMessage(null as unknown as TMessage);
        });
      }).not.toThrow();
    });

    it('should handle message without messageId gracefully', () => {
      const { result } = renderHook(() => useStepHandler(createHookParams()));

      expect(() => {
        act(() => {
          result.current.syncStepMessage({ ...createResponseMessage(), messageId: '' });
        });
      }).not.toThrow();
    });
  });

  describe('announcePolite for accessibility', () => {
    it('should announce composing after MESSAGE_UPDATE_INTERVAL', () => {
      const MESSAGE_UPDATE_INTERVAL = 7000;
      mockLastAnnouncementTimeRef.current = Date.now() - MESSAGE_UPDATE_INTERVAL - 1;

      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockAnnouncePolite).toHaveBeenCalledWith({ message: 'composing', isStatus: true });
    });

    it('should not announce if within MESSAGE_UPDATE_INTERVAL', () => {
      mockLastAnnouncementTimeRef.current = Date.now();

      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockAnnouncePolite).not.toHaveBeenCalled();
    });
  });

  describe('edited content scenarios', () => {
    it('should use initialResponse content for index offsetting in edit scenarios', () => {
      const existingContent: TMessageContentParts[] = [
        { type: ContentTypes.TEXT, text: 'Previous content' },
      ];
      const initialResponse = createResponseMessage({
        messageId: 'initial-response-id',
        content: existingContent,
      });
      mockGetMessages.mockReturnValue([initialResponse]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep({
        runId: 'initial-response-id',
        index: 0,
      });
      const submission = createSubmission({
        editedContent: { index: 0, type: ContentTypes.TEXT, text: 'Previous content' },
        initialResponse,
      });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
    });
  });

  describe('delta buffering and replay', () => {
    it('should buffer multiple deltas and replay in order', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const submission = createSubmission();
      const stepId = 'step-multi-buffer';

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: createMessageDelta(stepId, 'First ') },
          submission,
        );
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: createMessageDelta(stepId, 'Second ') },
          submission,
        );
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: createMessageDelta(stepId, 'Third') },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();

      const runStep = createRunStep({ id: stepId });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall.find((m: TMessage) => !m.isCreatedByUser);
      expect(responseMsg?.content).toContainEqual(
        expect.objectContaining({ type: ContentTypes.TEXT, text: 'First Second Third' }),
      );
    });

    it('should buffer mixed delta types and replay correctly', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const submission = createSubmission();
      const stepId = 'step-mixed-buffer';

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_REASONING_DELTA,
            data: createReasoningDelta(stepId, 'Thinking...'),
          },
          submission,
        );
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: createMessageDelta(stepId, 'Response') },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();

      const runStep = createRunStep({ id: stepId });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
    });
  });

  describe('content type mismatch handling', () => {
    it('should warn on content type mismatch and not overwrite', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const responseMessage = createResponseMessage({
        content: [{ type: ContentTypes.THINK, think: 'Existing thought' }],
      });
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      act(() => {
        result.current.syncStepMessage(responseMessage);
      });

      const runStep = createRunStep({ index: 0 });
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      const textDelta: Agents.MessageDeltaEvent = {
        id: 'step-1',
        delta: { content: [{ type: ContentTypes.TEXT, text: 'New text' }] },
      };

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: textDelta },
          submission,
        );
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Content type mismatch',
        expect.objectContaining({
          existingType: ContentTypes.THINK,
          contentType: ContentTypes.TEXT,
        }),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('summarization events', () => {
    it('ON_SUMMARIZE_START calls announcePolite', () => {
      mockLastAnnouncementTimeRef.current = Date.now();
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_START,
            data: {
              agentId: 'agent-1',
              provider: 'test-provider',
              model: 'test-model',
              messagesToRefineCount: 5,
              summaryVersion: 1,
            },
          },
          submission,
        );
      });

      expect(mockAnnouncePolite).toHaveBeenCalledWith({
        message: 'summarize_started',
        isStatus: true,
      });
    });

    it('ON_SUMMARIZE_DELTA accumulates content on known run step', async () => {
      mockLastAnnouncementTimeRef.current = Date.now();
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));
      const submission = createSubmission();

      const runStep = createRunStep({
        summary: {
          type: ContentTypes.SUMMARY,
          model: 'test-model',
          provider: 'test-provider',
        } as TMessageContentParts & { type: typeof ContentTypes.SUMMARY },
      });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_DELTA,
            data: {
              id: 'step-1',
              delta: {
                summary: {
                  type: ContentTypes.SUMMARY,
                  content: [{ type: ContentTypes.TEXT, text: 'chunk1' }],
                  provider: 'test-provider',
                  model: 'test-model',
                  summarizing: true,
                },
              },
            },
          },
          submission,
        );
      });

      await act(async () => {
        await new Promise((r) => requestAnimationFrame(r));
      });

      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall[lastCall.length - 1];
      const summaryPart = responseMsg.content?.find(
        (c: TMessageContentParts) => c.type === ContentTypes.SUMMARY,
      );
      expect(summaryPart).toBeDefined();
      expect(summaryPart.content).toContainEqual(
        expect.objectContaining({ type: ContentTypes.TEXT, text: 'chunk1' }),
      );
    });

    it('ON_SUMMARIZE_DELTA buffers when run step is not yet known', () => {
      mockLastAnnouncementTimeRef.current = Date.now();
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_DELTA,
            data: {
              id: 'step-1',
              delta: {
                summary: {
                  type: ContentTypes.SUMMARY,
                  content: [{ type: ContentTypes.TEXT, text: 'buffered chunk' }],
                  provider: 'test-provider',
                  model: 'test-model',
                  summarizing: true,
                },
              },
            },
          },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();
    });

    it('ON_SUMMARIZE_COMPLETE success replaces summarizing part with finalized summary', () => {
      mockLastAnnouncementTimeRef.current = Date.now();
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));
      const submission = createSubmission();

      const runStep = createRunStep({
        summary: {
          type: ContentTypes.SUMMARY,
          model: 'test-model',
          provider: 'test-provider',
        } as TMessageContentParts & { type: typeof ContentTypes.SUMMARY },
      });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_DELTA,
            data: {
              id: 'step-1',
              delta: {
                summary: {
                  type: ContentTypes.SUMMARY,
                  content: [{ type: ContentTypes.TEXT, text: 'partial' }],
                  provider: 'test-provider',
                  model: 'test-model',
                  summarizing: true,
                },
              },
            },
          },
          submission,
        );
      });

      mockSetMessages.mockClear();
      mockAnnouncePolite.mockClear();

      const lastSetCall = mockGetMessages.mock.results[mockGetMessages.mock.results.length - 1];
      const latestMessages = lastSetCall?.value ?? [];
      mockGetMessages.mockReturnValue(
        latestMessages.length > 0 ? latestMessages : [responseMessage],
      );

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_COMPLETE,
            data: {
              id: 'step-1',
              agentId: 'agent-1',
              summary: {
                type: ContentTypes.SUMMARY,
                content: [{ type: ContentTypes.TEXT, text: 'Final summary' }],
                tokenCount: 100,
                summarizing: false,
              },
            },
          },
          submission,
        );
      });

      expect(mockAnnouncePolite).toHaveBeenCalledWith({
        message: 'summarize_completed',
        isStatus: true,
      });
      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall.find((m: TMessage) => m.messageId === 'response-msg-1');
      const summaryPart = responseMsg?.content?.find(
        (c: TMessageContentParts) => c.type === ContentTypes.SUMMARY,
      );
      expect(summaryPart).toMatchObject({ summarizing: false });
    });

    it('ON_SUMMARIZE_COMPLETE error removes summarizing parts', () => {
      mockLastAnnouncementTimeRef.current = Date.now();
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));
      const submission = createSubmission();

      const runStep = createRunStep({
        summary: {
          type: ContentTypes.SUMMARY,
          model: 'test-model',
          provider: 'test-provider',
        } as TMessageContentParts & { type: typeof ContentTypes.SUMMARY },
      });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_DELTA,
            data: {
              id: 'step-1',
              delta: {
                summary: {
                  type: ContentTypes.SUMMARY,
                  content: [{ type: ContentTypes.TEXT, text: 'partial' }],
                  provider: 'test-provider',
                  model: 'test-model',
                  summarizing: true,
                },
              },
            },
          },
          submission,
        );
      });

      mockSetMessages.mockClear();
      mockAnnouncePolite.mockClear();

      const lastSetCall = mockGetMessages.mock.results[mockGetMessages.mock.results.length - 1];
      const latestMessages = lastSetCall?.value ?? [];
      mockGetMessages.mockReturnValue(
        latestMessages.length > 0 ? latestMessages : [responseMessage],
      );

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_COMPLETE,
            data: {
              id: 'step-1',
              agentId: 'agent-1',
              error: 'LLM failed',
            },
          },
          submission,
        );
      });

      expect(mockAnnouncePolite).toHaveBeenCalledWith({
        message: 'summarize_failed',
        isStatus: true,
      });
      expect(mockSetMessages).toHaveBeenCalled();
      const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1][0];
      const responseMsg = lastCall.find((m: TMessage) => m.messageId === 'response-msg-1');
      const summaryParts =
        responseMsg?.content?.filter(
          (c: TMessageContentParts) => c.type === ContentTypes.SUMMARY,
        ) ?? [];
      expect(summaryParts).toHaveLength(0);
    });

    it('ON_SUMMARIZE_COMPLETE returns early when target message not in messageMap', () => {
      mockLastAnnouncementTimeRef.current = Date.now();
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_COMPLETE,
            data: {
              id: 'step-1',
              agentId: 'agent-1',
              summary: {
                type: ContentTypes.SUMMARY,
                content: [{ type: ContentTypes.TEXT, text: 'Final summary' }],
                tokenCount: 100,
                summarizing: false,
              },
            },
          },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();
      expect(mockAnnouncePolite).not.toHaveBeenCalled();
    });

    it('ON_SUMMARIZE_COMPLETE with undefined summary finalizes existing part with summarizing=false', () => {
      mockLastAnnouncementTimeRef.current = Date.now();
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));
      const submission = createSubmission();

      const runStep = createRunStep({
        summary: {
          type: ContentTypes.SUMMARY,
          model: 'test-model',
          provider: 'test-provider',
        } as TMessageContentParts & { type: typeof ContentTypes.SUMMARY },
      });

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_DELTA,
            data: {
              id: 'step-1',
              delta: {
                summary: {
                  type: ContentTypes.SUMMARY,
                  content: [{ type: ContentTypes.TEXT, text: 'partial' }],
                  provider: 'test-provider',
                  model: 'test-model',
                  summarizing: true,
                },
              },
            },
          },
          submission,
        );
      });

      mockSetMessages.mockClear();
      mockAnnouncePolite.mockClear();

      const lastSetCall = mockGetMessages.mock.results[mockGetMessages.mock.results.length - 1];
      const latestMessages = lastSetCall?.value ?? [];
      mockGetMessages.mockReturnValue(
        latestMessages.length > 0 ? latestMessages : [responseMessage],
      );

      act(() => {
        result.current.stepHandler(
          {
            event: StepEvents.ON_SUMMARIZE_COMPLETE,
            data: {
              id: 'step-1',
              agentId: 'agent-1',
            },
          },
          submission,
        );
      });

      expect(mockAnnouncePolite).toHaveBeenCalledWith({
        message: 'summarize_completed',
        isStatus: true,
      });
      expect(mockSetMessages).toHaveBeenCalledTimes(1);
      const updatedMessages = mockSetMessages.mock.calls[0][0] as TMessage[];
      const summaryPart = updatedMessages[0]?.content?.find(
        (p: TMessageContentParts) => p?.type === ContentTypes.SUMMARY,
      ) as SummaryContentPart | undefined;
      expect(summaryPart?.summarizing).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages array', () => {
      mockGetMessages.mockReturnValue([]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should handle undefined messages from getMessages', () => {
      mockGetMessages.mockReturnValue(undefined);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should handle delta with array content', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      const messageDelta: Agents.MessageDeltaEvent = {
        id: 'step-1',
        delta: {
          content: [
            { type: ContentTypes.TEXT, text: 'First' },
            { type: ContentTypes.TEXT, text: 'Second' },
          ],
        },
      };

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: messageDelta },
          submission,
        );
      });

      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should handle message delta without content', () => {
      const responseMessage = createResponseMessage();
      mockGetMessages.mockReturnValue([responseMessage]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const messageDelta: Agents.MessageDeltaEvent = {
        id: 'step-1',
        delta: {},
      };

      act(() => {
        result.current.stepHandler(
          { event: StepEvents.ON_MESSAGE_DELTA, data: messageDelta },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();
    });
  });

  describe('on_subagent_update event', () => {
    /**
     * These tests exercise the real Recoil `atomFamily` via a `RecoilRoot`
     * wrapper and a `useRecoilCallback`-powered reader mounted alongside
     * the hook under test. No mocks of the store module — only the same
     * `setMessages`/`getMessages` spies the rest of this file uses.
     */
    const renderStepHandlerWithReader = (): {
      result: ReturnType<typeof renderHook>['result'];
      getProgress: (toolCallId: string) => unknown;
    } => {
      /** Composite hook: the step handler under test + a `useRecoilCallback`
       *  reader that shares the same `RecoilRoot` store. Reading via a
       *  top-level `snapshot_UNSTABLE()` returns a different root, so the
       *  writes done by the step handler wouldn't be visible. */
      const hookResult = renderHook(
        () => {
          const stepHandler = useStepHandler(createHookParams());
          const read = useRecoilCallback(
            ({ snapshot }) =>
              (toolCallId: string): unknown =>
                snapshot.getLoadable(subagentProgressByToolCallId(toolCallId)).valueOrThrow(),
            [],
          );
          return { ...stepHandler, read };
        },
        { wrapper: RecoilRoot },
      );

      const getProgress = (toolCallId: string): unknown =>
        (hookResult.result.current as any).read(toolCallId);
      return { result: hookResult.result, getProgress };
    };

    const buildSubagentToolCallPart = (toolCallId: string): TMessageContentParts =>
      ({
        type: ContentTypes.TOOL_CALL,
        [ContentTypes.TOOL_CALL]: {
          id: toolCallId,
          name: Constants.SUBAGENT,
          args: '{}',
          type: ToolCallTypes.TOOL_CALL,
          progress: 0.1,
        },
      }) as unknown as TMessageContentParts;

    /**
     * Directly seed the hook's internal `messageMap` with a response message
     * whose content contains one or more `subagent` tool calls. Uses the
     * real `syncStepMessage` export so we exercise the same code path the
     * SSE pipeline uses for reconnects — no mocks, no patched internals.
     */
    const seedResponseWithSubagentToolCalls = (
      result: ReturnType<typeof renderHook>['result'],
      toolCallIds: string[],
    ): { response: TMessage; submission: EventSubmission } => {
      const response: TMessage = {
        ...createResponseMessage(),
        content: toolCallIds.map(buildSubagentToolCallPart),
      };
      mockGetMessages.mockReturnValue([response]);
      const submission = createSubmission({
        initialResponse: createResponseMessage({
          messageId: 'initial-response-id',
        }),
      });
      act(() => {
        (result.current as any).syncStepMessage(response);
      });
      return { response, submission };
    };

    const makeUpdate = (overrides: Partial<SubagentUpdateEvent> = {}): SubagentUpdateEvent => ({
      runId: 'parent-run',
      subagentRunId: 'child-run-1',
      subagentType: 'self',
      subagentAgentId: 'child-1',
      parentAgentId: 'parent',
      phase: 'start',
      label: 'Subagent "self" started',
      timestamp: new Date().toISOString(),
      ...overrides,
    });

    it('correlates updates to a tool call via parentToolCallId (deterministic path)', () => {
      const { result, getProgress } = renderStepHandlerWithReader();
      const { submission } = seedResponseWithSubagentToolCalls(result, ['call_A']);

      const start = makeUpdate({ parentToolCallId: 'call_A', phase: 'start' });
      const step = makeUpdate({
        parentToolCallId: 'call_A',
        phase: 'run_step',
        label: 'Using tool: calculator',
      });
      const stop = makeUpdate({
        parentToolCallId: 'call_A',
        phase: 'stop',
        label: 'Subagent "self" finished',
      });

      act(() => {
        (result.current as any).stepHandler(
          { event: StepEvents.ON_SUBAGENT_UPDATE, data: start },
          submission,
        );

        (result.current as any).stepHandler(
          { event: StepEvents.ON_SUBAGENT_UPDATE, data: step },
          submission,
        );

        (result.current as any).stepHandler(
          { event: StepEvents.ON_SUBAGENT_UPDATE, data: stop },
          submission,
        );
      });

      const bucket = getProgress('call_A') as {
        events: SubagentUpdateEvent[];
        status: string;
        latestLabel?: string;
        subagentType: string;
      };
      expect(bucket.events).toHaveLength(3);
      expect(bucket.status).toBe('stop');
      expect(bucket.latestLabel).toBe('Subagent "self" finished');
      expect(bucket.subagentType).toBe('self');
    });

    it('falls back to oldest-unclaimed tool call when parentToolCallId is absent', () => {
      const { result, getProgress } = renderStepHandlerWithReader();
      /** Two subagent tool calls seeded in creation order. Without
       *  `parentToolCallId`, forward iteration must claim `call_old` for
       *  the first start and `call_new` for the second. */
      const { submission } = seedResponseWithSubagentToolCalls(result, ['call_old', 'call_new']);

      const updateOld = makeUpdate({
        subagentRunId: 'run-1',
        phase: 'start',
        label: 'first',
      });
      const updateNew = makeUpdate({
        subagentRunId: 'run-2',
        phase: 'start',
        label: 'second',
      });

      act(() => {
        (result.current as any).stepHandler(
          { event: StepEvents.ON_SUBAGENT_UPDATE, data: updateOld },
          submission,
        );

        (result.current as any).stepHandler(
          { event: StepEvents.ON_SUBAGENT_UPDATE, data: updateNew },
          submission,
        );
      });

      const first = getProgress('call_old') as { latestLabel?: string };
      const second = getProgress('call_new') as { latestLabel?: string };
      expect(first.latestLabel).toBe('first');
      expect(second.latestLabel).toBe('second');
    });

    it('buffers early-arriving updates and replays once a tool call is claimable', () => {
      const { result, getProgress } = renderStepHandlerWithReader();
      const submission = createSubmission({
        initialResponse: createResponseMessage({
          messageId: 'initial-response-id',
        }),
      });
      /** Deliberately: no `mockGetMessages.mockReturnValue([response])`
       *  and no ON_RUN_STEP yet, so the tool call isn't visible. The
       *  first envelope must be buffered. */
      mockGetMessages.mockReturnValue([]);

      const earlyUpdate = makeUpdate({
        phase: 'start',
        label: 'arrives first',
      });
      const laterUpdate = makeUpdate({
        phase: 'run_step',
        label: 'arrives after correlation',
      });

      act(() => {
        (result.current as any).stepHandler(
          { event: StepEvents.ON_SUBAGENT_UPDATE, data: earlyUpdate },
          submission,
        );
      });

      /** Now the tool call appears. Subsequent update can claim and drain. */
      const responseWithToolCall: TMessage = {
        ...createResponseMessage(),
        content: [buildSubagentToolCallPart('call_late')],
      };
      mockGetMessages.mockReturnValue([responseWithToolCall]);
      act(() => {
        (result.current as any).syncStepMessage(responseWithToolCall);
      });

      act(() => {
        (result.current as any).stepHandler(
          {
            event: StepEvents.ON_SUBAGENT_UPDATE,
            data: { ...laterUpdate, parentToolCallId: 'call_late' },
          },
          submission,
        );
      });

      const bucket = getProgress('call_late') as {
        events: SubagentUpdateEvent[];
        status: string;
      };
      /** Both the buffered `start` and the current `run_step` must end up
       *  in the atom in the correct order. */
      expect(bucket.events.map((e) => e.label)).toEqual([
        'arrives first',
        'arrives after correlation',
      ]);
      expect(bucket.status).toBe('run_step');
    });

    it('caps the per-subagent events array at 200 entries', () => {
      const { result, getProgress } = renderStepHandlerWithReader();
      const { submission } = seedResponseWithSubagentToolCalls(result, ['call_cap']);

      act(() => {
        for (let i = 0; i < 205; i++) {
          (result.current as any).stepHandler(
            {
              event: StepEvents.ON_SUBAGENT_UPDATE,
              data: makeUpdate({
                parentToolCallId: 'call_cap',
                phase: 'run_step_delta',
                label: `delta-${i}`,
              }),
            },
            submission,
          );
        }
      });

      const bucket = getProgress('call_cap') as {
        events: SubagentUpdateEvent[];
      };
      expect(bucket.events).toHaveLength(200);
      /** Oldest entries should be dropped — first retained label is from delta-5. */
      expect(bucket.events[0].label).toBe('delta-5');
      expect(bucket.events[bucket.events.length - 1].label).toBe('delta-204');
    });

    it('clearStepMaps resets tracked subagent atoms back to their default', () => {
      const { result, getProgress } = renderStepHandlerWithReader();
      const { submission } = seedResponseWithSubagentToolCalls(result, ['call_reset']);

      act(() => {
        (result.current as any).stepHandler(
          {
            event: StepEvents.ON_SUBAGENT_UPDATE,
            data: makeUpdate({
              parentToolCallId: 'call_reset',
              phase: 'stop',
            }),
          },
          submission,
        );
      });

      expect(getProgress('call_reset')).not.toBeNull();

      act(() => {
        (result.current as any).clearStepMaps();
      });

      /** After clear the atom is back to the default (null). If the reset
       *  was skipped, this would still hold the final envelope and leak. */
      expect(getProgress('call_reset')).toBeNull();
    });
  });
});
