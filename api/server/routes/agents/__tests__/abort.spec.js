/**
 * Tests for the agent abort endpoint
 *
 * Tests the following fixes from PR #11462:
 * 1. Authorization check - only job owner can abort
 * 2. Early abort handling - skip save when no responseMessageId
 * 3. Partial response saving - save message before returning
 */

const express = require('express');
const request = require('supertest');

const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockGenerationJobManager = {
  // Owner-side finalization fence: the controller registers before its terminal
  // CAS whenever post-terminal title work is possible, so the facade mock must
  // mirror it or the turn stalls on an undefined call.
  registerUserFinalization: jest.fn(async () => undefined),
  clearUserFinalization: jest.fn(async () => undefined),
  countUserFinalizations: jest.fn(async () => 0),
  getJob: jest.fn(),
  abortJob: jest.fn(),
  resignalAbort: jest.fn(async () => ({ delivered: false, published: true })),
  getActiveJobIdsForUser: jest.fn(),
};

const mockSaveMessage = jest.fn();
const mockDeleteAgentCheckpoint = jest.fn(async () => undefined);
const mockRecordScheduleOutcome = jest.fn(async () => true);
const mockClearScheduledJob = jest.fn(async () => undefined);
// 'stamped' by default: the stamp is load-bearing, and a 'failed' result makes the
// route refuse the abort with a 503 before abortJob ever runs.
const mockRequestScheduledRunAbort = jest.fn(async () => 'stamped');
const mockMarkScheduledRunAbortPersisted = jest.fn(async () => undefined);
const mockCaptureCheckpointGeneration = jest.fn(async (threadId) => ({
  threadId,
  checkpointIds: ['ck-1'],
}));

jest.mock('~/server/services/Schedules', () => ({
  recordScheduleOutcome: (...args) => mockRecordScheduleOutcome(...args),
  clearScheduledJob: (...args) => mockClearScheduledJob(...args),
  // Omitting this made the handler throw before abortJob, so the assertions below
  // "passed" on a route that never ran.
  requestScheduledRunAbort: (...args) => mockRequestScheduledRunAbort(...args),
  markScheduledRunAbortPersisted: (...args) => mockMarkScheduledRunAbortPersisted(...args),
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isEnabled: jest.fn().mockReturnValue(false),
  GenerationJobManager: mockGenerationJobManager,
  deleteAgentCheckpoint: (...args) => mockDeleteAgentCheckpoint(...args),
  captureAgentCheckpointGeneration: (...args) => mockCaptureCheckpointGeneration(...args),
}));

jest.mock('~/models', () => ({
  saveMessage: (...args) => mockSaveMessage(...args),
  // The schedules service validates its deps at construction; these suites load it
  // transitively, so the mock must supply the account-deletion barrier probe.
  isUserDeleting: jest.fn(async () => false),
}));

jest.mock('~/server/middleware', () => ({
  uaParser: (req, res, next) => next(),
  checkBan: (req, res, next) => next(),
  requireJwtAuth: (req, res, next) => {
    req.user = { id: 'test-user-123' };
    next();
  },
  moderateText: (req, res, next) => next(),
  messageIpLimiter: (req, res, next) => next(),
  configMiddleware: (req, res, next) => next(),
  messageUserLimiter: (req, res, next) => next(),
}));

// Mock the chat module - needs to be a router
jest.mock('~/server/routes/agents/chat', () => require('express').Router());

// Mock the v1 module - v1 is directly used as middleware
jest.mock('~/server/routes/agents/v1', () => ({
  v1: require('express').Router(),
}));

// Import after mocks
const agentRoutes = require('~/server/routes/agents/index');
const { isUnpersistedPreliminaryParent } = require('@librechat/api');

