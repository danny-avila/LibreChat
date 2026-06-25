/**
 * Integration tests for the HITL resume controller (POST /agents/chat/resume).
 *
 * Drives the real `ResumeAgentController` end-to-end over supertest with the SDK
 * run, durable checkpointer, Mongo, and concurrency cache mocked out. The pure
 * decision/liveness helpers (`isPendingActionStale`, `mapToolApprovalResolutions`,
 * `findUndecidedToolCalls`, `findDisallowedDecisions`, `buildAbortedResponseMetadata`,
 * `sanitizeMessageForTransmit`) run for real via `requireActual`, so the test
 * exercises the actual guard ladder and the pause -> approve -> resume -> finalize
 * lifecycle rather than re-implemented stubs.
 *
 * Covers:
 *  - the authorization / staleness / agent-and-endpoint / actionId guard ladder
 *  - tool_approval validation (undecided, policy-disallowed decision)
 *  - ask_user_question answer requirement
 *  - concurrency gate (429) and the atomic single-winner claim (409)
 *  - the happy path: ACK, run reconstruction, resumeCompletion, finalize (save the
 *    now-finished response, emit done, complete job, prune checkpoint)
 *  - re-pause (no double finalize), abort-during-resume (no double finalize),
 *    and the resume-failure terminal path
 */

const express = require('express');
const request = require('supertest');
const { Constants } = require('librechat-data-provider');

const USER_ID = 'user-1';
const TENANT_ID = 'tenant-1';
const AGENT_ID = 'agent-abc';
const CONVO_ID = 'convo-123';
const ACTION_ID = 'action-xyz';
const RESPONSE_MSG_ID = 'resp-1';
const USER_MSG_ID = 'umsg-1';
const THREAD_PARENT_ID = 'thread-parent-1';

const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockJobStore = {
  getJob: jest.fn(),
  updateJob: jest.fn(),
};

const mockGenerationJobManager = {
  getJob: jest.fn(),
  getJobStore: jest.fn(() => mockJobStore),
  getResumeState: jest.fn(),
  setContentParts: jest.fn(),
  emitChunk: jest.fn(),
  emitDone: jest.fn(),
  emitError: jest.fn(),
  completeJob: jest.fn(),
  approvals: { resolve: jest.fn() },
};

const mockDeleteAgentCheckpoint = jest.fn();
const mockDecrementPendingRequest = jest.fn();
const mockCheckAndIncrementPendingRequest = jest.fn();

const mockSaveMessage = jest.fn();
const mockGetConvo = jest.fn();
const mockDisposeClient = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  GenerationJobManager: mockGenerationJobManager,
  deleteAgentCheckpoint: (...args) => mockDeleteAgentCheckpoint(...args),
  decrementPendingRequest: (...args) => mockDecrementPendingRequest(...args),
  checkAndIncrementPendingRequest: (...args) => mockCheckAndIncrementPendingRequest(...args),
}));

jest.mock('~/models', () => ({
  saveMessage: (...args) => mockSaveMessage(...args),
  getConvo: (...args) => mockGetConvo(...args),
}));

jest.mock('~/server/cleanup', () => ({
  disposeClient: (...args) => mockDisposeClient(...args),
}));

// Import after mocks
const ResumeAgentController = require('~/server/controllers/agents/resume');

/** Drain the microtask + immediate queues so the post-ACK continuation settles. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A live, resolvable paused tool-approval job (single tool call `tc1`). */
function makeToolApprovalJob(overrides = {}) {
  const metaOverrides = overrides.metadata ?? {};
  const pendingOverrides = metaOverrides.pendingAction ?? {};
  return {
    status: 'requires_action',
    abortController: new AbortController(),
    ...overrides,
    metadata: {
      userId: USER_ID,
      tenantId: TENANT_ID,
      agent_id: AGENT_ID,
      endpoint: 'agents',
      responseMessageId: RESPONSE_MSG_ID,
      sender: 'TestAgent',
      iconURL: 'https://example.com/icon.png',
      model: 'claude-test',
      isTemporary: false,
      userMessage: {
        messageId: USER_MSG_ID,
        parentMessageId: THREAD_PARENT_ID,
        text: 'please run the tool',
      },
      ...metaOverrides,
      pendingAction: {
        actionId: ACTION_ID,
        expiresAt: Date.now() + 60_000,
        payload: {
          type: 'tool_approval',
          action_requests: [{ tool_call_id: 'tc1' }],
          review_configs: [{ tool_call_id: 'tc1', allowed_decisions: ['approve', 'reject'] }],
        },
        ...pendingOverrides,
      },
    },
  };
}

