import { renderHook, act } from '@testing-library/react';
import { StepTypes, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  EventSubmission,
  TEndpointOption,
  TConversation,
  TMessage,
  Agents,
} from 'librechat-data-provider';
import useStepHandler from '~/hooks/SSE/useStepHandler';

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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
          { event: 'on_message_delta', data: createMessageDelta(stepId, 'Hello') },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();

      const runStep = createRunStep({ id: stepId });

      act(() => {
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_agent_update', data: agentUpdate }, submission);
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
        result.current.stepHandler({ event: 'on_agent_update', data: agentUpdate }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const messageDelta = createMessageDelta('step-1', 'Hello');

      act(() => {
        result.current.stepHandler({ event: 'on_message_delta', data: messageDelta }, submission);
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
        result.current.stepHandler({ event: 'on_message_delta', data: messageDelta }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      act(() => {
        result.current.stepHandler(
          { event: 'on_message_delta', data: createMessageDelta('step-1', 'Hello ') },
          submission,
        );
      });

      act(() => {
        result.current.stepHandler(
          { event: 'on_message_delta', data: createMessageDelta('step-1', 'World') },
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const messageDelta: Agents.MessageDeltaEvent = {
        id: 'step-1',
        delta: { content: [] },
      };

      act(() => {
        result.current.stepHandler({ event: 'on_message_delta', data: messageDelta }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const reasoningDelta = createReasoningDelta('step-1', 'Thinking...');

      act(() => {
        result.current.stepHandler(
          { event: 'on_reasoning_delta', data: reasoningDelta },
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
          { event: 'on_reasoning_delta', data: reasoningDelta },
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      act(() => {
        result.current.stepHandler(
          { event: 'on_reasoning_delta', data: createReasoningDelta('step-1', 'First ') },
          submission,
        );
      });

      act(() => {
        result.current.stepHandler(
          { event: 'on_reasoning_delta', data: createReasoningDelta('step-1', 'thought') },
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step_delta', data: runStepDelta }, submission);
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
        result.current.stepHandler({ event: 'on_run_step_delta', data: runStepDelta }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step_delta', data: runStepDelta }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
            event: 'on_run_step_completed',
            data: completedEvent as unknown as Agents.ToolEndEvent,
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
            event: 'on_run_step_completed',
            data: completedEvent as unknown as Agents.ToolEndEvent,
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      act(() => {
        result.current.clearStepMaps();
      });

      mockSetMessages.mockClear();

      act(() => {
        result.current.stepHandler(
          { event: 'on_message_delta', data: createMessageDelta('step-1', 'Test') },
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      act(() => {
        result.current.stepHandler(
          { event: 'on_message_delta', data: createMessageDelta('step-1', ' more') },
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
          { event: 'on_message_delta', data: createMessageDelta(stepId, 'First ') },
          submission,
        );
        result.current.stepHandler(
          { event: 'on_message_delta', data: createMessageDelta(stepId, 'Second ') },
          submission,
        );
        result.current.stepHandler(
          { event: 'on_message_delta', data: createMessageDelta(stepId, 'Third') },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();

      const runStep = createRunStep({ id: stepId });

      act(() => {
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
          { event: 'on_reasoning_delta', data: createReasoningDelta(stepId, 'Thinking...') },
          submission,
        );
        result.current.stepHandler(
          { event: 'on_message_delta', data: createMessageDelta(stepId, 'Response') },
          submission,
        );
      });

      expect(mockSetMessages).not.toHaveBeenCalled();

      const runStep = createRunStep({ id: stepId });

      act(() => {
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      const textDelta: Agents.MessageDeltaEvent = {
        id: 'step-1',
        delta: { content: [{ type: ContentTypes.TEXT, text: 'New text' }] },
      };

      act(() => {
        result.current.stepHandler({ event: 'on_message_delta', data: textDelta }, submission);
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

  describe('edge cases', () => {
    it('should handle empty messages array', () => {
      mockGetMessages.mockReturnValue([]);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should handle undefined messages from getMessages', () => {
      mockGetMessages.mockReturnValue(undefined);

      const { result } = renderHook(() => useStepHandler(createHookParams()));

      const runStep = createRunStep();
      const submission = createSubmission();

      act(() => {
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
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
        result.current.stepHandler({ event: 'on_message_delta', data: messageDelta }, submission);
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
        result.current.stepHandler({ event: 'on_run_step', data: runStep }, submission);
      });

      mockSetMessages.mockClear();

      const messageDelta: Agents.MessageDeltaEvent = {
        id: 'step-1',
        delta: {},
      };

      act(() => {
        result.current.stepHandler({ event: 'on_message_delta', data: messageDelta }, submission);
      });

      expect(mockSetMessages).not.toHaveBeenCalled();
    });
  });
});