describe('Agent Abort Endpoint', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/agents', agentRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerationJobManager.getJob.mockReset();
    mockGenerationJobManager.abortJob.mockReset();
    mockGenerationJobManager.getActiveJobIdsForUser.mockReset();
    mockSaveMessage.mockReset();
    mockSaveMessage.mockImplementation(async (_context, message) => message);
    mockRecordScheduleOutcome.mockReset();
    mockRecordScheduleOutcome.mockResolvedValue(true);
    // Re-arm after reset: the route chains `.catch` on this call, so a bare reset
    // (implementation wiped, returns undefined) makes every test that reaches the
    // paused-run settle throw a silent 500 after its earlier assertions passed.
    mockClearScheduledJob.mockReset();
    mockClearScheduledJob.mockResolvedValue(undefined);
    // Reset + re-arm so a test's persistent rejection cannot leak forward.
    mockMarkScheduledRunAbortPersisted.mockReset();
    mockMarkScheduledRunAbortPersisted.mockResolvedValue(undefined);
  });

  describe('POST /chat/abort', () => {
    describe('Authorization', () => {
      it("should return 403 when user tries to abort another user's job", async () => {
        const jobStreamId = 'test-stream-123';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'other-user-456' },
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Unauthorized', generationProtocolVersion: 1 });
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Unauthorized abort attempt'),
        );
        expect(mockGenerationJobManager.abortJob).not.toHaveBeenCalled();
      });

      it('should allow abort when user owns the job', async () => {
        const jobStreamId = 'test-stream-123';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });

        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          jobData: null,
          content: [],
          text: '',
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          aborted: jobStreamId,
          generationProtocolVersion: 1,
        });
        expect(response.headers['x-librechat-generation-protocol']).toBe('1');
        expect(mockGenerationJobManager.abortJob).toHaveBeenCalledWith(
          jobStreamId,
          expect.objectContaining({ transformAbortContent: expect.any(Function) }),
        );
      });

      it('should fail closed when job has no userId metadata', async () => {
        const jobStreamId = 'test-stream-123';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: {},
        });

        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          jobData: null,
          content: [],
          text: '',
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Unauthorized', generationProtocolVersion: 1 });
        expect(mockGenerationJobManager.abortJob).not.toHaveBeenCalled();
      });
    });

    describe('Early Abort Handling', () => {
      it('should skip message saving when responseMessageId is missing (early abort)', async () => {
        const jobStreamId = 'test-stream-123';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123', generationProtocolVersion: 2 },
        });

        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          jobData: {
            userMessage: { messageId: 'user-msg-123' },
            // No responseMessageId - early abort before generation started
            conversationId: jobStreamId,
          },
          content: [],
          text: '',
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .set('X-LibreChat-Generation-Protocol', '2')
          .send({ conversationId: jobStreamId, generationProtocolVersion: 2 });

        expect(response.status).toBe(200);
        expect(mockSaveMessage).not.toHaveBeenCalled();
      });

      it('should skip message saving when userMessage is missing', async () => {
        const jobStreamId = 'test-stream-123';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });

        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          jobData: {
            // No userMessage
            responseMessageId: 'response-msg-123',
            conversationId: jobStreamId,
          },
          content: [],
          text: '',
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        expect(mockSaveMessage).not.toHaveBeenCalled();
      });

      it('should skip message saving when abort content is only an OAuth prompt', async () => {
        const jobStreamId = 'test-stream-123';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });

        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          jobData: {
            userMessage: { messageId: 'user-msg-123' },
            responseMessageId: 'response-msg-456',
            conversationId: jobStreamId,
          },
          content: [
            {
              type: 'tool_call',
              tool_call: {
                type: 'tool_call',
                id: 'oauth-call-1',
                name: 'oauth_mcp_Google-Workspace',
                args: '',
                auth: 'https://auth.example.com/oauth',
              },
            },
          ],
          text: '',
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        expect(mockSaveMessage).not.toHaveBeenCalled();
      });

      it('persists a created empty turn before FINAL so interrupt-and-send clears the parent fence', async () => {
        const jobStreamId = 'test-stream-123';
        const userMessageId = 'user-msg-123';
        const preliminaryResponseId = `${userMessageId}_`;
        const persistedMessages = new Map();

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123', generationProtocolVersion: 2 },
        });

        const abortResult = {
          success: true,
          jobData: {
            createdEventEmitted: true,
            userMessage: {
              messageId: userMessageId,
              parentMessageId: 'older-response',
              conversationId: jobStreamId,
              text: 'Stop before the first model token.',
            },
            responseMessageId: preliminaryResponseId,
            conversationId: jobStreamId,
            endpoint: 'agents',
            sender: 'TestAgent',
            model: 'agent-1',
          },
          content: [],
          text: '',
        };
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          await options.beforePublish(abortResult);
          return abortResult;
        });
        mockSaveMessage.mockImplementation(async (_context, message) => {
          persistedMessages.set(message.messageId, message);
          return message;
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .set('X-LibreChat-Generation-Protocol', '2')
          .send({ conversationId: jobStreamId, generationProtocolVersion: 2 });

        expect(response.status).toBe(200);
        expect(mockSaveMessage).toHaveBeenNthCalledWith(
          1,
          expect.anything(),
          expect.objectContaining({
            messageId: userMessageId,
            conversationId: jobStreamId,
            isCreatedByUser: true,
          }),
          expect.objectContaining({ context: expect.stringContaining('user prerequisite') }),
        );
        expect(mockSaveMessage).toHaveBeenNthCalledWith(
          2,
          expect.anything(),
          expect.objectContaining({
            messageId: preliminaryResponseId,
            parentMessageId: userMessageId,
            conversationId: jobStreamId,
            content: [],
            text: '',
            unfinished: true,
            isCreatedByUser: false,
          }),
          expect.objectContaining({ context: expect.stringContaining('abort endpoint') }),
        );

        /** This is the exact server-side fence hit by the queued submission
         * after the abort FINAL. It must observe the row written above rather
         * than reject the drain solely because the stable id ends in `_`. */
        await expect(
          isUnpersistedPreliminaryParent({
            userId: 'test-user-123',
            conversationId: jobStreamId,
            parentMessageId: preliminaryResponseId,
            getMessages: async (filter) =>
              persistedMessages.has(filter.messageId)
                ? [{ _id: `persisted:${filter.messageId}` }]
                : [],
          }),
        ).resolves.toBe(false);
      });
    });

    describe('Partial Response Saving', () => {
      it('should save partial response when both userMessage and responseMessageId exist', async () => {
        const jobStreamId = 'test-stream-123';
        const userMessageId = 'user-msg-123';
        const responseMessageId = 'response-msg-456';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });

        const abortResult = {
          success: true,
          jobData: {
            userMessage: { messageId: userMessageId },
            responseMessageId,
            conversationId: jobStreamId,
            sender: 'TestAgent',
            endpoint: 'anthropic',
            iconURL: 'https://example.com/spec-icon.png',
            model: 'claude-3',
          },
          content: [{ type: 'text', text: 'Partial response...' }],
          text: 'Partial response...',
        };
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          await options.beforePublish(abortResult);
          return abortResult;
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        expect(mockSaveMessage).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            messageId: responseMessageId,
            parentMessageId: userMessageId,
            conversationId: jobStreamId,
            content: [{ type: 'text', text: 'Partial response...' }],
            text: 'Partial response...',
            sender: 'TestAgent',
            endpoint: 'anthropic',
            iconURL: 'https://example.com/spec-icon.png',
            model: 'claude-3',
            unfinished: true,
            error: false,
            isCreatedByUser: false,
            user: 'test-user-123',
          }),
          expect.objectContaining({
            context: 'api/server/routes/agents/index.js - abort endpoint',
          }),
        );
      });

      it('saves the aborted partial as temporary from job metadata, not the request body', async () => {
        const jobStreamId = 'test-stream-123';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });

        // The job was a temporary chat; the stop button posts only conversationId.
        const abortResult = {
          success: true,
          jobData: {
            userMessage: { messageId: 'user-msg-123' },
            responseMessageId: 'response-msg-456',
            conversationId: jobStreamId,
            isTemporary: true,
          },
          content: [{ type: 'text', text: 'Partial...' }],
          text: 'Partial...',
        };
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          await options.beforePublish(abortResult);
          return abortResult;
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId }); // no isTemporary in body

        expect(response.status).toBe(200);
        expect(mockSaveMessage).toHaveBeenCalledWith(
          expect.objectContaining({ isTemporary: true }),
          expect.anything(),
          expect.anything(),
        );
      });

      it('stamps a paused ask_user_question via transformAbortContent, before the final SSE emits', async () => {
        const jobStreamId = 'test-stream-123';
        const question = { question: 'Deploy where?', options: [{ label: 'Prod', value: 'prod' }] };

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: {
            userId: 'test-user-123',
            pendingAction: { payload: { type: 'ask_user_question', question } },
          },
        });

        // abortJob applies the transform; capture it and echo the transformed
        // content back as the result, mirroring the real (Redis) reconstruction
        // where the ask tool_call arrives with empty args.
        let capturedTransform;
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          capturedTransform = options?.transformAbortContent;
          const rawContent = [
            { type: 'tool_call', tool_call: { id: 'tc1', name: 'ask_user_question', args: '' } },
          ];
          const content = capturedTransform
            ? capturedTransform(rawContent, {
                pendingAction: { payload: { type: 'ask_user_question', question } },
              })
            : rawContent;
          const result = {
            success: true,
            jobData: {
              userMessage: { messageId: 'user-msg-123' },
              responseMessageId: 'response-msg-456',
              conversationId: jobStreamId,
            },
            content,
            text: '',
          };
          await options?.beforePublish?.(result);
          return result;
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        expect(capturedTransform).toEqual(expect.any(Function));
        // The saved (and, in prod, emitted) content carries the stamped args.
        // saveMessage(reqLike, responseMessage, opts) — the message is arg #2.
        const savedMessage = mockSaveMessage.mock.calls
          .map(([, message]) => message)
          .find((message) => message.isCreatedByUser === false);
        const askPart = savedMessage.content.find(
          (p) => p?.tool_call?.name === 'ask_user_question',
        );
        expect(JSON.parse(askPart.tool_call.args)).toMatchObject({ question: 'Deploy where?' });
      });

      it('preserves an accepted ask answer when abort wins during resume reconstruction', async () => {
        const jobStreamId = 'test-stream-123';
        const question = { question: 'Deploy where?', options: [{ label: 'Prod', value: 'prod' }] };

        // The route reads the still-paused snapshot before resume wins. The
        // manager must supply the newer, terminal-claim snapshot to the
        // transform rather than letting this initial read go stale.
        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });

        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          const rawContent = [
            { type: 'tool_call', tool_call: { id: 'tc1', name: 'ask_user_question', args: '' } },
          ];
          const content = options.transformAbortContent(rawContent, {
            resolvedAskUserQuestions: [
              {
                request: question,
                output: 'prod',
                toolCallId: 'tc1',
              },
            ],
          });
          const result = {
            success: true,
            jobData: {
              userMessage: { messageId: 'user-msg-123' },
              responseMessageId: 'response-msg-456',
              conversationId: jobStreamId,
            },
            content,
            text: '',
          };
          await options.beforePublish(result);
          return result;
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        const savedMessage = mockSaveMessage.mock.calls
          .map(([, message]) => message)
          .find((message) => message.isCreatedByUser === false);
        const askPart = savedMessage.content.find(
          (part) => part?.tool_call?.name === 'ask_user_question',
        );
        expect(JSON.parse(askPart.tool_call.args)).toEqual(question);
        expect(askPart.tool_call.output).toBe('prod');
        expect(askPart.tool_call.progress).toBe(1);
      });

      it('does not stamp an ID-less legacy answer onto a later pending ask', async () => {
        const jobStreamId = 'test-stream-123';
        const priorQuestion = { question: 'Which environment?' };
        const currentQuestion = { question: 'Approve deployment?' };

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          const rawContent = [
            {
              type: 'tool_call',
              tool_call: {
                id: 'legacy-call',
                name: 'ask_user_question',
                args: JSON.stringify(priorQuestion),
                output: 'staging',
              },
            },
            {
              type: 'tool_call',
              tool_call: { id: 'current-call', name: 'ask_user_question', args: '' },
            },
          ];
          const content = options.transformAbortContent(rawContent, {
            resolvedAskUserQuestions: [{ request: priorQuestion, output: 'staging' }],
            pendingAction: {
              payload: {
                type: 'ask_user_question',
                question: currentQuestion,
                tool_call_id: 'current-call',
              },
            },
          });
          const result = {
            success: true,
            jobData: {
              userMessage: { messageId: 'user-msg-123' },
              responseMessageId: 'response-msg-456',
              conversationId: jobStreamId,
            },
            content,
            text: '',
          };
          await options.beforePublish(result);
          return result;
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        const savedMessage = mockSaveMessage.mock.calls
          .map(([, message]) => message)
          .find((message) => message.isCreatedByUser === false);
        const [priorAsk, currentAsk] = savedMessage.content;
        expect(priorAsk.tool_call.output).toBe('staging');
        expect(JSON.parse(priorAsk.tool_call.args)).toEqual(priorQuestion);
        expect(currentAsk.tool_call.output).toBeUndefined();
        expect(JSON.parse(currentAsk.tool_call.args)).toEqual(currentQuestion);
      });

      it('reconstructs an exact-ID prior answer alongside a later pending ask', async () => {
        const jobStreamId = 'test-stream-123';
        const priorQuestion = { question: 'Which environment?' };
        const currentQuestion = { question: 'Approve deployment?' };

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          const rawContent = [
            {
              type: 'tool_call',
              tool_call: { id: 'prior-call', name: 'ask_user_question', args: '' },
            },
            {
              type: 'tool_call',
              tool_call: { id: 'current-call', name: 'ask_user_question', args: '' },
            },
          ];
          const content = options.transformAbortContent(rawContent, {
            resolvedAskUserQuestions: [
              {
                request: priorQuestion,
                output: 'staging',
                toolCallId: 'prior-call',
              },
            ],
            pendingAction: {
              payload: {
                type: 'ask_user_question',
                question: currentQuestion,
                tool_call_id: 'current-call',
              },
            },
          });
          const result = {
            success: true,
            jobData: {
              userMessage: { messageId: 'user-msg-123' },
              responseMessageId: 'response-msg-456',
              conversationId: jobStreamId,
            },
            content,
            text: '',
          };
          await options.beforePublish(result);
          return result;
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        const savedMessage = mockSaveMessage.mock.calls
          .map(([, message]) => message)
          .find((message) => message.isCreatedByUser === false);
        const [priorAsk, currentAsk] = savedMessage.content;
        expect(priorAsk.tool_call.output).toBe('staging');
        expect(JSON.parse(priorAsk.tool_call.args)).toEqual(priorQuestion);
        expect(currentAsk.tool_call.output).toBeUndefined();
        expect(JSON.parse(currentAsk.tool_call.args)).toEqual(currentQuestion);
      });

      it('reconstructs an ID-less prior answer while a later tool approval is pending', async () => {
        const jobStreamId = 'test-stream-123';
        const priorQuestion = { question: 'Which environment?' };

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          const rawContent = [
            {
              type: 'tool_call',
              tool_call: { id: 'legacy-call', name: 'ask_user_question', args: '' },
            },
          ];
          const content = options.transformAbortContent(rawContent, {
            resolvedAskUserQuestions: [{ request: priorQuestion, output: 'staging' }],
            pendingAction: {
              payload: {
                type: 'tool_approval',
                action_requests: [{ tool_call_id: 'tool-1' }],
                review_configs: [],
              },
            },
          });
          const result = {
            success: true,
            jobData: {
              userMessage: { messageId: 'user-msg-123' },
              responseMessageId: 'response-msg-456',
              conversationId: jobStreamId,
            },
            content,
            text: '',
          };
          await options.beforePublish(result);
          return result;
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        const savedMessage = mockSaveMessage.mock.calls
          .map(([, message]) => message)
          .find((message) => message.isCreatedByUser === false);
        const [priorAsk] = savedMessage.content;
        expect(priorAsk.tool_call.output).toBe('staging');
        expect(JSON.parse(priorAsk.tool_call.args)).toEqual(priorQuestion);
      });

      it('should handle saveMessage errors gracefully', async () => {
        const jobStreamId = 'test-stream-123';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123', generationProtocolVersion: 2 },
        });

        const abortResult = {
          success: true,
          jobData: {
            userMessage: { messageId: 'user-msg-123' },
            responseMessageId: 'response-msg-456',
            conversationId: jobStreamId,
          },
          content: [{ type: 'text', text: 'Partial response...' }],
          text: 'Partial response...',
        };
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          try {
            await options.beforePublish(abortResult);
          } catch {
            return { ...abortResult, persistenceFailed: true };
          }
          return abortResult;
        });

        mockSaveMessage.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .set('X-LibreChat-Generation-Protocol', '2')
          .send({ conversationId: jobStreamId, generationProtocolVersion: 2 });

        // Should still return success even if save fails
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          aborted: jobStreamId,
          persistenceFailed: true,
          generationProtocolVersion: 2,
        });
        expect(response.headers['x-librechat-generation-protocol']).toBe('2');
      });
    });

    describe('Job Not Found', () => {
      it('should reject an unfenced new-placeholder abort when paused and running jobs exist', async () => {
        mockGenerationJobManager.getJob
          .mockResolvedValueOnce({
            status: 'requires_action',
            metadata: { userId: 'test-user-123' },
          })
          .mockResolvedValueOnce({
            status: 'running',
            metadata: { userId: 'test-user-123' },
          });
        mockGenerationJobManager.getActiveJobIdsForUser.mockResolvedValue([
          'paused-stream',
          'running-stream',
        ]);
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          jobData: null,
          content: [],
          text: '',
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'new' });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          code: 'AMBIGUOUS_ACTIVE_RUN',
          generationProtocolVersion: 1,
        });
        expect(mockGenerationJobManager.abortJob).not.toHaveBeenCalled();
      });

      it('should abort an unambiguous paused fallback job', async () => {
        mockGenerationJobManager.getJob.mockResolvedValueOnce({
          status: 'requires_action',
          metadata: { userId: 'test-user-123' },
        });
        mockGenerationJobManager.getActiveJobIdsForUser.mockResolvedValue(['paused-stream']);
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          jobData: null,
          content: [],
          text: '',
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'new' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          aborted: 'paused-stream',
          generationProtocolVersion: 1,
        });
        expect(mockGenerationJobManager.abortJob).toHaveBeenCalledWith(
          'paused-stream',
          expect.objectContaining({ transformAbortContent: expect.any(Function) }),
        );
      });

      it('should return 404 when job is not found', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(null);
        mockGenerationJobManager.getActiveJobIdsForUser.mockResolvedValue([]);

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'non-existent-job' });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          error: 'Job not found',
          streamId: 'non-existent-job',
          generationProtocolVersion: 1,
        });
      });
    });

    describe('Generation fence', () => {
      it('aborts the generation this handler observed, not whatever replaced it', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
          createdAt: 1000,
        });
        mockGenerationJobManager.abortJob.mockResolvedValue({ success: true, content: [] });

        await request(app).post('/api/agents/chat/abort').send({ conversationId: 'conv-1' });

        // Without the fence, a replacement turn that reused this conversationId between
        // the lookup and the abort receives the stop instead.
        expect(mockGenerationJobManager.abortJob).toHaveBeenCalledWith(
          'conv-1',
          expect.objectContaining({ expectedCreatedAt: 1000 }),
        );
      });
    });

    describe('Replacement vs vanished job', () => {
      /**
       * Both cases surface as `success: false, jobData: null`, but they need opposite
       * handling: a REPLACEMENT must not have its checkpoint pruned, while a job that
       * merely vanished (Stop pressed as the generation completes) is a benign race the
       * user should not see an error for.
       */
      it('refuses when a DIFFERENT generation now holds the conversation', async () => {
        mockGenerationJobManager.getJob
          .mockResolvedValueOnce({ metadata: { userId: 'test-user-123' }, createdAt: 1000 })
          .mockResolvedValue({ metadata: { userId: 'test-user-123' }, createdAt: 2000 });
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          jobData: null,
          content: [],
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'conv-1' });

        expect(response.status).toBe(409);
        // Nothing downstream ran: no partial was written for the live replacement.
        expect(mockSaveMessage).not.toHaveBeenCalled();
      });

      it('still succeeds when the job simply vanished mid-abort', async () => {
        mockGenerationJobManager.getJob
          .mockResolvedValueOnce({ metadata: { userId: 'test-user-123' }, createdAt: 1000 })
          .mockResolvedValue(null);
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          jobData: null,
          content: [],
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'conv-1' });

        // Nothing to damage, so pressing Stop as a turn finishes stays a quiet success.
        expect(response.status).toBe(200);
      });

      it('fails closed when the replacement check cannot read the store', async () => {
        // null from getJob means CONFIRMED absent; a THROW means unknown — a
        // replacement may be live, and the conversation-wide checkpoint prune below
        // would strip its resume state. With the store unreadable, the handler must
        // stop before any side effect rather than treat the error as absence.
        mockGenerationJobManager.getJob
          .mockResolvedValueOnce({
            metadata: { userId: 'test-user-123', pendingAction: { payload: {} } },
            createdAt: 1000,
          })
          .mockRejectedValue(new Error('redis gone'));
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          jobData: null,
          content: [],
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'conv-1' });

        expect(response.status).toBe(503);
        expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
        expect(mockSaveMessage).not.toHaveBeenCalled();
      });
    });

    describe('Scheduled runs', () => {
      const scheduledJob = {
        status: 'running',
        metadata: {
          userId: 'test-user-123',
          scheduleId: 'sched-1',
          scheduledFor: '2026-07-26T12:00:00.000Z',
        },
        createdAt: 2000,
      };

      it('does not pick a background scheduled job for an id-less stop', async () => {
        // The stop button fires with conversationId "new" before the real id exists.
        mockGenerationJobManager.getJob.mockImplementation(async (id) =>
          id === 'sched-conv' ? { ...scheduledJob, status: 'running' } : null,
        );
        mockGenerationJobManager.getActiveJobIdsForUser.mockResolvedValue(['sched-conv']);

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'new' });

        expect(mockGenerationJobManager.abortJob).not.toHaveBeenCalled();
        expect(response.status).toBe(404);
      });

      it('records the interruption only after winning the abort', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        // Lost the CAS: a concurrent completion or resume owns this run now.
        mockGenerationJobManager.abortJob.mockResolvedValue({ success: false, content: [] });

        await request(app).post('/api/agents/chat/abort').send({ conversationId: 'sched-conv' });

        // Terminalizing it as `interrupted` here would release the capacity slot and
        // make the real outcome's write a no-op against an already-terminal row.
        expect(mockRecordScheduleOutcome).not.toHaveBeenCalled();
      });

      /**
       * abortJob flips the job to `aborted` (or removes it) the moment it wins its
       * status CAS, while this handler still has to save the partial and settle LAST.
       * The stamp is the only thing telling a concurrent account-deletion quiesce that
       * the post-abort job state it reads is not yet a finished generation — so it has
       * to be durable BEFORE the abort, not after.
       */
      it('stamps the run abort-requested before signalling the abort', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        mockGenerationJobManager.abortJob.mockResolvedValue({ success: true, content: [] });

        await request(app).post('/api/agents/chat/abort').send({ conversationId: 'sched-conv' });

        expect(mockRequestScheduledRunAbort).toHaveBeenCalledWith('sched-1', expect.any(Date));
        expect(mockRequestScheduledRunAbort.mock.invocationCallOrder[0]).toBeLessThan(
          mockGenerationJobManager.abortJob.mock.invocationCallOrder[0],
        );
      });

      it('refuses the abort with a 503 when the stamp cannot be made durable', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        mockRequestScheduledRunAbort.mockResolvedValueOnce('failed');

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'sched-conv' });

        // Without the stamp, a concurrent account-deletion quiesce reads the
        // post-abort job state as a finished generation and confirms its drain
        // mid-write. Nothing has been signalled yet, so refusing is side-effect free.
        expect(response.status).toBe(503);
        expect(mockGenerationJobManager.abortJob).not.toHaveBeenCalled();
      });

      it('records the interruption and clears the preserved job for a paused run', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        // Caught PAUSED at the abort CAS: no generation loop remains to settle it, so
        // the route is its only settler.
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          content: [],
          jobData: { status: 'requires_action' },
        });
        mockRecordScheduleOutcome.mockResolvedValue(true);

        await request(app).post('/api/agents/chat/abort').send({ conversationId: 'sched-conv' });

        expect(mockGenerationJobManager.abortJob).toHaveBeenCalledWith(
          'sched-conv',
          expect.objectContaining({ preserveForReconcile: true }),
        );
        expect(mockRecordScheduleOutcome).toHaveBeenCalledWith(
          expect.objectContaining({ scheduleId: 'sched-1', status: 'interrupted' }),
        );
        // Reconcile only scans ACTIVE runs, so a preserved job whose run is now
        // terminal has nothing left to settle it.
        expect(mockClearScheduledJob).toHaveBeenCalledWith('sched-conv', {
          scheduleId: 'sched-1',
          scheduledFor: '2026-07-26T12:00:00.000Z',
        });
      });

      /**
       * A RUNNING abort settles in its generation owner's catch — which awaits its own
       * pending saves plus this route's durable persistence stamp. Settling here could
       * drop the run out of the active set while the owner's user-message save was
       * still in flight: the drain-mid-write hazard again, from the other side.
       */
      it('does not settle a running abort; the generation owner does', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          content: [],
          jobData: { status: 'running' },
        });

        await request(app).post('/api/agents/chat/abort').send({ conversationId: 'sched-conv' });

        expect(mockRecordScheduleOutcome).not.toHaveBeenCalled();
        expect(mockMarkScheduledRunAbortPersisted).toHaveBeenCalledWith(
          'sched-1',
          expect.any(Date),
        );
      });

      /**
       * The persistence stamp releases the generation owner's settlement barrier, so
       * it must not appear before every write this route makes has landed — the owner
       * would settle, the drain would confirm, and the partial save would write a
       * message back for a deleted account.
       */
      it('stamps abort persistence only after the partial response is persisted', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        const abortResult = {
          success: true,
          content: [{ type: 'text', text: 'partial' }],
          text: 'partial',
          jobData: {
            status: 'running',
            userMessage: { messageId: 'umsg-1' },
            responseMessageId: 'resp-1',
            conversationId: 'sched-conv',
          },
        };
        // The route's durable work now runs inside `beforePublish`, so a mock that
        // never invokes it would silently skip the save this test orders against.
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          await options?.beforePublish?.(abortResult);
          return abortResult;
        });

        await request(app).post('/api/agents/chat/abort').send({ conversationId: 'sched-conv' });

        expect(mockSaveMessage).toHaveBeenCalled();
        expect(mockMarkScheduledRunAbortPersisted).toHaveBeenCalled();
        expect(mockSaveMessage.mock.invocationCallOrder[0]).toBeLessThan(
          mockMarkScheduledRunAbortPersisted.mock.invocationCallOrder[0],
        );
      });

      it('persists the partial but keeps the stamp unresolved when the stop never left this replica', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        const abortResult = {
          success: true,
          content: [{ type: 'text', text: 'partial' }],
          text: 'partial',
          jobData: {
            status: 'running',
            userMessage: { messageId: 'umsg-1' },
            responseMessageId: 'resp-1',
            conversationId: 'sched-conv',
          },
          signalDelivered: false,
          signalPublished: false,
        };
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          await options?.beforePublish?.(abortResult);
          return abortResult;
        });
        mockGenerationJobManager.resignalAbort.mockResolvedValueOnce({
          delivered: false,
          published: false,
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'sched-conv' });

        // The route's writes land (the stopped response must survive a client that
        // never retries), but an UNDELIVERED abort must keep fencing the drains:
        // resolving the stamp here would let a deletion quiesce settle the run
        // while the peer-owned generation is still running.
        expect(mockSaveMessage).toHaveBeenCalled();
        expect(mockMarkScheduledRunAbortPersisted).not.toHaveBeenCalled();
        expect(response.status).toBe(503);
      });

      it('settles a paused run as plain success even when the abort publish failed', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        // requires_action at the CAS: no generation loop is left to deliver to, so
        // a failed publish costs nothing — answering retryable would instead leave
        // the paused run active until reconciliation.
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          content: [],
          jobData: { status: 'requires_action' },
          signalDelivered: false,
          signalPublished: false,
        });
        mockRecordScheduleOutcome.mockResolvedValue(true);

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'sched-conv' });

        expect(mockGenerationJobManager.resignalAbort).not.toHaveBeenCalled();
        expect(mockRecordScheduleOutcome).toHaveBeenCalledWith(
          expect.objectContaining({ scheduleId: 'sched-1', status: 'interrupted' }),
        );
        expect(response.status).toBe(200);
      });

      it('acts on nothing when the abort loses the CAS to a concurrent transition', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        // A pause->running resume (or a completion) won between abortJob's own fresh
        // read and its terminal transition: the job belongs to a LIVE turn now.
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          content: [],
          jobData: { status: 'requires_action' },
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'sched-conv' });

        // Pruning here would strip the live resume's checkpoint thread; saving would
        // persist a partial for a generation still running; settling would terminalize
        // a run its real owner still has to settle.
        expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
        expect(mockSaveMessage).not.toHaveBeenCalled();
        expect(mockRecordScheduleOutcome).not.toHaveBeenCalled();
        // The lost stop attempt is RESOLVED so the generation owner's settlement
        // barrier never waits on it.
        expect(mockMarkScheduledRunAbortPersisted).toHaveBeenCalled();
        // The store still shows the authorized generation live, so the loser must not
        // report a win: the client is told to retry against the live turn.
        expect(response.status).toBe(409);
        expect(response.headers['retry-after']).toBe('1');
        expect(response.body).toMatchObject({ code: 'RUN_STILL_ACTIVE' });
      });

      it('retries a failed stop-stamp resolution instead of swallowing it', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          content: [],
          jobData: { status: 'requires_action' },
        });
        mockMarkScheduledRunAbortPersisted
          .mockRejectedValueOnce(new Error('transient mongo failure'))
          .mockRejectedValueOnce(new Error('transient mongo failure'))
          .mockResolvedValueOnce(undefined);

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'sched-conv' });

        // A single swallowed write left the stamp unresolved: every subsequent Stop
        // then answered 'in_progress' (a false success that retries nothing) while
        // the owner barrier and reconciler stayed fenced for the stale window.
        expect(mockMarkScheduledRunAbortPersisted).toHaveBeenCalledTimes(3);
        // Stamp resolution is independent of the lost-CAS outcome the client sees.
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ code: 'RUN_STILL_ACTIVE' });
      });

      const interactiveJob = {
        status: 'running',
        createdAt: 1000,
        metadata: { userId: 'test-user-123' },
      };

      it('answers retryable when an interactive stop provably never left this replica', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(interactiveJob);
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          content: [],
          jobData: { status: 'running' },
          signalDelivered: false,
          signalPublished: false,
        });
        // The immediate republish is ALSO swallowed on this replica.
        mockGenerationJobManager.resignalAbort.mockResolvedValueOnce({
          delivered: false,
          published: false,
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'test-conv' });

        // The terminal CAS is durable but the publish threw: the peer-owned
        // generation keeps running, and claiming success here left no path that
        // would ever republish. Re-signal once and tell the client to retry.
        expect(mockGenerationJobManager.resignalAbort).toHaveBeenCalled();
        expect(response.status).toBe(503);
      });

      it('answers success when the immediate republish lands', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(interactiveJob);
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          content: [],
          jobData: { status: 'running' },
          signalDelivered: false,
          signalPublished: false,
        });
        // Default resignal mock publishes: the signal left the replica after all,
        // so discarding that outcome and answering 503 anyway would send the
        // client through a retry loop for a stop that already landed.
        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'test-conv' });

        expect(mockGenerationJobManager.resignalAbort).toHaveBeenCalled();
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true });
      });

      it("persists the won abort's partial response before answering retryable", async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(interactiveJob);
        const abortResult = {
          success: true,
          content: [{ type: 'text', text: 'partial' }],
          text: 'partial',
          jobData: {
            status: 'running',
            userMessage: { messageId: 'umsg-1' },
            responseMessageId: 'resp-1',
            conversationId: 'test-conv',
          },
          signalDelivered: false,
          signalPublished: false,
        };
        mockGenerationJobManager.abortJob.mockImplementation(async (_streamId, options) => {
          await options?.beforePublish?.(abortResult);
          return abortResult;
        });
        mockGenerationJobManager.resignalAbort.mockResolvedValueOnce({
          delivered: false,
          published: false,
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'test-conv' });

        // A client that never retries must not permanently lose the stopped
        // response over a transient publish failure: the won abort's persistence
        // work runs BEFORE the retryable exit.
        expect(mockSaveMessage).toHaveBeenCalled();
        expect(response.status).toBe(503);
      });

      it('stays retryable when the terminal-branch republication also fails', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(interactiveJob);
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          content: [],
          jobData: { status: 'aborted' },
        });
        // The retry's republish is ALSO swallowed on this replica: answering 200
        // here told the client the stop landed while the signal provably never left.
        mockGenerationJobManager.resignalAbort.mockResolvedValueOnce({
          delivered: false,
          published: false,
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'test-conv' });

        expect(response.status).toBe(503);
      });

      it('re-signals an already-aborted job instead of trusting terminal status', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(interactiveJob);
        // A previous Stop won the CAS; its publication may never have left that
        // replica, so the retry must republish rather than return silently.
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          content: [],
          jobData: { status: 'aborted' },
        });

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'test-conv' });

        expect(mockGenerationJobManager.resignalAbort).toHaveBeenCalled();
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true });
      });

      it('answers a duplicate Stop benignly while another attempt is in flight', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        mockRequestScheduledRunAbort.mockResolvedValueOnce('in_progress');

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'sched-conv' });

        // Acting would race the winner: an abort here could lose its CAS, and its
        // resolution would release the settlement barrier while the winner is still
        // persisting. The first Stop is already executing the user's intent.
        expect(response.status).toBe(200);
        expect(mockGenerationJobManager.abortJob).not.toHaveBeenCalled();
        expect(mockMarkScheduledRunAbortPersisted).not.toHaveBeenCalled();
      });

      it('does not renew the abort stamp for a job observed terminal', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue({
          ...scheduledJob,
          status: 'aborted',
        });
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          content: [],
          jobData: null,
        });

        await request(app).post('/api/agents/chat/abort').send({ conversationId: 'sched-conv' });

        // Stamping a cleanup abort of a dead owner re-arms the 30-minute fence on
        // every Stop click, so the run could never age into the reconciler's recovery.
        expect(mockRequestScheduledRunAbort).not.toHaveBeenCalled();
      });

      it('keeps the scheduled terminal retry retryable when the stamp cannot be persisted', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue({
          ...scheduledJob,
          status: 'aborted',
        });
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          content: [],
          jobData: { status: 'aborted' },
        });
        // The republish lands (default resignal mock publishes), but the direct
        // abort-persistence mark keeps failing.
        mockMarkScheduledRunAbortPersisted.mockRejectedValue(new Error('transient mongo failure'));

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'sched-conv' });

        // A swallowed exhaustion here answered 200 with the abort fence still
        // unresolved: the generation owner's settlement barrier then waits its full
        // timeout, and the run blocks overlap and global capacity until the
        // 30-minute stale window. Bounded retries first, retryable response after.
        expect(mockMarkScheduledRunAbortPersisted).toHaveBeenCalledTimes(3);
        expect(response.status).toBe(503);
      });

      it('resolves the scheduled terminal retry once the stamp becomes durable', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue({
          ...scheduledJob,
          status: 'aborted',
        });
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: false,
          content: [],
          jobData: { status: 'aborted' },
        });
        mockMarkScheduledRunAbortPersisted
          .mockRejectedValueOnce(new Error('transient mongo failure'))
          .mockResolvedValueOnce(undefined);

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'sched-conv' });

        expect(mockMarkScheduledRunAbortPersisted).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true });
      });

      it('keeps the preserved job when the outcome write exhausted its retries', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          content: [],
          jobData: { status: 'requires_action' },
        });
        mockRecordScheduleOutcome.mockResolvedValue(false);

        await request(app).post('/api/agents/chat/abort').send({ conversationId: 'sched-conv' });

        // The retained job is the reconciler's only evidence the run stopped.
        expect(mockClearScheduledJob).not.toHaveBeenCalled();
      });
    });
  });
});
