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
const NEXT_ACTION_ID = 'action-next';
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
  /** Resume moves ownership and rebuilds armed interrupts from the durable queue. */
  rearmQueuedPreempts: jest.fn().mockResolvedValue(0),
  emitChunk: jest.fn(),
  emitDone: jest.fn(),
  emitError: jest.fn(),
  claimTerminalJob: jest.fn(),
  publishTerminalClaim: jest.fn(),
  finishTerminalJob: jest.fn(),
  completeJob: jest.fn(),
  failPausePersistence: jest.fn(),
  expireApproval: jest.fn(),
  approvals: {
    resolve: jest.fn(),
    ownsPausePersistence: jest.fn(),
    finishPausePersistence: jest.fn(),
  },
};

const mockDeleteAgentCheckpoint = jest.fn();
const mockCaptureAgentCheckpointGeneration = jest.fn();
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
  captureAgentCheckpointGeneration: (...args) => mockCaptureAgentCheckpointGeneration(...args),
  deleteAgentCheckpoint: (...args) => mockDeleteAgentCheckpoint(...args),
  decrementPendingRequest: (...args) => mockDecrementPendingRequest(...args),
  checkAndIncrementPendingRequest: (...args) => mockCheckAndIncrementPendingRequest(...args),
  isSteerPreemptSupported: jest.fn(() => true),
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
    createdAt: 1000,
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

