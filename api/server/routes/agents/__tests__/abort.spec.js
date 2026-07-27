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
const mockRecordScheduleOutcome = jest.fn(async () => true);
const mockClearScheduledJob = jest.fn(async () => undefined);

jest.mock('~/server/services/Schedules', () => ({
  recordScheduleOutcome: (...args) => mockRecordScheduleOutcome(...args),
  clearScheduledJob: (...args) => mockClearScheduledJob(...args),
}));

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
    mockRecordScheduleOutcome.mockReset();
    mockRecordScheduleOutcome.mockResolvedValue(true);
    mockClearScheduledJob.mockReset();
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
        expect(response.body).toEqual({ error: 'Unauthorized' });
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
        expect(response.body).toEqual({ success: true, aborted: jobStreamId });
        expect(mockGenerationJobManager.abortJob).toHaveBeenCalledWith(
          jobStreamId,
          expect.objectContaining({ transformAbortContent: expect.any(Function) }),
        );
      });

      it('should allow abort when job has no userId metadata (backwards compatibility)', async () => {
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

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, aborted: jobStreamId });
      });
    });

    describe('Early Abort Handling', () => {
      it('should skip message saving when responseMessageId is missing (early abort)', async () => {
        const jobStreamId = 'test-stream-123';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
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
          .send({ conversationId: jobStreamId });

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
    });

    describe('Partial Response Saving', () => {
      it('should save partial response when both userMessage and responseMessageId exist', async () => {
        const jobStreamId = 'test-stream-123';
        const userMessageId = 'user-msg-123';
        const responseMessageId = 'response-msg-456';

        mockGenerationJobManager.getJob.mockResolvedValue({
          metadata: { userId: 'test-user-123' },
        });

        mockGenerationJobManager.abortJob.mockResolvedValue({
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
        });

        mockSaveMessage.mockResolvedValue();

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
        mockGenerationJobManager.abortJob.mockResolvedValue({
          success: true,
          jobData: {
            userMessage: { messageId: 'user-msg-123' },
            responseMessageId: 'response-msg-456',
            conversationId: jobStreamId,
            isTemporary: true,
          },
          content: [{ type: 'text', text: 'Partial...' }],
          text: 'Partial...',
        });

        mockSaveMessage.mockResolvedValue();

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
          const content = capturedTransform ? capturedTransform(rawContent) : rawContent;
          return {
            success: true,
            jobData: {
              userMessage: { messageId: 'user-msg-123' },
              responseMessageId: 'response-msg-456',
              conversationId: jobStreamId,
            },
            content,
            text: '',
          };
        });

        mockSaveMessage.mockResolvedValue();

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        expect(response.status).toBe(200);
        expect(capturedTransform).toEqual(expect.any(Function));
        // The saved (and, in prod, emitted) content carries the stamped args.
        // saveMessage(reqLike, responseMessage, opts) — the message is arg #2.
        const savedMessage = mockSaveMessage.mock.calls[0][1];
        const askPart = savedMessage.content.find(
          (p) => p?.tool_call?.name === 'ask_user_question',
        );
        expect(JSON.parse(askPart.tool_call.args)).toMatchObject({ question: 'Deploy where?' });
      });

      it('should handle saveMessage errors gracefully', async () => {
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
          content: [{ type: 'text', text: 'Partial response...' }],
          text: 'Partial response...',
        });

        mockSaveMessage.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: jobStreamId });

        // Should still return success even if save fails
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, aborted: jobStreamId });
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to save partial response'),
        );
      });
    });

    describe('Job Not Found', () => {
      it('should skip paused fallback jobs and abort the running job', async () => {
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

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, aborted: 'running-stream' });
        expect(mockGenerationJobManager.abortJob).toHaveBeenCalledWith(
          'running-stream',
          expect.objectContaining({ transformAbortContent: expect.any(Function) }),
        );
      });

      it('should not abort paused fallback jobs', async () => {
        mockGenerationJobManager.getJob.mockResolvedValueOnce({
          status: 'requires_action',
          metadata: { userId: 'test-user-123' },
        });
        mockGenerationJobManager.getActiveJobIdsForUser.mockResolvedValue(['paused-stream']);

        const response = await request(app)
          .post('/api/agents/chat/abort')
          .send({ conversationId: 'new' });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          error: 'Job not found',
          streamId: null,
        });
        expect(mockGenerationJobManager.abortJob).not.toHaveBeenCalled();
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

    describe('Scheduled runs', () => {
      const scheduledJob = {
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

      it('records the interruption and clears the preserved job once the abort wins', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        mockGenerationJobManager.abortJob.mockResolvedValue({ success: true, content: [] });
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

      it('keeps the preserved job when the outcome write exhausted its retries', async () => {
        mockGenerationJobManager.getJob.mockResolvedValue(scheduledJob);
        mockGenerationJobManager.abortJob.mockResolvedValue({ success: true, content: [] });
        mockRecordScheduleOutcome.mockResolvedValue(false);

        await request(app).post('/api/agents/chat/abort').send({ conversationId: 'sched-conv' });

        // The retained job is the reconciler's only evidence the run stopped.
        expect(mockClearScheduledJob).not.toHaveBeenCalled();
      });
    });
  });
});
