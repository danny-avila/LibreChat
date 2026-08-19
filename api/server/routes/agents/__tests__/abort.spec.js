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
  getJob: jest.fn(),
  abortJob: jest.fn(),
  getActiveJobIdsForUser: jest.fn(),
};

const mockSaveMessage = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isEnabled: jest.fn().mockReturnValue(false),
  GenerationJobManager: mockGenerationJobManager,
}));

jest.mock('~/models', () => ({
  saveMessage: (...args) => mockSaveMessage(...args),
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
  });
});