function makeAskUserBatchJob(overrides = {}) {
  const job = makeToolApprovalJob(overrides);
  job.metadata.pendingAction.payload = {
    type: 'ask_user_question',
    question: { question: 'Which environment?' },
    questions: [
      { id: 'environment', question: 'Which environment?' },
      { id: 'window', question: 'Which time window?' },
    ],
    tool_call_id: 'tc1',
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
    mockCaptureAgentCheckpointGeneration.mockResolvedValue({
      threadId: CONVO_ID,
      checkpointIds: ['checkpoint-old'],
    });
    mockCleanupMCPRequestContextForReq.mockResolvedValue(undefined);
    mockSaveMessage.mockResolvedValue({});
    mockGetConvo.mockResolvedValue(null);
    mockGetMessages.mockResolvedValue([]);
    mockJobStore.getJob.mockResolvedValue({
      createdAt: 1000,
      tokenUsage: null,
      contextUsage: null,
    });
    mockJobStore.updateJob.mockResolvedValue(undefined);
    mockGenerationJobManager.getResumeState.mockResolvedValue({ aggregatedContent: [] });
    mockGenerationJobManager.emitDone.mockResolvedValue(undefined);
    mockGenerationJobManager.emitError.mockResolvedValue(undefined);
    mockGenerationJobManager.emitChunk.mockResolvedValue(undefined);
    mockGenerationJobManager.claimTerminalJob.mockResolvedValue({
      streamId: CONVO_ID,
      createdAt: 1000,
      status: 'complete',
      persistencePending: true,
      drainedSteers: [],
    });
    mockGenerationJobManager.publishTerminalClaim.mockImplementation(
      async (_claim, finalEvent) => ({
        finalEvent: finalEvent ?? {
          final: true,
          reconcile: true,
          reconcileReason: 'terminal_payload_missing',
          terminalStatus: 'error',
        },
        persistenceFailed: finalEvent == null,
      }),
    );
    mockGenerationJobManager.finishTerminalJob.mockResolvedValue(undefined);
    mockGenerationJobManager.completeJob.mockResolvedValue(true);
    mockGenerationJobManager.failPausePersistence.mockResolvedValue(true);
    mockGenerationJobManager.approvals.resolve.mockResolvedValue(true);
    mockGenerationJobManager.approvals.ownsPausePersistence.mockResolvedValue(true);
    mockGenerationJobManager.approvals.finishPausePersistence.mockResolvedValue(true);

    // `decrementPendingRequest` runs in the controller's `finally` on every
    // post-ACK path, so resolving on it signals the async continuation is done.
    settled = new Promise((resolve) => {
      settle = resolve;
    });
    mockDecrementPendingRequest.mockImplementation(async () => {
      settle();
    });

    mockAddTitle = jest.fn().mockResolvedValue(undefined);
    mockInitializeClient = jest.fn(async ({ req, checkpointNamespace }) => {
      // Capture the request state the controller seeds BEFORE reconstruction.
      capturedInit = {
        parentMessageId: req.body.parentMessageId,
        files: req.body.files,
        isTemporary: req.body.isTemporary,
        conversationCreatedAt: req.conversationCreatedAt,
        timezone: req.body.timezone,
        checkpointNamespace,
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

    /**
     * `approvals.resolve` atomically records capability and flips the job to
     * running. Durable-arm reconstruction follows; ioredis queues rather than
     * rejects during an outage, so an unbounded await there would strand the
     * client after the action is already spent.
     */
    it('answers the resume even when steering bookkeeping never settles', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      let releaseRearm;
      mockGenerationJobManager.rearmQueuedPreempts.mockReturnValue(
        new Promise((resolve) => {
          releaseRearm = () => resolve(0);
        }),
      );

      try {
        const res = await post(approveBody());
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('resuming');
      } finally {
        releaseRearm?.();
        mockGenerationJobManager.rearmQueuedPreempts.mockResolvedValue(0);
      }
    }, 15000);

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

    it('fails closed when the stored job owner is missing', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(
        makeToolApprovalJob({ metadata: { userId: undefined } }),
      );

      const res = await post(approveBody());

      expect(res.status).toBe(403);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
      expect(mockInitializeClient).not.toHaveBeenCalled();
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

    it('409s a resume targeting a replaced generation before claiming the action', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());

      const res = await post(approveBody({ generationCreatedAt: 999 }));

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ code: 'RUN_REPLACED', generationProtocolVersion: 1 });
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
      expect(mockInitializeClient).not.toHaveBeenCalled();
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
      expect(mockGenerationJobManager.expireApproval).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        1000,
      );
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
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        { preemptCapable: true },
        1000,
      );
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

    it('400 when an ask_user_question answer exceeds the length cap', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeAskUserJob());
      const res = await post({
        conversationId: CONVO_ID,
        actionId: ACTION_ID,
        agent_id: AGENT_ID,
        endpoint: 'agents',
        answer: 'x'.repeat(16_001),
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/maximum length/i);
      expect(mockGenerationJobManager.approvals.resolve).not.toHaveBeenCalled();
    });

    it('400 when a batched answer omits a question or includes an unknown id', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeAskUserBatchJob());
      const missing = await post({
        conversationId: CONVO_ID,
        actionId: ACTION_ID,
        agent_id: AGENT_ID,
        endpoint: 'agents',
        answers: { environment: 'staging' },
      });
      expect(missing.status).toBe(400);
      expect(missing.body.error).toMatch(/every question/i);

      mockGenerationJobManager.getJob.mockResolvedValue(makeAskUserBatchJob());
      const extra = await post({
        conversationId: CONVO_ID,
        actionId: ACTION_ID,
        agent_id: AGENT_ID,
        endpoint: 'agents',
        answers: { environment: 'staging', window: '7d', region: 'us-east-2' },
      });
      expect(extra.status).toBe(400);
      expect(extra.body.error).toMatch(/unknown question id/i);
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
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        { preemptCapable: true },
        1000,
      );
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

    it('consumes a checkpoint-snapshot rejection on the 429 early-return path', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockCheckAndIncrementPendingRequest.mockResolvedValue({ allowed: false });
      mockCaptureAgentCheckpointGeneration.mockRejectedValue(new Error('mongo down'));

      const res = await post(approveBody());
      await flush();

      expect(res.status).toBe(429);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[ResumeAgentController] Failed to capture checkpoint generation',
        expect.any(Error),
      );
    });

    it('409 and releases the slot when the action was already claimed (single-winner)', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockGenerationJobManager.approvals.resolve.mockResolvedValue(false);
      const res = await post(approveBody());
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already resolved or has expired/i);
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        { preemptCapable: true },
        1000,
      );
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockInitializeClient).not.toHaveBeenCalled();
    });

    it('409s RUN_REPLACED when the generation changes before the resume CAS', async () => {
      const original = makeToolApprovalJob();
      mockGenerationJobManager.getJob
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(makeToolApprovalJob({ createdAt: 2000 }));
      mockGenerationJobManager.approvals.resolve.mockResolvedValue(false);

      const res = await post(approveBody({ generationCreatedAt: 1000 }));

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ code: 'RUN_REPLACED', generationProtocolVersion: 1 });
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        { preemptCapable: true },
        1000,
      );
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
        generationProtocolVersion: 1,
      });
      expect(mockCaptureAgentCheckpointGeneration).toHaveBeenCalledWith(CONVO_ID, {
        type: 'mongo',
      });
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        { preemptCapable: true },
        1000,
      );
      expect(mockCaptureAgentCheckpointGeneration.mock.invocationCallOrder[0]).toBeLessThan(
        mockGenerationJobManager.approvals.resolve.mock.invocationCallOrder[0],
      );
      await settled;
      await flush();
    });

    it('preserves and exactly echoes a paused generation protocol v2 marker', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(
        makeToolApprovalJob({ metadata: { generationProtocolVersion: 2 } }),
      );

      const res = await post(approveBody({ generationProtocolVersion: 2 }));

      expect(res.status).toBe(200);
      expect(res.headers['x-librechat-generation-protocol']).toBe('2');
      expect(res.body).toEqual({
        streamId: CONVO_ID,
        conversationId: CONVO_ID,
        status: 'resuming',
        generationProtocolVersion: 2,
      });
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

    it('reuses the persisted generation checkpoint namespace and keeps legacy fallback explicit', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(
        makeToolApprovalJob({ metadata: { checkpointNamespace: 'generation-1000' } }),
      );
      await post(approveBody());
      await settled;
      await flush();

      expect(capturedInit.checkpointNamespace).toBe('generation-1000');
      expect(mockCaptureAgentCheckpointGeneration).not.toHaveBeenCalled();
      expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(
        CONVO_ID,
        { type: 'mongo' },
        undefined,
        { checkpointNamespace: 'generation-1000' },
      );
    });

    it('passes persisted run steps into the rebuilt run for tool-result correlation', async () => {
      const runSteps = [
        {
          id: 'step-approval',
          index: 1,
          type: 'tool_calls',
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'tc1', name: 'approval_probe', args: '{}' }],
          },
          usage: null,
        },
      ];
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockGenerationJobManager.getResumeState.mockResolvedValue({
        aggregatedContent: [],
        runSteps,
      });

      await post(approveBody());
      await settled;
      await flush();

      const client = await mockInitializeClient.mock.results[0].value.then((r) => r.client);
      expect(client.resumeCompletion).toHaveBeenCalledWith(expect.objectContaining({ runSteps }));
    });

    it('reapplies retained ask answers before resuming a later tool approval', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(
        makeToolApprovalJob({
          metadata: {
            resolvedAskUserQuestions: [
              {
                request: 'Which environment?',
                output: 'staging',
                toolCallId: 'ask-1',
              },
            ],
          },
        }),
      );
      mockGenerationJobManager.getResumeState.mockResolvedValue({
        aggregatedContent: [
          {
            type: 'tool_call',
            tool_call: { id: 'ask-1', name: 'ask_user_question', args: '' },
          },
        ],
        runSteps: [],
      });

      await post(approveBody());
      await settled;
      await flush();

      const client = await mockInitializeClient.mock.results[0].value.then((r) => r.client);
      expect(client.resumeCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          seedContent: [
            expect.objectContaining({
              tool_call: expect.objectContaining({
                id: 'ask-1',
                args: JSON.stringify('Which environment?'),
                output: 'staging',
                progress: 1,
              }),
            }),
          ],
        }),
      );
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        { preemptCapable: true },
        1000,
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

    it.each([
      { stored: true, supplied: false },
      { stored: false, supplied: true },
    ])(
      'restores authoritative isTemporary=$stored before reconstruction',
      async ({ stored, supplied }) => {
        mockGenerationJobManager.getJob.mockResolvedValue(
          makeToolApprovalJob({ metadata: { isTemporary: stored } }),
        );

        const res = await post(approveBody({ isTemporary: supplied }));
        expect(res.status).toBe(200);
        await settled;

        expect(capturedInit.isTemporary).toBe(stored);
      },
    );

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

      const [, finalEvent] = mockGenerationJobManager.publishTerminalClaim.mock.calls[0];
      expect(finalEvent.requestMessage).toMatchObject({
        messageId: USER_MSG_ID,
        isCreatedByUser: true,
        files: [{ file_id: 'f1', filename: 'a.pdf' }],
      });
    });

    it('persists the response, claims terminal ownership, emits done, finishes, and prunes', async () => {
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
      const [terminalClaim, finalEvent] =
        mockGenerationJobManager.publishTerminalClaim.mock.calls[0];
      expect(terminalClaim).toMatchObject({ streamId: CONVO_ID, persistencePending: true });
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

      expect(mockGenerationJobManager.claimTerminalJob).toHaveBeenCalledWith(
        CONVO_ID,
        'complete',
        undefined,
        1000,
        { persistencePending: true },
      );
      const claim = await mockGenerationJobManager.claimTerminalJob.mock.results[0].value;
      expect(mockGenerationJobManager.finishTerminalJob).toHaveBeenCalledWith(claim);
      expect(mockGenerationJobManager.claimTerminalJob.mock.invocationCallOrder[0]).toBeLessThan(
        mockSaveMessage.mock.invocationCallOrder[0],
      );
      expect(mockSaveMessage.mock.invocationCallOrder[0]).toBeLessThan(
        mockGenerationJobManager.publishTerminalClaim.mock.invocationCallOrder[0],
      );
      expect(
        mockGenerationJobManager.publishTerminalClaim.mock.invocationCallOrder[0],
      ).toBeLessThan(mockGenerationJobManager.finishTerminalJob.mock.invocationCallOrder[0]);
      expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(
        CONVO_ID,
        { type: 'mongo' },
        { threadId: CONVO_ID, checkpointIds: ['checkpoint-old'] },
      );
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockDisposeClient).toHaveBeenCalledTimes(1);
    });

    it('publishes reconciliation instead of a normal FINAL when the resumed response save returns no row', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockGenerationJobManager.completeJob.mockResolvedValue(false);
      mockSaveMessage.mockResolvedValue(undefined);

      await post(approveBody());
      await settled;
      await flush();

      const claim = await mockGenerationJobManager.claimTerminalJob.mock.results[0].value;
      expect(mockGenerationJobManager.publishTerminalClaim).toHaveBeenCalledTimes(1);
      expect(mockGenerationJobManager.publishTerminalClaim).toHaveBeenCalledWith(claim, null);
      expect(mockGenerationJobManager.finishTerminalJob).toHaveBeenCalledWith(claim);
      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(
        CONVO_ID,
        'Resumed response could not be persisted before terminal publication',
        1000,
      );
      expect(mockDeleteAgentCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('degrades a failed checkpoint snapshot to scoped no-op cleanup', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockCaptureAgentCheckpointGeneration.mockRejectedValue(new Error('mongo down'));

      await post(approveBody());
      await settled;
      await flush();

      expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(
        CONVO_ID,
        { type: 'mongo' },
        { threadId: CONVO_ID, checkpointIds: [] },
      );
    });

    it('skips finalization when the job was replaced mid-resume', async () => {
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
      expect(mockGenerationJobManager.publishTerminalClaim).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.claimTerminalJob).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.finishTerminalJob).not.toHaveBeenCalled();
    });

    it('does not write a completed response when a pause or abort wins the terminal claim', async () => {
      const job = makeToolApprovalJob();
      mockGenerationJobManager.getJob.mockResolvedValue(job);
      let signalResumeBoundary;
      const resumeBoundary = new Promise((resolve) => {
        signalResumeBoundary = resolve;
      });
      let releaseResume;
      const resumeGate = new Promise((resolve) => {
        releaseResume = resolve;
      });
      const client = makeClient({
        resumeCompletion: jest.fn(async () => {
          signalResumeBoundary();
          await resumeGate;
        }),
      });
      mockInitializeClient.mockResolvedValue({ client, userMCPAuthMap: {} });

      await post(approveBody());
      await resumeBoundary;
      // Cross-replica Stop wins durably while its abort pub/sub is delayed, so
      // the local signal remains live and only the terminal CAS can fence this
      // resumed completion's Mongo write.
      mockGenerationJobManager.claimTerminalJob.mockResolvedValue(null);
      releaseResume();
      await settled;
      await flush();

      expect(job.abortController.signal.aborted).toBe(false);
      expect(mockGenerationJobManager.claimTerminalJob).toHaveBeenCalledWith(
        CONVO_ID,
        'complete',
        undefined,
        1000,
        { persistencePending: true },
      );
      expect(mockSaveMessage).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.publishTerminalClaim).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.finishTerminalJob).not.toHaveBeenCalled();
      expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
    });

    it('finishes a winning terminal claim even when FINAL publication throws', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockGenerationJobManager.publishTerminalClaim.mockRejectedValue(new Error('transport down'));

      await post(approveBody());
      await settled;
      await flush();

      const claim = await mockGenerationJobManager.claimTerminalJob.mock.results[0].value;
      expect(mockGenerationJobManager.finishTerminalJob).toHaveBeenCalledWith(claim);
      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(
        CONVO_ID,
        'transport down',
        1000,
      );
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

      const [, finalEvent] = mockGenerationJobManager.publishTerminalClaim.mock.calls[0];
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
      mockGenerationJobManager.getResumeState.mockResolvedValue({
        aggregatedContent: [
          {
            type: 'tool_call',
            tool_call: { id: 'older-ask', name: 'ask_user_question', args: '' },
          },
          {
            type: 'tool_call',
            tool_call: { id: 'current-ask', name: 'ask_user_question', args: '' },
          },
        ],
      });
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
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        {
          preemptCapable: true,
          resolvedAskUserQuestions: [
            {
              request: 'What should I name the file?',
              output: 'call it report.pdf',
              contentIndex: 1,
            },
          ],
        },
        1000,
      );
      expect(mockGenerationJobManager.claimTerminalJob).toHaveBeenCalledWith(
        CONVO_ID,
        'complete',
        undefined,
        1000,
        { persistencePending: true },
      );
    });

    it('retains an ID-less answer when earlier text exists but the ask part is missing', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeAskUserJob());
      mockGenerationJobManager.getResumeState.mockResolvedValue({
        aggregatedContent: [{ type: 'text', text: 'Let me check.' }],
      });

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
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        {
          preemptCapable: true,
          resolvedAskUserQuestions: [
            {
              request: 'What should I name the file?',
              output: 'call it report.pdf',
              contentMissing: true,
            },
          ],
        },
        1000,
      );
    });

    it('resumes a batched ask_user_question with answers keyed by question id', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeAskUserBatchJob());
      const answers = { environment: 'staging', window: '7d' };
      const res = await post({
        conversationId: CONVO_ID,
        actionId: ACTION_ID,
        agent_id: AGENT_ID,
        endpoint: 'agents',
        answers,
      });
      expect(res.status).toBe(200);
      await settled;
      await flush();

      const client = await mockInitializeClient.mock.results[0].value.then((r) => r.client);
      expect(client.resumeCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ resumeValue: { answers } }),
      );
      expect(mockGenerationJobManager.approvals.resolve).toHaveBeenCalledWith(
        CONVO_ID,
        ACTION_ID,
        {
          preemptCapable: true,
          resolvedAskUserQuestions: [
            {
              request: { questions: expect.any(Array) },
              output: JSON.stringify({ answers }),
              toolCallId: 'tc1',
            },
          ],
        },
        1000,
      );
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
      // Terminal ownership precedes title persistence and final stream publication.
      expect(mockGenerationJobManager.claimTerminalJob).toHaveBeenCalledWith(
        CONVO_ID,
        'complete',
        undefined,
        1000,
        { persistencePending: true },
      );
      expect(mockGenerationJobManager.claimTerminalJob.mock.invocationCallOrder[0]).toBeLessThan(
        mockAddTitle.mock.invocationCallOrder[0],
      );
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
      expect(mockGenerationJobManager.publishTerminalClaim).toHaveBeenCalledWith(
        expect.objectContaining({ streamId: CONVO_ID }),
        expect.any(Object),
      );
      expect(mockGenerationJobManager.finishTerminalJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-finalizing outcomes', () => {
    it('re-pause: does not finalize when the run pauses again', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({ pendingApproval: { actionId: NEXT_ACTION_ID } }),
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
      expect(mockGenerationJobManager.publishTerminalClaim).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.claimTerminalJob).not.toHaveBeenCalled();
      expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.approvals.ownsPausePersistence).toHaveBeenCalledWith(
        CONVO_ID,
        NEXT_ACTION_ID,
        1000,
      );
      expect(mockGenerationJobManager.approvals.finishPausePersistence).toHaveBeenCalledWith(
        CONVO_ID,
        NEXT_ACTION_ID,
        1000,
      );
      expect(mockGenerationJobManager.failPausePersistence).not.toHaveBeenCalled();
      // The slot is still released and the client disposed.
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockDisposeClient).toHaveBeenCalledTimes(1);
    });

    it('re-pause: persists the segment content (unfinished) so an expiring re-pause keeps it', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          pendingApproval: { actionId: NEXT_ACTION_ID },
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
      expect(mockGenerationJobManager.publishTerminalClaim).not.toHaveBeenCalled();
    });

    it('re-pause: persists artifacts produced before pausing again (unfinished)', async () => {
      const artifact = { type: 'image', file_id: 'seg-1' };
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          pendingApproval: { actionId: NEXT_ACTION_ID },
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
      expect(mockGenerationJobManager.publishTerminalClaim).not.toHaveBeenCalled();
      expect(mockSaveMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ attachments: [artifact], unfinished: true }),
        expect.objectContaining({
          context: 'api/server/controllers/agents/resume.js - re-pause progress persist',
        }),
      );
    });

    it('re-pause: holds the exact Stop/resume barrier until progress persistence settles', async () => {
      let signalSaveStarted;
      const saveStarted = new Promise((resolve) => {
        signalSaveStarted = resolve;
      });
      let releaseSave;
      const saveGate = new Promise((resolve) => {
        releaseSave = resolve;
      });
      mockSaveMessage.mockImplementation(async () => {
        signalSaveStarted();
        await saveGate;
        return {};
      });
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          pendingApproval: { actionId: NEXT_ACTION_ID },
          contentParts: [{ type: 'text', text: 'must be durable before another action' }],
        }),
        userMCPAuthMap: {},
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await saveStarted;

      expect(mockGenerationJobManager.approvals.ownsPausePersistence).toHaveBeenCalledWith(
        CONVO_ID,
        NEXT_ACTION_ID,
        1000,
      );
      expect(mockGenerationJobManager.approvals.finishPausePersistence).not.toHaveBeenCalled();
      expect(mockDecrementPendingRequest).not.toHaveBeenCalled();

      releaseSave();
      await settled;
      await flush();

      expect(mockGenerationJobManager.approvals.finishPausePersistence).toHaveBeenCalledWith(
        CONVO_ID,
        NEXT_ACTION_ID,
        1000,
      );
      expect(mockSaveMessage.mock.invocationCallOrder[0]).toBeLessThan(
        mockGenerationJobManager.approvals.finishPausePersistence.mock.invocationCallOrder[0],
      );
    });

    it('re-pause: terminalizes instead of exposing the next action when persistence fails', async () => {
      mockSaveMessage.mockRejectedValue(new Error('re-pause save failed'));
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          pendingApproval: { actionId: NEXT_ACTION_ID },
          contentParts: [{ type: 'text', text: 'progress that must not be lost' }],
        }),
        userMCPAuthMap: {},
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      await flush();

      expect(mockGenerationJobManager.failPausePersistence).toHaveBeenCalledWith(
        CONVO_ID,
        NEXT_ACTION_ID,
        're-pause save failed',
        1000,
      );
      expect(mockGenerationJobManager.approvals.finishPausePersistence).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
      expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(
        CONVO_ID,
        { type: 'mongo' },
        { threadId: CONVO_ID, checkpointIds: ['checkpoint-old'] },
      );
      expect(mockSaveMessage.mock.invocationCallOrder[0]).toBeLessThan(
        mockGenerationJobManager.failPausePersistence.mock.invocationCallOrder[0],
      );
    });

    it('re-pause: contains checkpoint deletion failure after exact persistence terminalization', async () => {
      const checkpointError = new Error('checkpoint delete unavailable');
      mockSaveMessage.mockRejectedValue(new Error('re-pause save failed'));
      mockDeleteAgentCheckpoint.mockRejectedValue(checkpointError);
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          pendingApproval: { actionId: NEXT_ACTION_ID },
          contentParts: [{ type: 'text', text: 'progress that must not be lost' }],
        }),
        userMCPAuthMap: {},
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      await flush();

      expect(mockGenerationJobManager.failPausePersistence).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[ResumeAgentController] Failed to prune checkpoint after re-pause persistence failure',
        checkpointError,
      );
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockDisposeClient).toHaveBeenCalledTimes(1);
    });

    it('re-pause: leaves a replacement checkpoint untouched when exact persistence failure loses ownership', async () => {
      mockSaveMessage.mockResolvedValue(undefined);
      mockGenerationJobManager.failPausePersistence.mockResolvedValue(false);
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          pendingApproval: { actionId: NEXT_ACTION_ID },
          contentParts: [{ type: 'text', text: 'stale segment progress' }],
        }),
        userMCPAuthMap: {},
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      await flush();

      expect(mockGenerationJobManager.failPausePersistence).toHaveBeenCalledWith(
        CONVO_ID,
        NEXT_ACTION_ID,
        'Re-pause response progress could not be persisted',
        1000,
      );
      expect(mockGenerationJobManager.approvals.finishPausePersistence).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
      expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
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
      expect(mockGenerationJobManager.publishTerminalClaim).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
    });

    it('resume failure delegates single-winner error publication and prunes the checkpoint', async () => {
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

      expect(mockGenerationJobManager.emitError).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(CONVO_ID, 'boom', 1000);
      expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(
        CONVO_ID,
        { type: 'mongo' },
        { threadId: CONVO_ID, checkpointIds: ['checkpoint-old'] },
      );
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockSaveMessage).not.toHaveBeenCalled();
    });

    it('contains checkpoint deletion failure after winning ordinary resume-error finalization', async () => {
      const checkpointError = new Error('checkpoint delete unavailable');
      mockDeleteAgentCheckpoint.mockRejectedValue(checkpointError);
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          resumeCompletion: jest.fn().mockRejectedValue(new Error('boom')),
        }),
        userMCPAuthMap: {},
      });

      const res = await post(approveBody());
      expect(res.status).toBe(200);
      await settled;
      await flush();

      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(CONVO_ID, 'boom', 1000);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[ResumeAgentController] Failed to prune checkpoint after failed resume finalization',
        checkpointError,
      );
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
      expect(mockDisposeClient).toHaveBeenCalledTimes(1);
    });

    it('keeps a re-pause checkpoint when failed-resume terminal ownership is lost', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(
        makeToolApprovalJob({ metadata: { checkpointNamespace: 'generation-1000' } }),
      );
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          resumeCompletion: jest.fn().mockRejectedValue(new Error('boom')),
        }),
        userMCPAuthMap: {},
      });
      // A fresh interrupt moved the same epoch back to requires_action before
      // the error path's terminal CAS. Its newly written checkpoint is live.
      mockGenerationJobManager.completeJob.mockResolvedValue(false);

      await post(approveBody());
      await settled;
      await flush();

      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(CONVO_ID, 'boom', 1000);
      expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
    });

    it('does not overwrite the job when guarded error finalization itself fails', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(makeToolApprovalJob());
      mockInitializeClient.mockResolvedValue({
        client: makeClient({
          resumeCompletion: jest.fn().mockRejectedValue(new Error('boom')),
        }),
        userMCPAuthMap: {},
      });
      // An unconditional fallback update could overwrite a pause or replacement
      // that won while completeJob was failing.
      mockGenerationJobManager.completeJob.mockRejectedValue(new Error('complete failed'));

      await post(approveBody());
      await settled;
      await flush();

      expect(mockJobStore.updateJob).not.toHaveBeenCalled();
      expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(USER_ID);
    });
  });
});