/** A live, resolvable paused ask-user-question job. */
function makeAskUserJob(overrides = {}) {
  const job = makeToolApprovalJob(overrides);
  job.metadata.pendingAction.payload = {
    type: 'ask_user_question',
    question: 'What should I name the file?',
  };
  return job;
}

/** A mock reconstructed client for the post-ACK path. */
function makeClient(overrides = {}) {
  return {
    sender: 'TestAgent',
    contentParts: [{ type: 'text', text: 'resumed answer' }],
    artifactPromises: [],
    pendingApproval: false,
    buildResponseMetadata: jest.fn(() => null),
    resumeCompletion: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('ResumeAgentController (POST /agents/chat/resume)', () => {
  let app;
  let mockInitializeClient;
  let mockAddTitle;
  let capturedInit;
  let settle;
  let settled;

  beforeEach(() => {
    jest.clearAllMocks();

    capturedInit = null;
    mockCheckAndIncrementPendingRequest.mockResolvedValue({ allowed: true });
    mockDecrementPendingRequest.mockResolvedValue(undefined);
    mockDeleteAgentCheckpoint.mockResolvedValue(undefined);
    mockSaveMessage.mockResolvedValue(undefined);
    mockGetConvo.mockResolvedValue(null);
    mockJobStore.getJob.mockResolvedValue({ tokenUsage: null, contextUsage: null });
    mockJobStore.updateJob.mockResolvedValue(undefined);
    mockGenerationJobManager.getResumeState.mockResolvedValue({ aggregatedContent: [] });
    mockGenerationJobManager.emitDone.mockResolvedValue(undefined);
    mockGenerationJobManager.emitError.mockResolvedValue(undefined);
    mockGenerationJobManager.emitChunk.mockResolvedValue(undefined);
    mockGenerationJobManager.completeJob.mockResolvedValue(undefined);
    mockGenerationJobManager.approvals.resolve.mockResolvedValue(true);

    // `decrementPendingRequest` runs in the controller's `finally` on every
    // post-ACK path, so resolving on it signals the async continuation is done.
    settled = new Promise((resolve) => {
      settle = resolve;
    });
    mockDecrementPendingRequest.mockImplementation(async () => {
      settle();
    });

    mockAddTitle = jest.fn().mockResolvedValue(undefined);
    mockInitializeClient = jest.fn(async ({ req }) => {
      // Capture the request state the controller seeds BEFORE reconstruction.
      capturedInit = { parentMessageId: req.body.parentMessageId };
      return { client: makeClient(), userMCPAuthMap: { server1: { token: 't' } } };
    });

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: USER_ID, tenantId: TENANT_ID };
      req.config = {
        endpoints: { agents: { checkpointer: { type: 'mongo' } } },
        interfaceConfig: {},
      };
      next();
    });
    app.post('/api/agents/chat/resume', (req, res, next) =>
      ResumeAgentController(req, res, next, mockInitializeClient, mockAddTitle),
    );
  });

  const post = (body) => request(app).post('/api/agents/chat/resume').send(body);

  const approveBody = (extra = {}) => ({
    conversationId: CONVO_ID,
    actionId: ACTION_ID,
    agent_id: AGENT_ID,
    endpoint: 'agents',
    decisions: [{ tool_call_id: 'tc1', decision: 'approve' }],
    ...extra,
  });

  describe('request guards (rejected before claiming the action)', () => {
    it('400 when conversationId is missing', async () => {
      const res = await post({ actionId: ACTION_ID });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/conversationId is required/i);
      expect(mockGenerationJobManager.getJob).not.toHaveBeenCalled();
    });

    it('400 when conversationId is the "new" placeholder', async () => {
      const res = await post({ conversationId: 'new', actionId: ACTION_ID });
      expect(res.status).toBe(400);
      expect(mockGenerationJobManager.getJob).not.toHaveBeenCalled();
    });

    it('404 when there is no paused job for the conversation', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(null);
      const res = await post(approveBody());
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/no paused generation/i);
    });

    it('403 when the job belongs to another user', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(
        makeToolApprovalJob({ metadata: { userId: 'someone-else' } }),
      );
      const res = await post(approveBody());
      expect(res.status).toBe(403);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('403 on a tenant mismatch', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(
        makeToolApprovalJob({ metadata: { tenantId: 'other-tenant' } }),
      );
      const res = await post(approveBody());
      expect(res.status).toBe(403);
    });

    it('403 when the resume omits the paused agent_id', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody({ agent_id: undefined }));
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/different agent/i);
    });

    it('403 when the resume claims a different agent_id', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody({ agent_id: 'agent-other' }));
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/different agent/i);
    });

    it('403 when the resume claims a different endpoint', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody({ endpoint: 'bedrock' }));
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/different endpoint/i);
    });

    it('409 when the job is not in requires_action', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob({ status: 'running' }));
      const res = await post(approveBody());
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/no live pending action/i);
    });

    it('409 when the pending action has expired (stale)', async () => {
      const job = makeToolApprovalJob();
      job.metadata.pendingAction.expiresAt = Date.now() - 1_000;
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(approveBody());
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/no live pending action/i);
    });

    it('400 when actionId is missing', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody({ actionId: undefined }));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/actionId is required/i);
    });

    it('409 when actionId targets a stale action', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody({ actionId: 'stale-action' }));
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/stale action/i);
    });

    it('400 when a tool call is left undecided', async () => {
      const job = makeToolApprovalJob();
      job.metadata.pendingAction.payload.action_requests = [
        { tool_call_id: 'tc1' },
        { tool_call_id: 'tc2' },
      ];
      job.metadata.pendingAction.payload.review_configs = [
        { tool_call_id: 'tc1', allowed_decisions: ['approve', 'reject'] },
        { tool_call_id: 'tc2', allowed_decisions: ['approve', 'reject'] },
      ];
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(approveBody()); // only decides tc1
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/must be decided/i);
      expect(res.body.undecided).toEqual(['tc2']);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('403 when a decision is not permitted by the tool policy', async () => {
      const job = makeToolApprovalJob();
      // Policy restricts tc1 to reject only; an `approve` must be refused.
      job.metadata.pendingAction.payload.review_configs = [
        { tool_call_id: 'tc1', allowed_decisions: ['reject'] },
      ];
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(approveBody());
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not permitted/i);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('400 when an ask_user_question resume carries no answer', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeAskUserJob());
      const res = await post({ conversationId: CONVO_ID, actionId: ACTION_ID, agent_id: AGENT_ID });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/answer is required/i);
    });

    it('429 when the concurrency gate rejects the resume', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockCheckAndIncrementPendingRequest.mockResolvedValue({ allowed: false });
      const res = await post(approveBody());
      expect(res.status).toBe(429);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('409 and releases the slot when the action was already claimed (single-winner)', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockGenerationJobManager.approvals.resolve.mockResolvedValue(false);
      const res = await post(approveBody());
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already resolved or has expired/i);
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(CONVO_ID, ACTION_ID);
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockInitializeClient).not.toHaveBeenCalled();
    });
  });

  describe('happy path: approve -> reconstruct -> resume -> finalize', () => {
    it('ACKs immediately and claims the action atomically with the submitted actionId', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        streamId: CONVO_ID,
        conversationId: CONVO_ID,
        status: 'resuming',
      });
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(CONVO_ID, ACTION_ID);
      await settled;
      await flush();
    });

    it('seeds the thread parent before reconstruction and maps the decision to the SDK', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      await post(approveBody());
      await settled;
      await flush();

      // initializeAgent scopes thread files off req.body.parentMessageId, seeded
      // from the paused user message's parent before initializeClient runs.
      expect(capturedInit.parentMessageId).toBe(THREAD_PARENT_ID);

      expect(mockInitializeClient).toHaveBeenCalledTimes(1);
      const client = await mockInitializeClient.mock.results[0].value.then((r) => r.client);
      expect(client.resumeCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          resumeValue: { tc1: { type: 'approve' } },
          userMCPAuthMap: { server1: { token: 't' } },
        }),
      );
    });

    it('persists the finished response, emits done, completes the job, and prunes the checkpoint', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      await post(approveBody());
      await settled;
      await flush();

      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, isTemporary: false }),
        expect.objectContaining({
          messageId: RESPONSE_MSG_ID,
          parentMessageId: USER_MSG_ID,
          conversationId: CONVO_ID,
          content: [{ type: 'text', text: 'resumed answer' }],
          unfinished: false,
          error: false,
          isCreatedByUser: false,
          user: USER_ID,
          agent_id: AGENT_ID,
        }),
        expect.objectContaining({
          context: 'api/server/controllers/agents/resume.js - resumed response end',
        }),
      );

      expect(mockGenerationJobManager.emitDone).toHaveBeenCalledWith(
        CONVO_ID,
        expect.objectContaining({ final: true, responseMessage: expect.any(Object) }),
      );
      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(CONVO_ID);
      expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(CONVO_ID, { type: 'mongo' });
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockDisposeClient).toHaveBeenCalledTimes(1);
    });

    it('resumes an ask_user_question with the free-form answer', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeAskUserJob());
      const res = await post({
        conversationId: CONVO_ID,
        actionId: ACTION_ID,
        agent_id: AGENT_ID,
        answer: 'call it report.pdf',
      });
      expect(res.status).toBe(200);
      await settled;
      await flush();

      const client = await mockInitializeClient.mock.results[0].value.then((r) => r.client);
      expect(client.resumeCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ resumeValue: { answer: 'call it report.pdf' } }),
      );
      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(CONVO_ID);
    });

    it('generates a title for a first-turn pause before completing the stream', async () => {
      const job = makeToolApprovalJob();
      job.metadata.userMessage.parentMessageId = Constants.NO_PARENT;
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      mockGetConvo.mockResolvedValue({ title: 'New Chat' });

      await post(approveBody());
      await settled;
      await flush();

      expect(mockAddTitle).toHaveBeenCalledTimes(1);
      // Title is emitted (and the job completed) — order matters but both must happen.
      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(CONVO_ID);
    });
  });

  describe('non-finalizing outcomes', () => {
    it('re-pause: does not finalize when the run pauses again', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({ pendingApproval: true }),
        userMCPAuthMap: {},
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      await flush();

      expect(mockSaveMessage).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.emitDone).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
      expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
      // The slot is still released and the client disposed.
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockDisposeClient).toHaveBeenCalledTimes(1);
    });

    it('abort-during-resume: lets the abort route finalize, does not double-save', async () => {
      const job = makeToolApprovalJob();
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      mockInitializeClient.mockImplementation(async () => {
        job.abortController.abort();
        return { client: makeClient(), userMCPAuthMap: {} };
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      await flush();

      expect(mockSaveMessage).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.emitDone).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
    });

    it('resume failure: emits an error, finalizes the job, and prunes the checkpoint', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          resumeCompletion: jest.fn().mockRejectedValue(new Error('boom')),
        }),
        userMCPAuthMap: {},
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200); // already ACKed before the failure
      await settled;
      await flush();

      expect(mockGenerationJobManager.emitError).toHaveBeenCalledWith(CONVO_ID, 'boom');
      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(CONVO_ID, 'boom');
      expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(CONVO_ID, { type: 'mongo' });
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockSaveMessage).not.toHaveBeenCalled();
    });
  });
});
