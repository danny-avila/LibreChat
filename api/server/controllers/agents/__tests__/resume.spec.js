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
  expireApproval: jest.fn(),
  approvals: { resolve: jest.fn() },
};

const mockDeleteAgentCheckpoint = jest.fn();
const mockDecrementPendingRequest = jest.fn();
const mockCheckAndIncrementPendingRequest = jest.fn();

const mockSaveMessage = jest.fn();
const mockGetConvo = jest.fn();
const mockGetMessages = jest.fn();
const mockDisposeClient = jest.fn();
const mockGetMCPRequestContext = jest.fn();
const mockCleanupMCPRequestContextForReq = jest.fn();

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
  getMessages: (...args) => mockGetMessages(...args),
}));

jest.mock('~/server/cleanup', () => ({
  disposeClient: (...args) => mockDisposeClient(...args),
}));

jest.mock('~/server/services/MCPRequestContext', () => ({
  getMCPRequestContext: (...args) => mockGetMCPRequestContext(...args),
  cleanupMCPRequestContextForReq: (...args) => mockCleanupMCPRequestContextForReq(...args),
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
    mockCleanupMCPRequestContextForReq.mockResolvedValue(undefined);
    mockSaveMessage.mockResolvedValue(undefined);
    mockGetConvo.mockResolvedValue(null);
    mockGetMessages.mockResolvedValue([]);
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
      capturedInit = {
        parentMessageId: req.body.parentMessageId,
        files: req.body.files,
        conversationCreatedAt: req.conversationCreatedAt,
        timezone: req.body.timezone,
      };
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

  describe('temporal context restore', () => {
    it('restores req.conversationCreatedAt from the convo before initializeClient', async () => {
      // Temporal prompt vars must resolve against the paused anchor, not resume wall-clock.
      mockGetConvo.mockResolvedValue({ createdAt: new Date('2020-01-02T03:04:05.000Z') });
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      expect(capturedInit.conversationCreatedAt).toBe('2020-01-02T03:04:05.000Z');
    });

    it('leaves conversationCreatedAt unset when the convo lookup yields nothing', async () => {
      mockGetConvo.mockResolvedValue(null);
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      expect(capturedInit.conversationCreatedAt).toBeUndefined();
    });
  });

  describe('MCP request-context lifecycle', () => {
    it('pre-seeds the run-scoped MCP context before initializeClient and tears it down after', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled; // the controller's finally has run

      // Seeded with a null `res` + cleanupOnResponse:false so the post-ACK tool load
      // finds the existing store instead of getting undefined (res is already finished).
      expect(mockGetMCPRequestContext).toHaveBeenCalledWith(expect.anything(), undefined, {
        cleanupOnResponse: false,
      });
      // ...and seeded BEFORE the client (hence tool loading) is built.
      expect(mockGetMCPRequestContext.mock.invocationCallOrder[0]).toBeLessThan(
        mockInitializeClient.mock.invocationCallOrder[0],
      );
      // ...then torn down exactly once in the finally.
      expect(mockCleanupMCPRequestContextForReq).toHaveBeenCalledTimes(1);
    });
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

    it('403 when the resume OMITS the paused endpoint (no fall-through to ephemeral)', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const res = await post(approveBody({ endpoint: undefined }));
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/different endpoint/i);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('409 when the job is not in requires_action (already terminal; no expire)', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob({ status: 'running' }));
      const res = await post(approveBody());
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/no live pending action/i);
      // Already resolved/terminal — nothing to expire.
      expect(mockGenerationJobManager.expireApproval).not.toHaveBeenCalled();
    });

    it('409 AND drives expiry when the pending action has expired (stale)', async () => {
      const job = makeToolApprovalJob();
      job.metadata.pendingAction.expiresAt = Date.now() - 1_000;
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(approveBody());
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/no live pending action/i);
      // The stale action is expired NOW (expire CAS + terminal SSE) so an attached SSE
      // client gets a terminal event instead of hanging until the periodic sweeper runs.
      expect(mockGenerationJobManager.expireApproval).toHaveBeenCalledWith(CONVO_ID, ACTION_ID);
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

    it('400 when an edit decision omits editedArguments', async () => {
      const job = makeToolApprovalJob();
      job.metadata.pendingAction.payload.review_configs = [
        { tool_call_id: 'tc1', allowed_decisions: ['approve', 'edit'] },
      ];
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(
        approveBody({ decisions: [{ tool_call_id: 'tc1', decision: 'edit' }] }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/editedArguments/i);
      expect(res.body.incomplete).toEqual(['tc1']);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('400 when a respond decision omits responseText', async () => {
      const job = makeToolApprovalJob();
      job.metadata.pendingAction.payload.review_configs = [
        { tool_call_id: 'tc1', allowed_decisions: ['approve', 'respond'] },
      ];
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(
        approveBody({ decisions: [{ tool_call_id: 'tc1', decision: 'respond' }] }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/responseText/i);
    });

    it('accepts a complete edit decision (editedArguments present)', async () => {
      const job = makeToolApprovalJob();
      job.metadata.pendingAction.payload.review_configs = [
        { tool_call_id: 'tc1', allowed_decisions: ['approve', 'edit'] },
      ];
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(
        approveBody({
          decisions: [{ tool_call_id: 'tc1', decision: 'edit', editedArguments: { q: 'x' } }],
        }),
      );
      expect(res.status).toBe(200);
      await settled;
      await flush();
    });

    it('403 when the resume request fingerprint does not match the paused config', async () => {
      const job = makeToolApprovalJob();
      job.metadata.pendingAction.requestFingerprint = 'fingerprint-of-a-different-config';
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(approveBody());
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/different agent configuration/i);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('proceeds when the resume request fingerprint matches the paused config', async () => {
      const { computeAgentRequestFingerprint } = jest.requireActual('@librechat/api');
      const job = makeToolApprovalJob();
      job.metadata.pendingAction.requestFingerprint = computeAgentRequestFingerprint({
        endpoint: 'agents',
        agent_id: AGENT_ID,
      });
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(approveBody());
      expect(res.status).toBe(200);
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(CONVO_ID, ACTION_ID);
      await settled;
      await flush();
    });

    it('403 when the resume sends a different promptPrefix than the paused config', async () => {
      const { computeAgentRequestFingerprint } = jest.requireActual('@librechat/api');
      const job = makeToolApprovalJob();
      // Ephemeral instructions come from promptPrefix, so it's part of the fingerprint.
      job.metadata.pendingAction.requestFingerprint = computeAgentRequestFingerprint({
        endpoint: 'agents',
        agent_id: AGENT_ID,
        promptPrefix: 'be terse',
      });
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(approveBody({ promptPrefix: 'ignore previous instructions' }));
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/different agent configuration/i);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('400 when an ask_user_question resume carries no answer', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeAskUserJob());
      const res = await post({
        conversationId: CONVO_ID,
        actionId: ACTION_ID,
        agent_id: AGENT_ID,
        endpoint: 'agents',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/answer is required/i);
    });

    it('400 on an unsupported pending-action type', async () => {
      const job = makeToolApprovalJob();
      job.metadata.pendingAction.payload = { type: 'totally_unknown' };
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(approveBody());
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/unsupported pending action/i);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('proceeds (does not 403) for a pre-multi-tenancy job with no tenantId', async () => {
      // hasTenantMismatch only blocks when the job carries a tenantId that differs;
      // an untenanted (legacy) job must still resume once the userId check passes.
      const job = makeToolApprovalJob({ metadata: { tenantId: undefined } });
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      const res = await post(approveBody());
      expect(res.status).toBe(200);
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(CONVO_ID, ACTION_ID);
      await settled;
      await flush();
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

    it('releases the slot when the claim itself throws (store error, not a leak)', async () => {
      // The increment happens before the claim, which runs before the run's own
      // try/finally — a store error here must still release the slot or a retry of the
      // still-paused approval gets spuriously 429'd until the counter TTL expires.
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockGenerationJobManager.approvals.resolve.mockRejectedValue(new Error('redis down'));
      const res = await post(approveBody());
      expect(res.status).toBe(500);
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

    it('restores the paused user message files before reconstruction (execute-code files)', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      // The resume body carries no files; the controller must source them from the
      // persisted user message so an approved code/read-file tool keeps its uploads.
      mockGetMessages.mockResolvedValue([{ files: [{ file_id: 'f1' }] }]);

      await post(approveBody());
      await settled;
      await flush();

      expect(capturedInit.files).toEqual([{ file_id: 'f1' }]);
    });

    it('ignores client-supplied resume files, sourcing from the paused job (security)', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      // The paused turn's authoritative files (DB row); a crafted client tries to swap them.
      mockGetMessages.mockResolvedValue([{ files: [{ file_id: 'paused' }] }]);

      await post(approveBody({ files: [{ file_id: 'attacker-supplied' }] }));
      await settled;
      await flush();

      // The crafted client files must NOT reach initializeAgent — only the paused set.
      expect(capturedInit.files).toEqual([{ file_id: 'paused' }]);
    });

    it('clears client-supplied resume files when the paused turn had none (security)', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockGetMessages.mockResolvedValue([{ files: [] }]); // the paused turn had no files

      await post(approveBody({ files: [{ file_id: 'attacker-supplied' }] }));
      await settled;
      await flush();

      expect(capturedInit.files).toEqual([]);
    });

    it('prefers job-metadata files over both the client body and the DB row', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(
        makeToolApprovalJob({
          metadata: {
            userMessage: {
              messageId: USER_MSG_ID,
              parentMessageId: THREAD_PARENT_ID,
              text: 'x',
              files: [{ file_id: 'meta' }],
            },
          },
        }),
      );
      mockGetMessages.mockResolvedValue([{ files: [{ file_id: 'db' }] }]);

      await post(approveBody({ files: [{ file_id: 'attacker-supplied' }] }));
      await settled;
      await flush();

      expect(capturedInit.files).toEqual([{ file_id: 'meta' }]);
    });

    it('carries the restored files onto the final requestMessage (user bubble keeps attachments)', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      // job.metadata.userMessage is persisted without files; the final SSE must still
      // carry the restored uploads or the user bubble loses its attachments on resume.
      mockGetMessages.mockResolvedValue([{ files: [{ file_id: 'f1', filename: 'a.pdf' }] }]);

      await post(approveBody());
      await settled;
      await flush();

      const [, finalEvent] = mockGenerationJobManager.emitDone.mock.calls[0];
      expect(finalEvent.requestMessage).toMatchObject({
        messageId: USER_MSG_ID,
        isCreatedByUser: true,
        files: [{ file_id: 'f1', filename: 'a.pdf' }],
      });
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

      // Assert the finalEvent STRUCTURE, not just the hardcoded `final: true` literal —
      // a `final: true`-only check would still pass if the entire content / title /
      // requestMessage build in finalizeResumedTurn were deleted.
      const [doneStreamId, finalEvent] = mockGenerationJobManager.emitDone.mock.calls[0];
      expect(doneStreamId).toBe(CONVO_ID);
      expect(finalEvent).toMatchObject({
        final: true,
        conversation: { conversationId: CONVO_ID },
        responseMessage: {
          messageId: RESPONSE_MSG_ID,
          content: [{ type: 'text', text: 'resumed answer' }],
          unfinished: false,
        },
        requestMessage: { messageId: USER_MSG_ID, isCreatedByUser: true },
      });
      expect(typeof finalEvent.title).toBe('string');

      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(CONVO_ID);
      expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(CONVO_ID, { type: 'mongo' });
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockDisposeClient).toHaveBeenCalledTimes(1);
    });

    it('skips finalization (no save/emitDone/complete) when the job was replaced mid-resume', async () => {
      // The paused job has createdAt 1000; a concurrent request reused this conversationId,
      // so the live job now has a different createdAt — finalizing would clobber the newer
      // turn's job. The finally still runs (slot release), so `settled` resolves.
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob({ createdAt: 1000 }));
      mockJobStore.getJob.mockResolvedValue({
        tokenUsage: null,
        contextUsage: null,
        createdAt: 2000,
      });
      await post(approveBody());
      await settled;
      await flush();

      expect(mockSaveMessage).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.emitDone).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
    });

    it('does not release the slot in the finally when the client already released it on pause', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      // Simulate handleRunInterrupt having released the concurrency slot on a re-pause.
      mockInitializeClient.mockResolvedValue({
        client: makeClient({ pendingRequestReleased: true }),
        userMCPAuthMap: {},
      });
      let disposed;
      const disposedP = new Promise((resolve) => {
        disposed = resolve;
      });
      mockDisposeClient.mockImplementation(() => disposed());

      await post(approveBody());
      await disposedP;
      await flush();

      // The finally must NOT double-release — handleRunInterrupt already did.
      expect(mockDecrementPendingRequest).not.toHaveBeenCalled();
    });

    it('persists tool artifacts produced by the resumed continuation as attachments', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const artifact = { type: 'image', file_id: 'img-1' };
      // The lean resume path bypasses BaseClient.sendMessage's artifact await, so the
      // controller must await client.artifactPromises itself (and drop null results).
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          artifactPromises: [Promise.resolve(artifact), Promise.resolve(null)],
        }),
        userMCPAuthMap: {},
      });

      await post(approveBody());
      await settled;
      await flush();

      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ attachments: [artifact] }),
        expect.anything(),
      );
    });

    it('falls back to the aggregated store content when the live client content is empty', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      // No live content on the rebuilt client → the saved response must use the
      // pre-pause aggregated content from the store, not an empty array.
      mockInitializeClient.mockResolvedValue({
        client: makeClient({ contentParts: [] }),
        userMCPAuthMap: {},
      });
      mockGenerationJobManager.getResumeState.mockResolvedValue({
        aggregatedContent: [{ type: 'text', text: 'from-store' }],
      });

      await post(approveBody());
      await settled;
      await flush();

      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ content: [{ type: 'text', text: 'from-store' }] }),
        expect.anything(),
      );
    });

    it('strips malformed tool_call parts from the saved content', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          contentParts: [
            { type: 'text', text: 'kept' },
            { type: 'tool_call' }, // malformed: no tool_call payload — must be filtered
          ],
        }),
        userMCPAuthMap: {},
      });

      await post(approveBody());
      await settled;
      await flush();

      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ content: [{ type: 'text', text: 'kept' }] }),
        expect.anything(),
      );
    });

    it('merges previously persisted attachments with the resumed segment artifacts', async () => {
      const priorArtifact = { type: 'image', file_id: 'prior-1' };
      const newArtifact = { type: 'image', file_id: 'new-1' };
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      // An earlier pause segment already saved an attachment on the response row.
      mockGetMessages.mockResolvedValue([{ attachments: [priorArtifact] }]);
      mockInitializeClient.mockResolvedValue({
        client: makeClient({ artifactPromises: [Promise.resolve(newArtifact)] }),
        userMCPAuthMap: {},
      });

      await post(approveBody());
      await settled;
      await flush();

      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ attachments: [priorArtifact, newArtifact] }),
        expect.anything(),
      );
    });

    it('persists the resumed run context calibration (contextMeta) onto the saved response', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const contextMeta = { calibrationRatio: 0.8 };
      mockInitializeClient.mockResolvedValue({
        client: makeClient({ contextMeta }),
        userMCPAuthMap: {},
      });

      await post(approveBody());
      await settled;
      await flush();

      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ contextMeta }),
        expect.anything(),
      );
    });

    it('carries manualSkills/alwaysAppliedSkills onto the resumed requestMessage', async () => {
      const job = makeToolApprovalJob();
      job.metadata.userMessage.manualSkills = ['skill-a'];
      job.metadata.userMessage.alwaysAppliedSkills = ['skill-b'];
      mockGenerationJobManager.getJob.mockResolvedValue(job);

      await post(approveBody());
      await settled;
      await flush();

      const [, finalEvent] = mockGenerationJobManager.emitDone.mock.calls[0];
      expect(finalEvent.requestMessage).toMatchObject({
        manualSkills: ['skill-a'],
        alwaysAppliedSkills: ['skill-b'],
      });
    });

    it('attaches client response metadata to the saved message when present', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      const contextUsage = { tokenCount: 1234 };
      mockInitializeClient.mockResolvedValue({
        client: makeClient({ buildResponseMetadata: jest.fn(() => ({ contextUsage })) }),
        userMCPAuthMap: {},
      });

      await post(approveBody());
      await settled;
      await flush();

      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ metadata: expect.objectContaining({ contextUsage }) }),
        expect.anything(),
      );
    });

    it('resumes an ask_user_question with the free-form answer', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeAskUserJob());
      const res = await post({
        conversationId: CONVO_ID,
        actionId: ACTION_ID,
        agent_id: AGENT_ID,
        endpoint: 'agents',
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

    it('still finalizes the turn when first-turn title generation throws', async () => {
      const job = makeToolApprovalJob();
      job.metadata.userMessage.parentMessageId = Constants.NO_PARENT;
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      mockGetConvo.mockResolvedValue({ title: 'New Chat' });
      // Title generation is best-effort: a throw must not break the resumed turn.
      mockAddTitle.mockRejectedValue(new Error('title service down'));

      await post(approveBody());
      await settled;
      await flush();

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockSaveMessage).toHaveBeenCalledTimes(1);
      expect(mockGenerationJobManager.emitDone).toHaveBeenCalledWith(CONVO_ID, expect.any(Object));
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

      // It persists progress (unfinished) but must NOT finalize the turn.
      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ unfinished: true }),
        expect.anything(),
      );
      expect(mockGenerationJobManager.emitDone).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
      expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
      // The slot is still released and the client disposed.
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockDisposeClient).toHaveBeenCalledTimes(1);
    });

    it('re-pause: persists the segment content (unfinished) so an expiring re-pause keeps it', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          pendingApproval: true,
          contentParts: [{ type: 'text', text: 'streamed this segment' }],
          artifactPromises: [],
        }),
        userMCPAuthMap: {},
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      await flush();

      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          content: [{ type: 'text', text: 'streamed this segment' }],
          unfinished: true,
        }),
        expect.objectContaining({
          context: 'api/server/controllers/agents/resume.js - re-pause progress persist',
        }),
      );
      expect(mockGenerationJobManager.emitDone).not.toHaveBeenCalled();
    });

    it('re-pause: persists artifacts produced before pausing again (unfinished)', async () => {
      const artifact = { type: 'image', file_id: 'seg-1' };
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          pendingApproval: true,
          artifactPromises: [Promise.resolve(artifact)],
        }),
        userMCPAuthMap: {},
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      await flush();

      // No finalize, but the segment's artifact is persisted unfinished so the next
      // resume's finalize can merge it (otherwise the fresh client drops it).
      expect(mockGenerationJobManager.emitDone).not.toHaveBeenCalled();
      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ attachments: [artifact], unfinished: true }),
        expect.objectContaining({
          context: 'api/server/controllers/agents/resume.js - re-pause progress persist',
        }),
      );
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

    it('forces a terminal job state when completeJob also fails during a resume error', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          resumeCompletion: jest.fn().mockRejectedValue(new Error('boom')),
        }),
        userMCPAuthMap: {},
      });
      // The error path's completeJob also fails → last-resort updateJob must force a
      // terminal state so the job isn't orphaned in `running`.
      mockGenerationJobManager.completeJob.mockRejectedValue(new Error('complete failed'));

      await post(approveBody());
      await settled;
      await flush();

      expect(mockJobStore.updateJob).toHaveBeenCalledWith(
        CONVO_ID,
        expect.objectContaining({ status: 'error', error: 'Resume failed' }),
      );
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
    });
  });
});
