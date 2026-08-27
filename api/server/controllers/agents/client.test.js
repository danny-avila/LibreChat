const mockCreateRun = jest.fn();
const mockCaptureAgentCheckpointGeneration = jest.fn();
const mockDeleteAgentCheckpoint = jest.fn();
const mockIsHITLEnabled = jest.fn().mockReturnValue(false);
const mockRecordCollectedUsage = jest.fn();
const mockDetachedUsageRecorder = jest.fn();
const mockCreateDetachedSubagentUsageRecorder = jest.fn(() => mockDetachedUsageRecorder);
const mockGetAgentCheckpointer = jest.fn();
const mockHasDurableAgentInterruptCheckpoint = jest.fn().mockResolvedValue(true);
const mockBuildAgentScopedContext = jest.fn((...args) =>
  jest.requireActual('@librechat/api').buildAgentScopedContext(...args),
);
const mockFormatAgentMessages = jest.fn(() => ({
  messages: [],
  indexTokenCountMap: {},
  summary: undefined,
  boundaryTokenAdjustment: undefined,
}));

const { Providers } = require('@librechat/agents');
const { Constants, ContentTypes, EModelEndpoint } = require('librechat-data-provider');
const {
  GenerationJobManager,
  createStreamServices,
  registerToolApprovalHook,
  clearToolApprovalHooks,
  getPluginHookSource,
  setPluginHookSource,
} = require('@librechat/api');
const BaseClient = require('~/app/clients/BaseClient');
const AgentClient = require('./client');
const { resolveConfigServers } = require('~/server/services/MCP');

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  createMetadataAggregator: () => ({
    handleLLMEnd: jest.fn(),
    collected: [],
  }),
  formatAgentMessages: (...args) => mockFormatAgentMessages(...args),
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  buildAgentScopedContext: (...args) => mockBuildAgentScopedContext(...args),
  checkAccess: jest.fn(),
  createRun: (...args) => mockCreateRun(...args),
  countFormattedMessageTokens: jest.fn(() => 42),
  countTokens: jest.fn((text) => Math.ceil(String(text ?? '').length / 4)),
  createCachedTokenCounter: jest.fn(async () => jest.fn(() => 0)),
  createDetachedSubagentUsageRecorder: (...args) =>
    mockCreateDetachedSubagentUsageRecorder(...args),
  captureAgentCheckpointGeneration: (...args) => mockCaptureAgentCheckpointGeneration(...args),
  deleteAgentCheckpoint: (...args) => mockDeleteAgentCheckpoint(...args),
  decrementPendingRequest: jest.fn(async () => {}),
  initializeAgent: jest.fn(),
  isHITLEnabled: (...args) => mockIsHITLEnabled(...args),
  createMemoryProcessor: jest.fn(),
  isMemoryAgentEnabled: jest.fn((config) => {
    if (!config || config.disabled === true) return false;
    const agent = config.agent;
    if (agent?.enabled !== true) return false;
    return Boolean(agent.id || (agent.provider && agent.model));
  }),
  loadAgent: jest.fn(),
  maybePrewarmCodeSandbox: jest.fn(),
  recordCollectedUsage: (...args) => mockRecordCollectedUsage(...args),
  getAgentCheckpointer: mockGetAgentCheckpointer,
  hasDurableAgentInterruptCheckpoint: (...args) => mockHasDurableAgentInterruptCheckpoint(...args),
}));

describe('AgentClient - final model-bound content protection', () => {
  const filters = {
    messages: {
      pii: {
        fields: ['text'],
        starterPatterns: [],
        customPatterns: [
          {
            id: 'provider-bound-secret',
            label: 'provider-bound secret',
            regex: 'PROVIDER-BOUND-[A-Z]+',
          },
        ],
      },
    },
  };

  const makeClient = () => {
    const client = Object.create(AgentClient.prototype);
    client.options = {
      resendFiles: true,
      req: { config: { filters } },
    };
    client.authorizedHistoricalFiles = new Map();
    client.setModelBoundStoredMessages([
      {
        role: 'user',
        isCreatedByUser: true,
        text: 'Old PROVIDER-BOUND-SECRET',
        messageId: 'pruned-source',
      },
      {
        role: 'user',
        isCreatedByUser: true,
        text: 'Safe retained text',
        messageId: 'retained-source',
      },
    ]);
    return client;
  };

  it('inspects only persisted source rows retained by the provider payload', () => {
    const callback = makeClient().createModelBoundChatModelCallback();

    expect(callback).toEqual(expect.objectContaining({ raiseError: true, awaitHandlers: true }));
    expect(() =>
      callback.handleChatModelStart(undefined, [
        [
          {
            role: 'user',
            content: 'Safe retained text',
            additional_kwargs: { sourceMessageId: 'retained-source' },
          },
        ],
      ]),
    ).not.toThrow();
    expect(() =>
      callback.handleChatModelStart(undefined, [
        [
          {
            role: 'user',
            content: 'Old PROVIDER-BOUND-SECRET',
            additional_kwargs: { sourceMessageId: 'pruned-source' },
          },
        ],
      ]),
    ).toThrow(expect.objectContaining({ code: 'content_filter_block' }));
  });

  it('inspects synthetic summarizer and mid-run model input without a source row', () => {
    const callback = makeClient().createModelBoundChatModelCallback();

    expect(() =>
      callback.handleChatModelStart(undefined, [
        [{ role: 'user', content: 'Synthetic PROVIDER-BOUND-SUMMARY input' }],
      ]),
    ).toThrow(expect.objectContaining({ code: 'content_filter_block' }));
  });

  it('preflights legacy restored history before user-message persistence', () => {
    const client = makeClient();
    client.options.req.config.messageFilter = {
      pii: {
        starterPatterns: [],
        customPatterns: [
          {
            id: 'legacy-provider-bound-secret',
            label: 'legacy provider-bound secret',
            regex: 'PROVIDER-BOUND-[A-Z]+',
          },
        ],
      },
    };

    expect(() => client.assertStoredModelBoundContent()).toThrow(
      expect.objectContaining({ code: 'content_filter_block' }),
    );
  });

  it('keeps source-aware restored history enforcement at the final provider boundary', () => {
    const client = makeClient();

    expect(() => client.assertStoredModelBoundContent()).not.toThrow();
  });

  it('allows safe restored history under legacy message filtering', () => {
    const client = makeClient();
    client.options.req.config.messageFilter = {
      pii: {
        starterPatterns: [],
        customPatterns: [
          {
            id: 'legacy-provider-bound-secret',
            label: 'legacy provider-bound secret',
            regex: 'PROVIDER-BOUND-[A-Z]+',
          },
        ],
      },
    };
    client.setModelBoundStoredMessages([
      {
        role: 'user',
        isCreatedByUser: true,
        text: 'Safe restored text',
        messageId: 'safe-source',
      },
    ]);

    expect(() => client.assertStoredModelBoundContent()).not.toThrow();
  });

  it('keeps materialized current attachments inspectable when historical replay is disabled', () => {
    const client = makeClient();
    const currentFile = {
      file_id: 'current-file',
      filename: 'safe.png',
      type: 'image/png',
      text: 'Safe current OCR content',
    };
    client.options.resendFiles = false;
    client.options.attachments = [
      { file_id: 'current-file', filename: 'safe.png', type: 'image/png' },
    ];
    client.modelBoundCurrentFiles = [currentFile];
    client.options.req.config.filters = {
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          uninspectable: 'block',
        },
      },
    };
    client.message_file_map = { 'retained-source': [currentFile] };

    expect(() =>
      client.createModelBoundChatModelCallback().handleChatModelStart(undefined, [
        [
          {
            role: 'user',
            content: 'Safe retained text',
            additional_kwargs: { sourceMessageId: 'retained-source' },
          },
        ],
      ]),
    ).not.toThrow();
  });
});

describe('AgentClient - detached subagent usage', () => {
  it('records each detached call from an immutable snapshot after parent disposal', async () => {
    mockRecordCollectedUsage.mockClear();
    mockCreateDetachedSubagentUsageRecorder.mockClear();
    mockDetachedUsageRecorder.mockClear();
    const client = Object.create(AgentClient.prototype);
    const childTokenConfig = { input: 1, output: 2 };
    client.user = 'user-123';
    client.conversationId = 'conversation-123';
    client.responseMessageId = 'response-123';
    client.model = 'primary-model';
    client.options = {
      req: { user: { id: 'request-user' } },
      agent: { model_parameters: { model: 'fallback-model' } },
      endpointTokenConfig: { input: 3, output: 4 },
      endpointTokenConfigByAgentId: new Map([['agent-child', childTokenConfig]]),
    };
    const balance = { enabled: true };
    const transactions = { enabled: true };
    const usage = {
      usage_type: 'subagent',
      input_tokens: 100,
      output_tokens: 20,
      agentId: 'agent-child',
    };

    const recordUsage = client.buildDetachedSubagentUsageRecorder(balance, transactions);
    client.user = null;
    client.conversationId = null;
    client.responseMessageId = null;
    client.model = null;
    client.options = null;

    await recordUsage(usage);

    expect(mockCreateDetachedSubagentUsageRecorder).toHaveBeenCalledTimes(1);
    const [deps, billing] = mockCreateDetachedSubagentUsageRecorder.mock.calls[0];
    expect(deps).toEqual({
      spendTokens: expect.any(Function),
      spendStructuredTokens: expect.any(Function),
      pricing: {
        getMultiplier: expect.any(Function),
        getCacheMultiplier: expect.any(Function),
      },
      bulkWriteOps: {
        insertMany: expect.any(Function),
        updateBalance: expect.any(Function),
      },
      isPrincipalActive: expect.any(Function),
    });
    expect(billing).toEqual({
      user: 'user-123',
      conversationId: 'conversation-123',
      model: 'primary-model',
      messageId: 'response-123',
      balance,
      transactions,
      endpointTokenConfig: { input: 3, output: 4 },
      endpointTokenConfigByAgentId: expect.any(Map),
    });
    expect(billing.endpointTokenConfigByAgentId.get('agent-child')).toBe(childTokenConfig);
    expect(mockDetachedUsageRecorder).toHaveBeenCalledWith(usage);
  });
});

describe('AgentClient - subagent parent persistence', () => {
  it('matches the graph starting wave for parallel roots and cyclic fallback', () => {
    expect(
      AgentClient.getStartingAgentIds([
        { id: 'agent-a', edges: [{ from: 'agent-a', to: 'agent-c' }] },
        { id: 'agent-b' },
        { id: 'agent-c' },
      ]),
    ).toEqual(['agent-a', 'agent-b']);
    expect(
      AgentClient.getStartingAgentIds([
        {
          id: 'agent-a',
          edges: [
            { from: 'agent-a', to: 'agent-b' },
            { from: 'agent-b', to: 'agent-a' },
          ],
        },
        { id: 'agent-b' },
      ]),
    ).toEqual(['agent-a']);
  });

  it('registers the parent user-message write before detached child dispatch can proceed', async () => {
    const userMessagePromise = Promise.resolve({
      message: { messageId: 'parent-user-message', conversationId: 'parent-conversation' },
    });
    const registerParentPersistence = jest.fn();
    const upstreamGetReqData = jest.fn();
    const baseSend = jest
      .spyOn(BaseClient.prototype, 'sendMessage')
      .mockImplementation(async (_message, opts) => {
        opts.getReqData({ userMessagePromise });
        return { ok: true };
      });
    const client = Object.create(AgentClient.prototype);
    client.options = {
      subagentTasks: {
        scopeId: 'trusted-parent-scope',
        store: { registerParentPersistence },
      },
    };

    await client.sendMessage('Start the parent turn.', { getReqData: upstreamGetReqData });

    expect(upstreamGetReqData).toHaveBeenCalledWith({ userMessagePromise });
    expect(registerParentPersistence).toHaveBeenCalledWith(
      'trusted-parent-scope',
      userMessagePromise,
    );
    baseSend.mockRestore();
  });
});

describe('AgentClient - label settlement', () => {
  it('drains a trailing fill enqueued by an in-flight reasoning revision', async () => {
    const client = Object.create(AgentClient.prototype);
    const first = deferred();
    const trailing = deferred();
    const scope = { closed: false, abort: new AbortController(), detach: jest.fn() };
    client.activityLabelScopes = [scope];
    client.pendingActivityLabelFills = [
      first.promise.finally(() => {
        client.pendingActivityLabelFills.push(trailing.promise);
      }),
    ];

    let settled = false;
    const settlement = client.settleActivityLabels(1_000).then(() => {
      settled = true;
    });
    first.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    expect(settled).toBe(false);
    trailing.resolve();
    await settlement;

    expect(scope.closed).toBe(false);
    expect(scope.detach).toHaveBeenCalledTimes(1);
    expect(client.pendingActivityLabelFills).toEqual([]);
  });
});

describe('AgentClient - reasoning label accounting', () => {
  function createReasoningLabelClient(generateReasoningLabel) {
    const client = Object.create(AgentClient.prototype);
    client.options = { req: { user: { id: 'user-123' } } };
    client.conversationId = 'conversation-123';
    client.parentMessageId = 'parent-123';
    client.responseMessageId = 'response-123';
    client.run = { generateReasoningLabel };
    client.resolveReasoningLabelLLM = jest.fn(async () => ({
      provider: Providers.OPENAI,
      clientOptions: { model: 'reasoning-label-model' },
      endpointTokenConfig: { input: 1, output: 2 },
      sameEndpoint: false,
    }));
    client.recordActivityLabelUsage = jest.fn(async () => undefined);
    return client;
  }

  it('estimates output tokens from the raw model completion before title normalization', async () => {
    const rawCompletion = 'Inspecting the cache race\nThis extra explanation also consumed tokens.';
    const client = createReasoningLabelClient(
      jest.fn(async ({ chainOptions }) => {
        const callback = chainOptions.callbacks[0];
        callback.handleChatModelStart(undefined, [[{ content: 'captured SDK prompt' }]]);
        callback.handleLLMEnd({
          generations: [
            [
              {
                text: rawCompletion,
                message: { content: [{ type: 'text', text: rawCompletion }] },
              },
            ],
          ],
        });
        return { label: 'Inspecting the cache race' };
      }),
    );

    const generated = await client.generateReasoningLabelViaRun({
      visibleReasoning: 'x'.repeat(500),
      reasoningStepId: 'reasoning-1',
      revision: 1,
      status: 'streaming',
      signal: new AbortController().signal,
    });
    await generated.collectUsage(generated.label);

    const usageCall = client.recordActivityLabelUsage.mock.calls[0];
    expect(usageCall[6]()).toEqual({
      promptText: 'captured SDK prompt',
      completionText: rawCompletion,
    });
    expect(usageCall[7]).toBe('reasoning-label');
  });

  it('falls back to the returned label when no raw completion callback is available', async () => {
    const client = createReasoningLabelClient(
      jest.fn(async () => ({ label: 'Inspecting the cache race' })),
    );

    const generated = await client.generateReasoningLabelViaRun({
      visibleReasoning: 'x'.repeat(500),
      reasoningStepId: 'reasoning-1',
      revision: 1,
      status: 'streaming',
      signal: new AbortController().signal,
    });
    await generated.collectUsage(generated.label);

    expect(client.recordActivityLabelUsage.mock.calls[0][6]()).toMatchObject({
      completionText: 'Inspecting the cache race',
    });
  });
});

describe('AgentClient - interrupt discovery persistence', () => {
  beforeEach(async () => {
    mockHasDurableAgentInterruptCheckpoint.mockClear();
    await GenerationJobManager.destroy();
    GenerationJobManager.configure({ ...createStreamServices(), cleanupOnComplete: false });
    GenerationJobManager.initialize();
  });

  afterEach(async () => {
    await GenerationJobManager.destroy();
  });

  it('makes the run discovery snapshot durable when the run pauses', async () => {
    const streamId = 'conversation-discovered-pause';
    const job = await GenerationJobManager.createJob(streamId, 'user-123', streamId);
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: { endpoint: EModelEndpoint.agents, agent_id: 'agent-123' },
        config: { endpoints: { [EModelEndpoint.agents]: {} } },
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
      },
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = streamId;
    client.responseMessageId = 'response-discovered-pause';
    client.jobCreatedAt = job.createdAt;

    await client.handleRunInterrupt(
      {
        getInterrupt: () => ({
          interruptId: 'ask-interrupt',
          threadId: streamId,
          payload: {
            type: 'ask_user_question',
            question: { question: 'Proceed?' },
          },
        }),
        getDiscoveredTools: () => ['save_issue_mcp_linear'],
        getRunMessages: () => [],
      },
      streamId,
    );

    const paused = await GenerationJobManager.getJob(streamId);
    expect(paused?.status).toBe('requires_action');
    expect(paused?.metadata.discoveredTools).toEqual(['save_issue_mcp_linear']);
  });

  it('caps an event-bound pause at the inherited binding deadline', async () => {
    const now = Date.now();
    const streamId = 'conversation-event-bound-pause';
    const job = await GenerationJobManager.createJob(streamId, 'user-123', streamId);
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: { endpoint: EModelEndpoint.agents, agent_id: 'agent-123' },
        config: { endpoints: { [EModelEndpoint.agents]: { checkpointer: { ttl: 3600 } } } },
        _agentEventBindingRetention: {
          /** RetentionMode.ALL conversations are not temporary but still have a deadline. */
          isTemporary: false,
          expiredAt: new Date(now + 5_000),
        },
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
      },
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = streamId;
    client.responseMessageId = 'response-event-bound-pause';
    client.jobCreatedAt = job.createdAt;

    await client.handleRunInterrupt(
      {
        getInterrupt: () => ({
          interruptId: 'ask-interrupt',
          threadId: streamId,
          payload: {
            type: 'ask_user_question',
            question: { question: 'Proceed?' },
          },
        }),
        getDiscoveredTools: () => [],
        getRunMessages: () => [],
      },
      streamId,
    );

    const paused = await GenerationJobManager.getJob(streamId);
    expect(paused?.metadata.pendingAction.expiresAt).toBeGreaterThanOrEqual(now + 4_900);
    expect(paused?.metadata.pendingAction.expiresAt).toBeLessThanOrEqual(now + 5_000);
  });

  it('does not expose an event-bound pause after its inherited deadline', async () => {
    const streamId = 'conversation-expired-event-bound-pause';
    const job = await GenerationJobManager.createJob(streamId, 'user-123', streamId);
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: { endpoint: EModelEndpoint.agents, agent_id: 'agent-123' },
        config: { endpoints: { [EModelEndpoint.agents]: { checkpointer: { ttl: 3600 } } } },
        _agentEventBindingRetention: {
          isTemporary: false,
          expiredAt: new Date(Date.now() - 1),
        },
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
      },
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = streamId;
    client.responseMessageId = 'response-expired-event-bound-pause';
    client.jobCreatedAt = job.createdAt;

    await expect(
      client.handleRunInterrupt(
        {
          getInterrupt: () => ({
            interruptId: 'ask-interrupt',
            threadId: streamId,
            payload: {
              type: 'ask_user_question',
              question: { question: 'Proceed?' },
            },
          }),
        },
        streamId,
      ),
    ).rejects.toMatchObject({ code: 'HITL_ACTION_EXPIRED' });
    const liveJob = await GenerationJobManager.getJob(streamId);
    expect(liveJob?.status).toBe('running');
    expect(liveJob?.metadata.pendingAction).toBeUndefined();
  });

  it('does not expose a scheduled pause without its shared action store', async () => {
    const streamId = 'scheduled-missing-shared-store';
    const job = await GenerationJobManager.createJob(streamId, 'user-123', streamId);
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: { endpoint: EModelEndpoint.agents, agent_id: 'agent-123' },
        config: { endpoints: { [EModelEndpoint.agents]: {} } },
        _isScheduledFire: true,
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
      },
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = streamId;
    client.responseMessageId = 'scheduled-missing-shared-store-response';
    client.jobCreatedAt = job.createdAt;
    client.checkpointNamespace = job.metadata.checkpointNamespace;

    await expect(
      client.handleRunInterrupt(
        {
          getInterrupt: () => ({
            interruptId: 'ask-interrupt',
            threadId: streamId,
            payload: {
              type: 'ask_user_question',
              question: { question: 'Proceed?' },
            },
          }),
        },
        streamId,
      ),
    ).rejects.toMatchObject({ code: 'SCHEDULED_HITL_REQUIRES_SHARED_STORE' });
    expect(mockHasDurableAgentInterruptCheckpoint).not.toHaveBeenCalled();
    await expect(GenerationJobManager.getJobStatus(streamId)).resolves.toBe('running');
  });

  it('does not expose a scheduled pause without its durable interrupt checkpoint', async () => {
    const isRedisSpy = jest.spyOn(GenerationJobManager, 'isRedis', 'get').mockReturnValue(true);
    const streamId = 'scheduled-missing-interrupt-checkpoint';
    const job = await GenerationJobManager.createJob(streamId, 'user-123', streamId);
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: { endpoint: EModelEndpoint.agents, agent_id: 'agent-123' },
        config: { endpoints: { [EModelEndpoint.agents]: {} } },
        _isScheduledFire: true,
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
      },
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = streamId;
    client.responseMessageId = 'scheduled-missing-checkpoint-response';
    client.jobCreatedAt = job.createdAt;
    client.checkpointNamespace = job.metadata.checkpointNamespace;
    mockHasDurableAgentInterruptCheckpoint.mockResolvedValueOnce(false);

    try {
      await expect(
        client.handleRunInterrupt(
          {
            getInterrupt: () => ({
              interruptId: 'ask-interrupt',
              checkpointId: 'checkpoint-current',
              checkpointNs: 'nested-agent',
              threadId: streamId,
              payload: {
                type: 'ask_user_question',
                question: { question: 'Proceed?' },
              },
            }),
          },
          streamId,
        ),
      ).rejects.toMatchObject({ code: 'HITL_CHECKPOINT_UNAVAILABLE' });
      expect(mockHasDurableAgentInterruptCheckpoint).toHaveBeenCalledWith(streamId, undefined, {
        checkpointNamespace: job.metadata.checkpointNamespace,
        checkpointId: 'checkpoint-current',
        checkpointNs: 'nested-agent',
        interruptId: 'ask-interrupt',
      });
      await expect(GenerationJobManager.getJobStatus(streamId)).resolves.toBe('running');
    } finally {
      isRedisSpy.mockRestore();
    }
  });
});

jest.mock('~/server/services/Config', () => ({
  getMCPServerTools: jest.fn(),
}));

jest.mock('~/server/services/MCP', () => ({
  resolveConfigServers: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/models', () => ({
  bulkInsertTransactions: jest.fn(),
  getCacheMultiplier: jest.fn(),
  getAgent: jest.fn(),
  getMultiplier: jest.fn(),
  getFiles: jest.fn(),
  getMessages: jest.fn(),
  getRoleByName: jest.fn(),
  getUserMemories: jest.fn(),
  getFormattedMemories: jest.fn(),
  isAgentTriggerPrincipalActive: jest.fn().mockResolvedValue(true),
  spendStructuredTokens: jest.fn(),
  spendTokens: jest.fn(),
  updateBalance: jest.fn(),
}));

// Mock getMCPManager
const mockFormatInstructions = jest.fn();
jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({
    formatInstructionsForContext: mockFormatInstructions,
  })),
}));

describe('AgentClient - applyHideSequentialOutputsFilter', () => {
  const textPart = (text) => ({ type: ContentTypes.TEXT, text });
  const toolCallPart = (id) => ({ type: ContentTypes.TOOL_CALL, tool_call: { id } });

  it('keeps only the last non-label part + tool_call parts when filtering is on', () => {
    const ctx = {
      options: { agent: { hide_sequential_outputs: true } },
      contentParts: [
        textPart('intermediate'),
        toolCallPart('tc1'),
        textPart('reasoning'),
        textPart('final'),
      ],
    };
    AgentClient.prototype.applyHideSequentialOutputsFilter.call(ctx);
    expect(ctx.contentParts).toEqual([toolCallPart('tc1'), textPart('final')]);
  });

  it('keeps the final text when a parent phase marker is appended after it', () => {
    const tool = toolCallPart('tc1');
    const final = textPart('final');
    const phase = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Completed the investigation',
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 2,
    };
    const ctx = {
      options: { agent: { hide_sequential_outputs: true } },
      contentParts: [textPart('intermediate'), tool, final, phase],
    };
    const previousParts = [...ctx.contentParts];

    AgentClient.prototype.applyHideSequentialOutputsFilter.call(ctx);
    AgentClient.prototype.rebaseActivityPhaseBounds.call(ctx, previousParts);

    expect(ctx.contentParts).toEqual([tool, final, phase]);
    expect(phase.activity_start_index).toBe(0);
    expect(phase.activity_end_index).toBe(1);
  });

  it('keeps an appended phase before the final text when all phase children are filtered', () => {
    const final = textPart('final');
    const phase = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Completed both reasoning activities',
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 2,
    };
    const ctx = {
      options: { agent: { hide_sequential_outputs: true } },
      contentParts: [
        { type: ContentTypes.THINK, think: 'first' },
        { type: ContentTypes.THINK, think: 'second' },
        final,
        phase,
      ],
    };
    const previousParts = [...ctx.contentParts];

    AgentClient.prototype.applyHideSequentialOutputsFilter.call(ctx);
    AgentClient.prototype.rebaseActivityPhaseBounds.call(ctx, previousParts);

    expect(ctx.contentParts).toEqual([final, phase]);
    expect(phase.activity_start_index).toBe(0);
    expect(phase.activity_end_index).toBe(0);
  });

  it('is a no-op when hide_sequential_outputs is off', () => {
    const parts = [textPart('a'), textPart('b')];
    const ctx = { options: { agent: { hide_sequential_outputs: false } }, contentParts: parts };
    AgentClient.prototype.applyHideSequentialOutputsFilter.call(ctx);
    expect(ctx.contentParts).toEqual([textPart('a'), textPart('b')]);
  });

  it('rebases phase bounds across skill prepends and sequential filtering', () => {
    const reasoning = { type: ContentTypes.THINK, think: 'checking' };
    const activityTool = toolCallPart('activity-tool');
    const phase = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Resolved the session issue',
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 2,
    };
    const final = textPart('final');
    const previousParts = [reasoning, activityTool, phase, final];
    const skillCard = toolCallPart('manual-skill');
    const ctx = {
      options: { agent: { hide_sequential_outputs: true } },
      contentParts: [skillCard, ...previousParts],
    };

    AgentClient.prototype.applyHideSequentialOutputsFilter.call(ctx);
    AgentClient.prototype.rebaseActivityPhaseBounds.call(ctx, previousParts);

    expect(ctx.contentParts).toEqual([skillCard, activityTool, phase, final]);
    expect(phase.activity_start_index).toBe(1);
    expect(phase.activity_end_index).toBe(2);
  });

  it('rebases phase bounds over reshaped sparse content without retaining holes', () => {
    const reasoning = { type: ContentTypes.THINK, think: 'planning' };
    const toolCall = toolCallPart('tc-sparse');
    const phase = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Searched for tools',
      activity_label_type: 'phase',
      activity_start_index: 1,
    };
    const final = textPart('answer');
    const contentParts = [];
    contentParts[0] = reasoning;
    contentParts[2] = toolCall;
    contentParts[3] = phase;
    contentParts[4] = final;
    const previousParts = [...contentParts];
    const ctx = { options: { agent: {} }, contentParts: [toolCall, phase, final] };

    expect(() =>
      AgentClient.prototype.rebaseActivityPhaseBounds.call(ctx, previousParts),
    ).not.toThrow();
    expect(phase.activity_start_index).toBe(0);
  });

  it('rebases explicit bounds using only defined sparse slots', () => {
    const toolCall = toolCallPart('tc-large-sparse');
    const phase = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Searched the sparse transcript',
      activity_label_type: 'phase',
      activity_start_index: 5,
      activity_end_index: 999_999,
    };
    const previousParts = [];
    previousParts[5] = toolCall;
    previousParts[999_999] = phase;
    const ctx = { options: { agent: {} }, contentParts: [toolCall, phase] };

    AgentClient.prototype.rebaseActivityPhaseBounds.call(ctx, previousParts);

    expect(phase.activity_start_index).toBe(0);
    expect(phase.activity_end_index).toBe(1);
  });

  it('preserves a sparse phase reservation when completion does not reshape content', () => {
    const firstTool = toolCallPart('tool-1');
    const secondTool = toolCallPart('tool-2');
    const firstLabel = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Recorded the first result',
      tool_call_ids: ['tool-1'],
    };
    const secondLabel = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Recorded the second result',
      tool_call_ids: ['tool-2'],
    };
    const phase = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Verified both results',
      activity_label_type: 'phase',
      activity_start_index: 0,
    };
    const final = { type: ContentTypes.TEXT, text: 'Final answer', phase: 'final_answer' };
    const contentParts = [];
    contentParts[1] = { type: ContentTypes.TEXT, text: '', phase: 'final_answer' };
    contentParts[2] = firstLabel;
    contentParts[3] = secondTool;
    contentParts[4] = secondLabel;
    contentParts[5] = phase;
    contentParts[6] = final;
    const previousParts = [...contentParts];
    const ctx = { options: { agent: {} }, contentParts };

    AgentClient.prototype.rebaseActivityPhaseBounds.call(ctx, previousParts);
    expect(phase.activity_start_index).toBe(0);

    contentParts[0] = firstTool;
    const phaseChildren = contentParts.slice(
      phase.activity_start_index,
      contentParts.indexOf(phase),
    );
    expect(phaseChildren.map((part) => part?.tool_call?.id).filter(Boolean)).toEqual([
      'tool-1',
      'tool-2',
    ]);
  });
});

describe('AgentClient - activity phase completion', () => {
  it('completes an uninterrupted root run', () => {
    const complete = jest.fn();
    AgentClient.prototype.completeActivityPhase.call(
      {},
      { getInterrupt: () => undefined },
      { complete },
    );
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('retains phase state when the root run pauses for HITL', () => {
    const complete = jest.fn();
    AgentClient.prototype.completeActivityPhase.call(
      {},
      { getInterrupt: () => ({ payload: { type: 'tool_approval' } }) },
      { complete },
    );
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('AgentClient - startup telemetry', () => {
  afterEach(() => {
    clearToolApprovalHooks();
    mockIsHITLEnabled.mockReturnValue(false);
    jest.restoreAllMocks();
  });

  it('refuses scheduled pause-capable runs before provider startup without Redis', async () => {
    mockIsHITLEnabled.mockReturnValue(false);
    const createRunBefore = mockCreateRun.mock.calls.length;
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: {},
        config: { endpoints: { [EModelEndpoint.agents]: {} } },
        _isScheduledFire: true,
        _resumableStreamId: 'scheduled-hitl-no-redis',
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
        tools: [{ name: 'ask_user_question' }],
      },
      endpointTokenConfig: {},
      eventHandlers: {},
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = 'scheduled-hitl-no-redis';
    client.responseMessageId = 'scheduled-hitl-response';
    client.parentMessageId = 'scheduled-hitl-parent';

    await expect(client.chatCompletion({ payload: [] })).rejects.toMatchObject({
      code: 'SCHEDULED_HITL_REQUIRES_SHARED_STORE',
      message: expect.stringContaining('USE_REDIS_STREAMS=true'),
    });
    expect(mockCreateRun).toHaveBeenCalledTimes(createRunBefore);
  });

  it('includes host-generated background tools in scheduled pause admission', async () => {
    const createRunBefore = mockCreateRun.mock.calls.length;
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: {},
        config: {
          endpoints: {
            [EModelEndpoint.agents]: {
              toolApproval: {
                enabled: true,
                mode: 'bypass',
                ask: ['check_background_task'],
              },
            },
          },
        },
        _isScheduledFire: true,
        _resumableStreamId: 'scheduled-background-tool',
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
        tools: [{ name: 'read_file' }],
      },
      subagentTasks: {},
      endpointTokenConfig: {},
      eventHandlers: {},
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = 'scheduled-background-tool';
    client.responseMessageId = 'scheduled-background-response';
    client.parentMessageId = 'scheduled-background-parent';

    await expect(client.chatCompletion({ payload: [] })).rejects.toMatchObject({
      code: 'SCHEDULED_HITL_REQUIRES_SHARED_STORE',
    });
    expect(mockCreateRun).toHaveBeenCalledTimes(createRunBefore);
  });

  it.each([
    {
      name: 'a bypass-only approval policy',
      toolApproval: { enabled: true, mode: 'bypass' },
      subagentAgentConfigs: undefined,
    },
    {
      name: 'an approval rule that matches no selected tool',
      toolApproval: { enabled: true, mode: 'bypass', ask: ['approval_probe'] },
      subagentAgentConfigs: undefined,
    },
    {
      name: 'ask_user_question denied by the approval policy',
      toolApproval: { enabled: true, deny: ['ask_*'] },
      primaryTools: [{ name: 'ask_user_question' }],
      subagentAgentConfigs: undefined,
    },
    {
      name: 'ask_user_question on a nested subagent only',
      toolApproval: undefined,
      subagentAgentConfigs: [
        {
          id: 'nested-agent',
          tools: [{ name: 'ask_user_question' }],
        },
      ],
    },
  ])(
    'does not reject scheduled runs for $name',
    async ({ toolApproval, primaryTools, subagentAgentConfigs }) => {
      mockDeleteAgentCheckpoint.mockReset().mockResolvedValue(undefined);
      const processStream = jest.fn().mockResolvedValue();
      mockCreateRun.mockResolvedValueOnce({
        Graph: null,
        processStream,
        getCalibrationRatio: jest.fn(() => 0),
        getInterrupt: jest.fn(() => undefined),
      });
      const createRunBefore = mockCreateRun.mock.calls.length;
      const client = new AgentClient({
        req: {
          user: { id: 'user-123' },
          body: {},
          config: { endpoints: { [EModelEndpoint.agents]: { toolApproval } } },
          _isScheduledFire: true,
          _resumableStreamId: 'scheduled-non-pausing-policy',
        },
        res: {},
        agent: {
          id: 'agent-123',
          endpoint: EModelEndpoint.openAI,
          provider: EModelEndpoint.openAI,
          model_parameters: { model: 'gpt-4' },
          hide_sequential_outputs: false,
          tools: primaryTools ?? [{ name: 'read_file' }],
          subagentAgentConfigs,
        },
        endpointTokenConfig: {},
        eventHandlers: {},
        contentParts: [],
        collectedUsage: [],
        artifactPromises: [],
      });
      client.conversationId = 'scheduled-non-pausing-policy';
      client.checkpointNamespace = 'scheduled-non-pausing-generation';
      client.responseMessageId = 'scheduled-non-pausing-response';
      client.parentMessageId = 'scheduled-non-pausing-parent';
      client.recordCollectedUsage = jest.fn().mockResolvedValue();

      await expect(client.chatCompletion({ payload: [] })).resolves.toBeUndefined();
      expect(mockCreateRun).toHaveBeenCalledTimes(createRunBefore + 1);
      expect(processStream).toHaveBeenCalledTimes(1);
      if (toolApproval?.enabled === true) {
        expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(
          'scheduled-non-pausing-policy',
          undefined,
          undefined,
          {
            throwOnError: true,
            checkpointNamespace: 'scheduled-non-pausing-generation',
          },
        );
      } else {
        expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
      }
    },
  );

  it('uses request-scoped hook resolution when deciding whether a scheduled run can pause', async () => {
    mockIsHITLEnabled.mockReturnValue(true);
    registerToolApprovalHook((context) =>
      context.userId === 'different-user' ? async () => ({ decision: 'ask' }) : undefined,
    );
    const processStream = jest.fn().mockResolvedValue();
    mockCreateRun.mockResolvedValueOnce({
      Graph: null,
      processStream,
      getCalibrationRatio: jest.fn(() => 0),
      getInterrupt: jest.fn(() => undefined),
    });
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: {},
        config: {
          endpoints: {
            [EModelEndpoint.agents]: {
              toolApproval: { enabled: true, mode: 'bypass' },
            },
          },
        },
        _isScheduledFire: true,
        _resumableStreamId: 'scheduled-request-scoped-hook',
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
        hide_sequential_outputs: false,
        tools: [{ name: 'read_file' }],
      },
      endpointTokenConfig: {},
      eventHandlers: {},
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = 'scheduled-request-scoped-hook';
    client.checkpointNamespace = 'scheduled-request-scoped-generation';
    client.responseMessageId = 'scheduled-request-scoped-response';
    client.parentMessageId = 'scheduled-request-scoped-parent';
    client.recordCollectedUsage = jest.fn().mockResolvedValue();

    await expect(client.chatCompletion({ payload: [] })).resolves.toBeUndefined();
    expect(mockCreateRun.mock.calls.at(-1)?.[0]?.resolvedToolApprovalHooks).toEqual([]);
  });

  it('admits deployment PreToolUse hooks as pause-capable for scheduled runs', async () => {
    mockIsHITLEnabled.mockReturnValue(true);
    const previousSource = getPluginHookSource();
    setPluginHookSource({
      hasHooks: () => true,
      hasToolApprovalHooks: () => true,
      register: () => 1,
    });
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: {},
        config: {
          endpoints: {
            [EModelEndpoint.agents]: {
              toolApproval: { enabled: true, mode: 'bypass' },
            },
          },
        },
        _isScheduledFire: true,
        _resumableStreamId: 'scheduled-deployment-hook',
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
        tools: [{ name: 'write_file' }],
      },
      endpointTokenConfig: {},
      eventHandlers: {},
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = 'scheduled-deployment-hook';
    client.responseMessageId = 'scheduled-deployment-response';
    client.parentMessageId = 'scheduled-deployment-parent';

    try {
      await expect(client.chatCompletion({ payload: [] })).rejects.toMatchObject({
        code: 'SCHEDULED_HITL_REQUIRES_SHARED_STORE',
      });
    } finally {
      setPluginHookSource(previousSource);
    }
  });

  it('overlaps run creation with checkpoint pruning and joins both before stream processing', async () => {
    let releaseCheckpoint;
    let checkpointStarted;
    const runCreation = deferred();
    const checkpointStartedPromise = new Promise((resolve) => {
      checkpointStarted = resolve;
    });
    const checkpointPromise = new Promise((resolve) => {
      releaseCheckpoint = resolve;
    });
    const processStream = jest.fn().mockResolvedValue();
    const run = {
      Graph: null,
      processStream,
      getCalibrationRatio: jest.fn(() => 0),
    };
    const startupTelemetry = {
      mark: jest.fn(),
      setStreamId: jest.fn(),
      recordGenerationEvent: jest.fn(),
      end: jest.fn(),
    };
    mockCreateRun.mockReturnValue(runCreation.promise);
    mockIsHITLEnabled.mockReturnValue(true);
    mockDeleteAgentCheckpoint.mockImplementation(() => {
      checkpointStarted();
      return checkpointPromise;
    });

    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: {},
        config: {
          endpoints: { [EModelEndpoint.agents]: { toolApproval: { enabled: true } } },
        },
        _resumableStreamId: 'conversation-123',
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
        hide_sequential_outputs: false,
        tools: [{ name: 'write_file' }],
      },
      endpointTokenConfig: {},
      eventHandlers: {},
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
      startupTelemetry,
      checkpointNamespace: '1000',
    });
    client.conversationId = 'conversation-123';
    client.responseMessageId = 'response-123';
    client.parentMessageId = 'parent-123';
    client.recordCollectedUsage = jest.fn().mockResolvedValue();

    const completionPromise = client.chatCompletion({ payload: [] });
    await checkpointStartedPromise;

    expect(mockCreateRun).toHaveBeenCalledTimes(1);
    expect(mockCreateRun.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        modelCallbacks: [
          expect.objectContaining({
            name: 'librechat-model-bound-content-filter',
            raiseError: true,
          }),
        ],
      }),
    );
    expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(
      'conversation-123',
      undefined,
      undefined,
      { throwOnError: true, checkpointNamespace: '1000' },
    );
    expect(startupTelemetry.mark.mock.calls.map(([milestone]) => milestone)).toEqual([
      'run_input_prepared',
    ]);
    expect(processStream).not.toHaveBeenCalled();

    runCreation.resolve(run);
    await Promise.resolve();

    expect(startupTelemetry.mark.mock.calls.map(([milestone]) => milestone)).toEqual([
      'run_input_prepared',
      'run_created',
    ]);
    expect(processStream).not.toHaveBeenCalled();

    releaseCheckpoint();
    await completionPromise;

    expect(startupTelemetry.mark.mock.calls.map(([milestone]) => milestone)).toEqual([
      'run_input_prepared',
      'run_created',
      'stream_processing_started',
    ]);
    expect(processStream).toHaveBeenCalledTimes(1);
    expect(processStream.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        configurable: expect.objectContaining({
          thread_id: 'conversation-123',
          checkpoint_ns: '',
          __librechat_checkpoint_ns: '1000',
        }),
      }),
    );
    expect(processStream.mock.calls[0][1]).not.toHaveProperty('callbacks');
  });

  it('propagates final model callback policy errors instead of persisting a generic error part', async () => {
    jest.clearAllMocks();
    let policyError;
    try {
      require('@librechat/api').assertModelBoundContent({
        filters: {
          messages: {
            pii: {
              fields: ['text'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-BLOCK' }],
            },
          },
        },
        storedMessages: [{ role: 'user', isCreatedByUser: true, text: 'PRIVATE-BLOCK' }],
      });
    } catch (error) {
      policyError = error;
    }
    expect(policyError).toEqual(expect.objectContaining({ code: 'content_filter_block' }));

    const processStream = jest.fn().mockRejectedValue(policyError);
    mockCreateRun.mockResolvedValue({
      Graph: null,
      processStream,
      getCalibrationRatio: jest.fn(() => 0),
    });
    mockIsHITLEnabled.mockReturnValue(false);
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: {},
        config: { endpoints: { [EModelEndpoint.agents]: {} } },
        _resumableStreamId: 'conversation-policy',
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
        hide_sequential_outputs: false,
      },
      endpointTokenConfig: {},
      eventHandlers: {},
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = 'conversation-policy';
    client.responseMessageId = 'response-policy';
    client.parentMessageId = 'parent-policy';
    client.recordCollectedUsage = jest.fn().mockResolvedValue();

    await expect(client.chatCompletion({ payload: [] })).rejects.toBe(policyError);
    expect(client.contentParts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: ContentTypes.ERROR })]),
    );
  });

  it('rehydrates a warm event actor from its fork and injects only the new event message', async () => {
    jest.clearAllMocks();
    const history = { _getType: () => 'human', content: 'old turn' };
    const currentEvent = { _getType: () => 'human', content: 'new event' };
    mockFormatAgentMessages.mockReturnValueOnce({
      messages: [history, currentEvent],
      indexTokenCountMap: { 0: 11, 1: 22 },
      summary: { text: 'summary of earlier turns', tokenCount: 40 },
      boundaryTokenAdjustment: undefined,
    });
    const processStream = jest.fn().mockResolvedValue();
    mockCreateRun.mockResolvedValue({
      Graph: null,
      processStream,
      getCalibrationRatio: jest.fn(() => 0),
    });
    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: {},
        config: { endpoints: { [EModelEndpoint.agents]: {} } },
        _resumableStreamId: 'conversation-123',
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
        hide_sequential_outputs: false,
      },
      endpointTokenConfig: {},
      eventHandlers: {},
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = 'conversation-123';
    client.responseMessageId = 'response-123';
    client.parentMessageId = 'parent-123';
    client.checkpointNamespace = 'event-actor/fork';
    client.eventActorCheckpointId = 'checkpoint-base';
    client.eventActorInvocationId = 'event-2';
    client.eventActorContinuation = 'warm';
    client.recordCollectedUsage = jest.fn().mockResolvedValue();

    await client.chatCompletion({ payload: [] });

    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [history, currentEvent],
        eventActorCheckpointing: true,
        /** The DB-derived token map is positional over full history, which a
         * checkpoint-restored graph state no longer matches. It must be blank
         * so the pruner recounts against the messages actually in state. The
         * cross-run summary stays: it summarizes pre-boundary turns that were
         * excluded from the history the committed checkpoint was built from. */
        indexTokenCountMap: {},
        initialSummary: { text: 'summary of earlier turns', tokenCount: 40 },
      }),
    );
    expect(processStream).toHaveBeenCalledWith(
      { messages: [currentEvent] },
      expect.objectContaining({
        configurable: expect.objectContaining({
          thread_id: 'conversation-123',
          checkpoint_id: 'checkpoint-base',
          __librechat_checkpoint_ns: 'event-actor/fork',
          __librechat_event_actor_invocation_id: 'event-2',
          event_actor_invocation_id: 'event-2',
          event_actor_depth: 1,
        }),
      }),
      expect.anything(),
    );
    expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
  });

  it('does not expose or process a fresh graph when strict checkpoint pruning fails', async () => {
    jest.clearAllMocks();
    const checkpointGeneration = {
      threadId: 'conversation-123',
      checkpointIds: ['legacy-root', 'legacy-child'],
    };
    const processStream = jest.fn().mockResolvedValue();
    const run = {
      Graph: { id: 'must-not-be-exposed' },
      processStream,
      getCalibrationRatio: jest.fn(() => 0),
    };
    mockCreateRun.mockResolvedValue(run);
    mockIsHITLEnabled.mockReturnValue(true);
    mockCaptureAgentCheckpointGeneration.mockResolvedValue(checkpointGeneration);
    mockDeleteAgentCheckpoint.mockRejectedValue(new Error('checkpoint prune failed'));
    jest.spyOn(GenerationJobManager, 'getJobStore').mockReturnValue({
      getJob: jest.fn().mockResolvedValue({ createdAt: 1000, status: 'running' }),
    });

    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: {},
        config: {
          endpoints: { [EModelEndpoint.agents]: { toolApproval: { enabled: true } } },
        },
        _resumableStreamId: 'conversation-123',
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
        hide_sequential_outputs: false,
        tools: [{ name: 'write_file' }],
      },
      endpointTokenConfig: {},
      eventHandlers: {},
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
      startupTelemetry: {
        mark: jest.fn(),
        setStreamId: jest.fn(),
        recordGenerationEvent: jest.fn(),
        end: jest.fn(),
      },
    });
    client.conversationId = 'conversation-123';
    client.jobCreatedAt = 1000;
    client.responseMessageId = 'response-123';
    client.parentMessageId = 'parent-123';
    client.recordCollectedUsage = jest.fn().mockResolvedValue();

    await client.chatCompletion({ payload: [] });

    expect(mockDeleteAgentCheckpoint).toHaveBeenCalledWith(
      'conversation-123',
      undefined,
      checkpointGeneration,
      { throwOnError: true },
    );
    expect(processStream).not.toHaveBeenCalled();
    expect(client.run).not.toBe(run);
    expect(client.contentParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          [ContentTypes.ERROR]: expect.stringContaining('checkpoint prune failed'),
        }),
      ]),
    );
  });

  it('does not let a stale v1 fresh prune delete a paused v2 replacement generation', async () => {
    jest.clearAllMocks();
    const checkpointGeneration = {
      threadId: 'conversation-123',
      checkpointIds: ['legacy-root', 'legacy-child'],
    };
    const processStream = jest.fn().mockResolvedValue();
    const run = {
      Graph: { id: 'stale-v1-graph' },
      processStream,
      getCalibrationRatio: jest.fn(() => 0),
    };
    mockCreateRun.mockResolvedValue(run);
    mockIsHITLEnabled.mockReturnValue(true);
    mockCaptureAgentCheckpointGeneration.mockResolvedValue(checkpointGeneration);
    const getJob = jest.fn().mockResolvedValue({
      createdAt: 2000,
      status: 'requires_action',
      checkpointNamespace: '2000',
    });
    jest.spyOn(GenerationJobManager, 'getJobStore').mockReturnValue({ getJob });

    const client = new AgentClient({
      req: {
        user: { id: 'user-123' },
        body: {},
        config: {
          endpoints: { [EModelEndpoint.agents]: { toolApproval: { enabled: true } } },
        },
        _resumableStreamId: 'conversation-123',
      },
      res: {},
      agent: {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
        hide_sequential_outputs: false,
        tools: [{ name: 'write_file' }],
      },
      endpointTokenConfig: {},
      eventHandlers: {},
      contentParts: [],
      collectedUsage: [],
      artifactPromises: [],
    });
    client.conversationId = 'conversation-123';
    client.jobCreatedAt = 1000;
    client.responseMessageId = 'response-123';
    client.parentMessageId = 'parent-123';
    client.recordCollectedUsage = jest.fn().mockResolvedValue();

    await client.chatCompletion({ payload: [] });

    expect(mockCaptureAgentCheckpointGeneration).toHaveBeenCalledWith(
      'conversation-123',
      undefined,
      { throwOnError: true },
    );
    expect(getJob).toHaveBeenCalledTimes(1);
    expect(mockDeleteAgentCheckpoint).not.toHaveBeenCalled();
    expect(processStream).not.toHaveBeenCalled();
    expect(client.run).not.toBe(run);
    expect(client.contentParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          [ContentTypes.ERROR]: expect.stringContaining(
            'Generation replaced before legacy checkpoint cleanup',
          ),
        }),
      ]),
    );
  });
});

describe('AgentClient - titleConvo', () => {
  let client;
  let mockRun;
  let mockReq;
  let mockRes;
  let mockAgent;
  let mockOptions;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock run object
    mockRun = {
      generateTitle: jest.fn().mockResolvedValue({
        title: 'Generated Title',
      }),
    };

    // Mock agent - with both endpoint and provider
    mockAgent = {
      id: 'agent-123',
      endpoint: EModelEndpoint.openAI, // Use a valid provider as endpoint for getProviderConfig
      provider: EModelEndpoint.openAI, // Add provider property
      model_parameters: {
        model: 'gpt-4',
      },
    };

    // Mock request and response
    mockReq = {
      user: {
        id: 'user-123',
      },
      body: {
        model: 'gpt-4',
        endpoint: EModelEndpoint.openAI,
        key: null,
      },
      config: {
        endpoints: {
          [EModelEndpoint.openAI]: {
            // Match the agent endpoint
            titleModel: 'gpt-3.5-turbo',
            titlePrompt: 'Custom title prompt',
            titleMethod: 'structured',
            titlePromptTemplate: 'Template: {{content}}',
          },
        },
      },
    };

    mockRes = {};

    // Mock options
    mockOptions = {
      req: mockReq,
      res: mockRes,
      agent: mockAgent,
      endpointTokenConfig: {},
    };

    // Create client instance
    client = new AgentClient(mockOptions);
    client.run = mockRun;
    client.responseMessageId = 'response-123';
    client.conversationId = 'convo-123';
    client.contentParts = [{ type: 'text', text: 'Test content' }];
    client.recordCollectedUsage = jest.fn().mockResolvedValue(); // Mock as async function that resolves
  });

  describe('titleConvo method', () => {
    it('should throw error if run is not initialized', async () => {
      client.run = null;

      await expect(
        client.titleConvo({ text: 'Test', abortController: new AbortController() }),
      ).rejects.toThrow('Run not initialized');
    });

    it('waits for the run in immediate mode instead of throwing', async () => {
      client.run = null;
      const abortController = new AbortController();

      const titlePromise = client.titleConvo({ text: 'Test', abortController, immediate: true });

      // Simulate `chatCompletion` assigning the run (client.js: `this.run = run`).
      client.run = mockRun;
      client._resolveRun(mockRun);

      await titlePromise;
      expect(mockRun.generateTitle).toHaveBeenCalled();
    });

    it('passes empty contentParts in immediate mode (title from the user input only)', async () => {
      client.contentParts = [{ type: 'text', text: 'Streaming response so far' }];
      const abortController = new AbortController();

      await client.titleConvo({ text: 'Hello there', abortController, immediate: true });

      const call = mockRun.generateTitle.mock.calls[0][0];
      expect(call.contentParts).toEqual([]);
      expect(call.inputText).toBe('Hello there');
    });

    it('uses live contentParts in non-immediate (final) mode', async () => {
      client.contentParts = [{ type: 'text', text: 'Full response' }];
      const abortController = new AbortController();

      await client.titleConvo({ text: 'Hello there', abortController });

      const call = mockRun.generateTitle.mock.calls[0][0];
      expect(call.contentParts).toEqual([{ type: 'text', text: 'Full response' }]);
    });

    it('rejects promptly when aborted before the run initializes in immediate mode', async () => {
      client.run = null;
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        client.titleConvo({ text: 'Test', abortController, immediate: true }),
      ).rejects.toThrow('Aborted before run initialization');
      expect(mockRun.generateTitle).not.toHaveBeenCalled();
    });

    it('should use titlePrompt from endpoint config', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titlePrompt: 'Custom title prompt',
        }),
      );
    });

    it('should use titlePromptTemplate from endpoint config', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titlePromptTemplate: 'Template: {{content}}',
        }),
      );
    });

    it('should use titleMethod from endpoint config', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: Providers.OPENAI,
          titleMethod: 'structured',
        }),
      );
    });

    it('should use titleModel from endpoint config when provided', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Check that generateTitle was called with correct clientOptions
      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-3.5-turbo');
    });

    it('preserves Anthropic custom headers on title requests despite omitTitleOptions', async () => {
      const prevKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      try {
        const req = {
          user: { id: 'user-123' },
          body: { model: 'claude-sonnet-4-5', endpoint: EModelEndpoint.anthropic, key: null },
          config: {
            endpoints: {
              [EModelEndpoint.anthropic]: {
                headers: { 'X-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}' },
              },
            },
          },
        };
        const agent = {
          id: 'agent-anthropic',
          endpoint: EModelEndpoint.anthropic,
          provider: EModelEndpoint.anthropic,
          model_parameters: { model: 'claude-sonnet-4-5' },
        };
        const anthropicClient = new AgentClient({ req, res: {}, agent, endpointTokenConfig: {} });
        anthropicClient.run = mockRun;
        anthropicClient.responseMessageId = 'response-123';
        anthropicClient.conversationId = 'convo-123';
        anthropicClient.contentParts = [{ type: 'text', text: 'Test content' }];
        anthropicClient.recordCollectedUsage = jest.fn().mockResolvedValue();

        await anthropicClient.titleConvo({ text: 'Hello', abortController: new AbortController() });

        const defaultHeaders =
          mockRun.generateTitle.mock.calls[0][0].clientOptions?.clientOptions?.defaultHeaders;
        // Custom header survives the `omitTitleOptions` strip and resolves the conversationId
        expect(defaultHeaders?.['X-Conversation-Id']).toBe('convo-123');
        // Provider-managed beta header is preserved alongside it
        expect(defaultHeaders?.['anthropic-beta']).toBeDefined();
      } finally {
        if (prevKey === undefined) {
          delete process.env.ANTHROPIC_API_KEY;
        } else {
          process.env.ANTHROPIC_API_KEY = prevKey;
        }
      }
    });

    it('should handle missing endpoint config gracefully', async () => {
      // Remove endpoint config
      mockReq.config = { endpoints: {} };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titlePrompt: undefined,
          titlePromptTemplate: undefined,
          titleMethod: undefined,
        }),
      );
    });

    it('should use agent model when titleModel is not provided', async () => {
      // Remove titleModel from config
      mockReq.config = {
        endpoints: {
          [EModelEndpoint.openAI]: {
            titlePrompt: 'Custom title prompt',
            titleMethod: 'structured',
            titlePromptTemplate: 'Template: {{content}}',
            // titleModel is omitted
          },
        },
      };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-4'); // Should use agent's model
    });

    it('should not use titleModel when it equals CURRENT_MODEL constant', async () => {
      mockReq.config = {
        endpoints: {
          [EModelEndpoint.openAI]: {
            titleModel: Constants.CURRENT_MODEL,
            titlePrompt: 'Custom title prompt',
            titleMethod: 'structured',
            titlePromptTemplate: 'Template: {{content}}',
          },
        },
      };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-4'); // Should use agent's model
    });

    it('should pass all required parameters to generateTitle', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(mockRun.generateTitle).toHaveBeenCalledWith({
        provider: expect.any(String),
        inputText: text,
        contentParts: client.contentParts,
        clientOptions: expect.objectContaining({
          model: 'gpt-3.5-turbo',
        }),
        titlePrompt: 'Custom title prompt',
        titlePromptTemplate: 'Template: {{content}}',
        titleMethod: 'structured',
        chainOptions: expect.objectContaining({
          signal: abortController.signal,
        }),
      });
    });

    it('should record collected usage after title generation', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      expect(client.recordCollectedUsage).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        context: 'title',
        collectedUsage: expect.any(Array),
        balance: {
          enabled: false,
        },
        transactions: {
          enabled: true,
        },
        messageId: 'response-123',
      });
    });

    it('should return the generated title', async () => {
      const text = 'Test conversation text';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      expect(result).toBe('Generated Title');
    });

    it('should sanitize the generated title by removing think blocks', async () => {
      const titleWithThinkBlock = '<think>reasoning about the title</think> User Hi Greeting';
      mockRun.generateTitle.mockResolvedValue({
        title: titleWithThinkBlock,
      });

      const text = 'Test conversation text';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      // Should remove the <think> block and return only the clean title
      expect(result).toBe('User Hi Greeting');
      expect(result).not.toContain('<think>');
      expect(result).not.toContain('</think>');
    });

    it('should return fallback title when sanitization results in empty string', async () => {
      const titleOnlyThinkBlock = '<think>only reasoning no actual title</think>';
      mockRun.generateTitle.mockResolvedValue({
        title: titleOnlyThinkBlock,
      });

      const text = 'Test conversation text';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      // Should return the fallback title since sanitization would result in empty string
      expect(result).toBe('Untitled Conversation');
    });

    it('does not log provider error content when title generation fails', async () => {
      const { logger } = require('@librechat/data-schemas');
      const privateValue = 'PRIVATE-TITLE-PROMPT';
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
      mockRun.generateTitle.mockRejectedValue(
        Object.assign(new Error(`Provider echoed ${privateValue}`), {
          code: 'ERR_REMOTE',
          response: { status: 422, data: { prompt: privateValue } },
        }),
      );

      const text = 'Test conversation text';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      expect(result).toBeUndefined();
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(privateValue);
      expect(errorSpy).toHaveBeenCalledWith(
        '[api/server/controllers/agents/client.js #titleConvo] Error',
        expect.objectContaining({ type: 'Error' }),
      );
      errorSpy.mockRestore();
    });

    it('should skip title generation when titleConvo is set to false', async () => {
      // Set titleConvo to false in endpoint config
      mockReq.config = {
        endpoints: {
          [EModelEndpoint.openAI]: {
            titleConvo: false,
            titleModel: 'gpt-3.5-turbo',
            titlePrompt: 'Custom title prompt',
            titleMethod: 'structured',
            titlePromptTemplate: 'Template: {{content}}',
          },
        },
      };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      // Should return undefined without generating title
      expect(result).toBeUndefined();

      // generateTitle should NOT have been called
      expect(mockRun.generateTitle).not.toHaveBeenCalled();

      // recordCollectedUsage should NOT have been called
      expect(client.recordCollectedUsage).not.toHaveBeenCalled();
    });

    it('should skip title generation for temporary chats', async () => {
      // Set isTemporary to true
      mockReq.body.isTemporary = true;

      const text = 'Test temporary chat';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      // Should return undefined without generating title
      expect(result).toBeUndefined();

      // generateTitle should NOT have been called
      expect(mockRun.generateTitle).not.toHaveBeenCalled();

      // recordCollectedUsage should NOT have been called
      expect(client.recordCollectedUsage).not.toHaveBeenCalled();
    });

    it('should skip title generation when titleConvo is false in all config', async () => {
      // Set titleConvo to false in "all" config
      mockReq.config = {
        endpoints: {
          all: {
            titleConvo: false,
            titleModel: 'gpt-4o-mini',
            titlePrompt: 'All config title prompt',
            titleMethod: 'completion',
            titlePromptTemplate: 'All config template',
          },
        },
      };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      // Should return undefined without generating title
      expect(result).toBeUndefined();

      // generateTitle should NOT have been called
      expect(mockRun.generateTitle).not.toHaveBeenCalled();

      // recordCollectedUsage should NOT have been called
      expect(client.recordCollectedUsage).not.toHaveBeenCalled();
    });

    it('should skip title generation when titleConvo is false for custom endpoint scenario', async () => {
      // This test validates the behavior when customEndpointConfig (retrieved via
      // getProviderConfig for custom endpoints) has titleConvo: false.
      //
      // The code path is:
      // 1. endpoints?.all is checked (undefined in this test)
      // 2. endpoints?.[endpoint] is checked (our test config)
      // 3. Would fall back to titleProviderConfig.customEndpointConfig (for real custom endpoints)
      //
      // We simulate a custom endpoint scenario using a dynamically named endpoint config

      // Create a unique endpoint name that represents a custom endpoint
      const customEndpointName = 'customEndpoint';

      // Configure the endpoint to have titleConvo: false
      // This simulates what would be in customEndpointConfig for a real custom endpoint
      mockReq.config = {
        endpoints: {
          // No 'all' config - so it will check endpoints[endpoint]
          // This config represents what customEndpointConfig would contain
          [customEndpointName]: {
            titleConvo: false,
            titleModel: 'custom-model-v1',
            titlePrompt: 'Custom endpoint title prompt',
            titleMethod: 'completion',
            titlePromptTemplate: 'Custom template: {{content}}',
            baseURL: 'https://api.custom-llm.com/v1',
            apiKey: 'test-custom-key',
            // Additional custom endpoint properties
            models: {
              default: ['custom-model-v1', 'custom-model-v2'],
            },
          },
        },
      };

      // Set up agent to use our custom endpoint
      // Use openAI as base but override with custom endpoint name for this test
      mockAgent.endpoint = EModelEndpoint.openAI;
      mockAgent.provider = EModelEndpoint.openAI;

      // Override the endpoint in the config to point to our custom config
      mockReq.config.endpoints[EModelEndpoint.openAI] =
        mockReq.config.endpoints[customEndpointName];
      delete mockReq.config.endpoints[customEndpointName];

      const text = 'Test custom endpoint conversation';
      const abortController = new AbortController();

      const result = await client.titleConvo({ text, abortController });

      // Should return undefined without generating title because titleConvo is false
      expect(result).toBeUndefined();

      // generateTitle should NOT have been called
      expect(mockRun.generateTitle).not.toHaveBeenCalled();

      // recordCollectedUsage should NOT have been called
      expect(client.recordCollectedUsage).not.toHaveBeenCalled();
    });

    it('should pass titleEndpoint configuration to generateTitle', async () => {
      // Mock the API key just for this test
      const originalApiKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-api-key';

      // Add titleEndpoint to the config
      mockReq.config = {
        endpoints: {
          [EModelEndpoint.openAI]: {
            titleModel: 'gpt-3.5-turbo',
            titleEndpoint: EModelEndpoint.anthropic,
            titleMethod: 'structured',
            titlePrompt: 'Custom title prompt',
            titlePromptTemplate: 'Custom template',
          },
        },
      };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Verify generateTitle was called with the custom configuration
      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titleMethod: 'structured',
          provider: Providers.ANTHROPIC,
          titlePrompt: 'Custom title prompt',
          titlePromptTemplate: 'Custom template',
        }),
      );

      // Restore the original API key
      if (originalApiKey) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('should use all config when endpoint config is missing', async () => {
      // Set 'all' config without endpoint-specific config
      mockReq.config = {
        endpoints: {
          all: {
            titleModel: 'gpt-4o-mini',
            titlePrompt: 'All config title prompt',
            titleMethod: 'completion',
            titlePromptTemplate: 'All config template: {{content}}',
          },
        },
      };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Verify generateTitle was called with 'all' config values
      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titleMethod: 'completion',
          titlePrompt: 'All config title prompt',
          titlePromptTemplate: 'All config template: {{content}}',
        }),
      );

      // Check that the model was set from 'all' config
      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-4o-mini');
    });

    it('should prioritize all config over endpoint config for title settings', async () => {
      // Set both endpoint and 'all' config
      mockReq.config = {
        endpoints: {
          [EModelEndpoint.openAI]: {
            titleModel: 'gpt-3.5-turbo',
            titlePrompt: 'Endpoint title prompt',
            titleMethod: 'structured',
            // titlePromptTemplate is omitted to test fallback
          },
          all: {
            titleModel: 'gpt-4o-mini',
            titlePrompt: 'All config title prompt',
            titleMethod: 'completion',
            titlePromptTemplate: 'All config template',
          },
        },
      };

      const text = 'Test conversation text';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Verify 'all' config takes precedence over endpoint config
      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          titleMethod: 'completion',
          titlePrompt: 'All config title prompt',
          titlePromptTemplate: 'All config template',
        }),
      );

      // Check that the model was set from 'all' config
      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('gpt-4o-mini');
    });

    it('should use all config with titleEndpoint and verify provider switch', async () => {
      // Mock the API key for the titleEndpoint provider
      const originalApiKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      // Set comprehensive 'all' config with all new title options
      mockReq.config = {
        endpoints: {
          all: {
            titleConvo: true,
            titleModel: 'claude-3-haiku-20240307',
            titleMethod: 'completion', // Testing the new default method
            titlePrompt: 'Generate a concise, descriptive title for this conversation',
            titlePromptTemplate: 'Conversation summary: {{content}}',
            titleEndpoint: EModelEndpoint.anthropic, // Should switch provider to Anthropic
          },
        },
      };

      const text = 'Test conversation about AI and machine learning';
      const abortController = new AbortController();

      await client.titleConvo({ text, abortController });

      // Verify all config values were used
      expect(mockRun.generateTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: Providers.ANTHROPIC, // Critical: Verify provider switched to Anthropic
          titleMethod: 'completion',
          titlePrompt: 'Generate a concise, descriptive title for this conversation',
          titlePromptTemplate: 'Conversation summary: {{content}}',
          inputText: text,
          contentParts: client.contentParts,
        }),
      );

      // Verify the model was set from 'all' config
      const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
      expect(generateTitleCall.clientOptions.model).toBe('claude-3-haiku-20240307');

      // Verify other client options are set correctly
      expect(generateTitleCall.clientOptions).toMatchObject({
        model: 'claude-3-haiku-20240307',
        // Note: Anthropic's getOptions may set its own maxTokens value
      });

      // Restore the original API key
      if (originalApiKey) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('should test all titleMethod options from all config', async () => {
      // Test each titleMethod: 'completion', 'functions', 'structured'
      const titleMethods = ['completion', 'functions', 'structured'];

      for (const method of titleMethods) {
        // Clear previous calls
        mockRun.generateTitle.mockClear();

        // Set 'all' config with specific titleMethod
        mockReq.config = {
          endpoints: {
            all: {
              titleModel: 'gpt-4o-mini',
              titleMethod: method,
              titlePrompt: `Testing ${method} method`,
              titlePromptTemplate: `Template for ${method}: {{content}}`,
            },
          },
        };

        const text = `Test conversation for ${method} method`;
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify the correct titleMethod was used
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            titleMethod: method,
            titlePrompt: `Testing ${method} method`,
            titlePromptTemplate: `Template for ${method}: {{content}}`,
          }),
        );
      }
    });

    describe('Azure-specific title generation', () => {
      let originalEnv;

      beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Save original environment variables
        originalEnv = { ...process.env };

        // Mock Azure API keys
        process.env.AZURE_OPENAI_API_KEY = 'test-azure-key';
        process.env.AZURE_API_KEY = 'test-azure-key';
        process.env.EASTUS_API_KEY = 'test-eastus-key';
        process.env.EASTUS2_API_KEY = 'test-eastus2-key';
      });

      afterEach(() => {
        // Restore environment variables
        process.env = originalEnv;
      });

      it('should use OPENAI provider for Azure serverless endpoints', async () => {
        // Set up Azure endpoint with serverless config
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockReq.config = {
          endpoints: {
            [EModelEndpoint.azureOpenAI]: {
              titleConvo: true,
              titleModel: 'grok-3',
              titleMethod: 'completion',
              titlePrompt: 'Azure serverless title prompt',
              streamRate: 35,
              modelGroupMap: {
                'grok-3': {
                  group: 'Azure AI Foundry',
                  deploymentName: 'grok-3',
                },
              },
              groupMap: {
                'Azure AI Foundry': {
                  apiKey: '${AZURE_API_KEY}',
                  baseURL: 'https://test.services.ai.azure.com/models',
                  version: '2024-05-01-preview',
                  serverless: true,
                  models: {
                    'grok-3': {
                      deploymentName: 'grok-3',
                    },
                  },
                },
              },
            },
          },
        };
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'grok-3';

        const text = 'Test Azure serverless conversation';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify provider was switched to OPENAI for serverless
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: Providers.OPENAI, // Should be OPENAI for serverless
            titleMethod: 'completion',
            titlePrompt: 'Azure serverless title prompt',
          }),
        );
      });

      it('should use AZURE provider for Azure endpoints with instanceName', async () => {
        // Set up Azure endpoint
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockReq.config = {
          endpoints: {
            [EModelEndpoint.azureOpenAI]: {
              titleConvo: true,
              titleModel: 'gpt-4o',
              titleMethod: 'structured',
              titlePrompt: 'Azure instance title prompt',
              streamRate: 35,
              modelGroupMap: {
                'gpt-4o': {
                  group: 'eastus',
                  deploymentName: 'gpt-4o',
                },
              },
              groupMap: {
                eastus: {
                  apiKey: '${EASTUS_API_KEY}',
                  instanceName: 'region-instance',
                  version: '2024-02-15-preview',
                  models: {
                    'gpt-4o': {
                      deploymentName: 'gpt-4o',
                    },
                  },
                },
              },
            },
          },
        };
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'gpt-4o';

        const text = 'Test Azure instance conversation';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify provider remains AZURE with instanceName
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: Providers.AZURE,
            titleMethod: 'structured',
            titlePrompt: 'Azure instance title prompt',
          }),
        );
      });

      it('should handle Azure titleModel with CURRENT_MODEL constant', async () => {
        // Set up Azure endpoint
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockAgent.model_parameters.model = 'gpt-4o-latest';
        mockReq.config = {
          endpoints: {
            [EModelEndpoint.azureOpenAI]: {
              titleConvo: true,
              titleModel: Constants.CURRENT_MODEL,
              titleMethod: 'functions',
              streamRate: 35,
              modelGroupMap: {
                'gpt-4o-latest': {
                  group: 'region-eastus',
                  deploymentName: 'gpt-4o-mini',
                  version: '2024-02-15-preview',
                },
              },
              groupMap: {
                'region-eastus': {
                  apiKey: '${EASTUS2_API_KEY}',
                  instanceName: 'test-instance',
                  version: '2024-12-01-preview',
                  models: {
                    'gpt-4o-latest': {
                      deploymentName: 'gpt-4o-mini',
                      version: '2024-02-15-preview',
                    },
                  },
                },
              },
            },
          },
        };
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'gpt-4o-latest';

        const text = 'Test Azure current model';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify it uses the correct model when titleModel is CURRENT_MODEL
        const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
        // When CURRENT_MODEL is used with Azure, the model gets mapped to the deployment name
        // In this case, 'gpt-4o-latest' is mapped to 'gpt-4o-mini' deployment
        expect(generateTitleCall.clientOptions.model).toBe('gpt-4o-mini');
        // Also verify that CURRENT_MODEL constant was not passed as the model
        expect(generateTitleCall.clientOptions.model).not.toBe(Constants.CURRENT_MODEL);
      });

      it('should handle Azure with multiple model groups', async () => {
        // Set up Azure endpoint
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockReq.config = {
          endpoints: {
            [EModelEndpoint.azureOpenAI]: {
              titleConvo: true,
              titleModel: 'o1-mini',
              titleMethod: 'completion',
              streamRate: 35,
              modelGroupMap: {
                'gpt-4o': {
                  group: 'eastus',
                  deploymentName: 'gpt-4o',
                },
                'o1-mini': {
                  group: 'region-eastus',
                  deploymentName: 'o1-mini',
                },
                'codex-mini': {
                  group: 'codex-mini',
                  deploymentName: 'codex-mini',
                },
              },
              groupMap: {
                eastus: {
                  apiKey: '${EASTUS_API_KEY}',
                  instanceName: 'region-eastus',
                  version: '2024-02-15-preview',
                  models: {
                    'gpt-4o': {
                      deploymentName: 'gpt-4o',
                    },
                  },
                },
                'region-eastus': {
                  apiKey: '${EASTUS2_API_KEY}',
                  instanceName: 'region-eastus2',
                  version: '2024-12-01-preview',
                  models: {
                    'o1-mini': {
                      deploymentName: 'o1-mini',
                    },
                  },
                },
                'codex-mini': {
                  apiKey: '${AZURE_API_KEY}',
                  baseURL: 'https://example.cognitiveservices.azure.com/openai/',
                  version: '2025-04-01-preview',
                  serverless: true,
                  models: {
                    'codex-mini': {
                      deploymentName: 'codex-mini',
                    },
                  },
                },
              },
            },
          },
        };
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'o1-mini';

        const text = 'Test Azure multi-group conversation';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify correct model and provider are used
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: Providers.AZURE,
            titleMethod: 'completion',
          }),
        );

        const generateTitleCall = mockRun.generateTitle.mock.calls[0][0];
        expect(generateTitleCall.clientOptions.model).toBe('o1-mini');
        expect(generateTitleCall.clientOptions.maxTokens).toBeUndefined(); // o1 models shouldn't have maxTokens
      });

      it('should use all config as fallback for Azure endpoints', async () => {
        // Set up Azure endpoint with minimal config
        mockAgent.endpoint = EModelEndpoint.azureOpenAI;
        mockAgent.provider = EModelEndpoint.azureOpenAI;
        mockReq.body.endpoint = EModelEndpoint.azureOpenAI;
        mockReq.body.model = 'gpt-4';

        // Set 'all' config as fallback with a serverless Azure config
        mockReq.config = {
          endpoints: {
            all: {
              titleConvo: true,
              titleModel: 'gpt-4',
              titleMethod: 'structured',
              titlePrompt: 'Fallback title prompt from all config',
              titlePromptTemplate: 'Template: {{content}}',
              modelGroupMap: {
                'gpt-4': {
                  group: 'default-group',
                  deploymentName: 'gpt-4',
                },
              },
              groupMap: {
                'default-group': {
                  apiKey: '${AZURE_API_KEY}',
                  baseURL: 'https://default.openai.azure.com/',
                  version: '2024-02-15-preview',
                  serverless: true,
                  models: {
                    'gpt-4': {
                      deploymentName: 'gpt-4',
                    },
                  },
                },
              },
            },
          },
        };

        const text = 'Test Azure with all config fallback';
        const abortController = new AbortController();

        await client.titleConvo({ text, abortController });

        // Verify all config is used
        expect(mockRun.generateTitle).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: Providers.OPENAI, // Should be OPENAI when no instanceName
            titleMethod: 'structured',
            titlePrompt: 'Fallback title prompt from all config',
            titlePromptTemplate: 'Template: {{content}}',
          }),
        );
      });
    });
  });

  describe('getOptions method - GPT-5+ model handling', () => {
    let mockReq;
    let mockRes;
    let mockAgent;
    let mockOptions;

    beforeEach(() => {
      jest.clearAllMocks();

      mockAgent = {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: {
          model: 'gpt-5',
        },
      };

      mockReq = {
        app: {
          locals: {},
        },
        user: {
          id: 'user-123',
        },
      };

      mockRes = {};

      mockOptions = {
        req: mockReq,
        res: mockRes,
        agent: mockAgent,
      };

      client = new AgentClient(mockOptions);
    });

    it('should move maxTokens to modelKwargs.max_completion_tokens for GPT-5 models', () => {
      const clientOptions = {
        model: 'gpt-5',
        maxTokens: 2048,
        temperature: 0.7,
      };

      // Simulate the getOptions logic that handles GPT-5+ models
      if (/\bgpt-[5-9](?:\.\d+)?\b/i.test(clientOptions.model) && clientOptions.maxTokens != null) {
        clientOptions.modelKwargs = clientOptions.modelKwargs ?? {};
        clientOptions.modelKwargs.max_completion_tokens = clientOptions.maxTokens;
        delete clientOptions.maxTokens;
      }

      expect(clientOptions.maxTokens).toBeUndefined();
      expect(clientOptions.modelKwargs).toBeDefined();
      expect(clientOptions.modelKwargs.max_completion_tokens).toBe(2048);
      expect(clientOptions.temperature).toBe(0.7); // Other options should remain
    });

    it('should move maxTokens to modelKwargs.max_output_tokens for GPT-5 models with useResponsesApi', () => {
      const clientOptions = {
        model: 'gpt-5',
        maxTokens: 2048,
        temperature: 0.7,
        useResponsesApi: true,
      };

      if (/\bgpt-[5-9](?:\.\d+)?\b/i.test(clientOptions.model) && clientOptions.maxTokens != null) {
        clientOptions.modelKwargs = clientOptions.modelKwargs ?? {};
        const paramName =
          clientOptions.useResponsesApi === true ? 'max_output_tokens' : 'max_completion_tokens';
        clientOptions.modelKwargs[paramName] = clientOptions.maxTokens;
        delete clientOptions.maxTokens;
      }

      expect(clientOptions.maxTokens).toBeUndefined();
      expect(clientOptions.modelKwargs).toBeDefined();
      expect(clientOptions.modelKwargs.max_output_tokens).toBe(2048);
      expect(clientOptions.temperature).toBe(0.7); // Other options should remain
    });

    it('should handle GPT-5+ models with existing modelKwargs', () => {
      const clientOptions = {
        model: 'gpt-6',
        maxTokens: 1500,
        temperature: 0.8,
        modelKwargs: {
          customParam: 'value',
        },
      };

      // Simulate the getOptions logic
      if (/\bgpt-[5-9](?:\.\d+)?\b/i.test(clientOptions.model) && clientOptions.maxTokens != null) {
        clientOptions.modelKwargs = clientOptions.modelKwargs ?? {};
        clientOptions.modelKwargs.max_completion_tokens = clientOptions.maxTokens;
        delete clientOptions.maxTokens;
      }

      expect(clientOptions.maxTokens).toBeUndefined();
      expect(clientOptions.modelKwargs).toEqual({
        customParam: 'value',
        max_completion_tokens: 1500,
      });
    });

    it('should not modify maxTokens for non-GPT-5+ models', () => {
      const clientOptions = {
        model: 'gpt-4',
        maxTokens: 2048,
        temperature: 0.7,
      };

      // Simulate the getOptions logic
      if (/\bgpt-[5-9](?:\.\d+)?\b/i.test(clientOptions.model) && clientOptions.maxTokens != null) {
        clientOptions.modelKwargs = clientOptions.modelKwargs ?? {};
        clientOptions.modelKwargs.max_completion_tokens = clientOptions.maxTokens;
        delete clientOptions.maxTokens;
      }

      // Should not be modified since it's GPT-4
      expect(clientOptions.maxTokens).toBe(2048);
      expect(clientOptions.modelKwargs).toBeUndefined();
    });

    it('should handle various GPT-5+ model formats', () => {
      const testCases = [
        { model: 'gpt-5.1', shouldTransform: true },
        { model: 'gpt-5.1-chat-latest', shouldTransform: true },
        { model: 'gpt-5.1-codex', shouldTransform: true },
        { model: 'gpt-5', shouldTransform: true },
        { model: 'gpt-5-turbo', shouldTransform: true },
        { model: 'gpt-6', shouldTransform: true },
        { model: 'gpt-7-preview', shouldTransform: true },
        { model: 'gpt-8', shouldTransform: true },
        { model: 'gpt-9-mini', shouldTransform: true },
        { model: 'gpt-4', shouldTransform: false },
        { model: 'gpt-4o', shouldTransform: false },
        { model: 'gpt-3.5-turbo', shouldTransform: false },
        { model: 'claude-3', shouldTransform: false },
      ];

      testCases.forEach(({ model, shouldTransform }) => {
        const clientOptions = {
          model,
          maxTokens: 1000,
        };

        // Simulate the getOptions logic
        if (
          /\bgpt-[5-9](?:\.\d+)?\b/i.test(clientOptions.model) &&
          clientOptions.maxTokens != null
        ) {
          clientOptions.modelKwargs = clientOptions.modelKwargs ?? {};
          clientOptions.modelKwargs.max_completion_tokens = clientOptions.maxTokens;
          delete clientOptions.maxTokens;
        }

        if (shouldTransform) {
          expect(clientOptions.maxTokens).toBeUndefined();
          expect(clientOptions.modelKwargs?.max_completion_tokens).toBe(1000);
        } else {
          expect(clientOptions.maxTokens).toBe(1000);
          expect(clientOptions.modelKwargs).toBeUndefined();
        }
      });
    });

    it('should not swap max token param for older models when using useResponsesApi', () => {
      const testCases = [
        { model: 'gpt-5.1', shouldTransform: true },
        { model: 'gpt-5.1-chat-latest', shouldTransform: true },
        { model: 'gpt-5.1-codex', shouldTransform: true },
        { model: 'gpt-5', shouldTransform: true },
        { model: 'gpt-5-turbo', shouldTransform: true },
        { model: 'gpt-6', shouldTransform: true },
        { model: 'gpt-7-preview', shouldTransform: true },
        { model: 'gpt-8', shouldTransform: true },
        { model: 'gpt-9-mini', shouldTransform: true },
        { model: 'gpt-4', shouldTransform: false },
        { model: 'gpt-4o', shouldTransform: false },
        { model: 'gpt-3.5-turbo', shouldTransform: false },
        { model: 'claude-3', shouldTransform: false },
      ];

      testCases.forEach(({ model, shouldTransform }) => {
        const clientOptions = {
          model,
          maxTokens: 1000,
          useResponsesApi: true,
        };

        if (
          /\bgpt-[5-9](?:\.\d+)?\b/i.test(clientOptions.model) &&
          clientOptions.maxTokens != null
        ) {
          clientOptions.modelKwargs = clientOptions.modelKwargs ?? {};
          const paramName =
            clientOptions.useResponsesApi === true ? 'max_output_tokens' : 'max_completion_tokens';
          clientOptions.modelKwargs[paramName] = clientOptions.maxTokens;
          delete clientOptions.maxTokens;
        }

        if (shouldTransform) {
          expect(clientOptions.maxTokens).toBeUndefined();
          expect(clientOptions.modelKwargs?.max_output_tokens).toBe(1000);
        } else {
          expect(clientOptions.maxTokens).toBe(1000);
          expect(clientOptions.modelKwargs).toBeUndefined();
        }
      });
    });

    it('should not transform if maxTokens is null or undefined', () => {
      const testCases = [
        { model: 'gpt-5', maxTokens: null },
        { model: 'gpt-5', maxTokens: undefined },
        { model: 'gpt-6', maxTokens: 0 }, // Should transform even if 0
      ];

      testCases.forEach(({ model, maxTokens }, index) => {
        const clientOptions = {
          model,
          maxTokens,
          temperature: 0.7,
        };

        // Simulate the getOptions logic
        if (
          /\bgpt-[5-9](?:\.\d+)?\b/i.test(clientOptions.model) &&
          clientOptions.maxTokens != null
        ) {
          clientOptions.modelKwargs = clientOptions.modelKwargs ?? {};
          clientOptions.modelKwargs.max_completion_tokens = clientOptions.maxTokens;
          delete clientOptions.maxTokens;
        }

        if (index < 2) {
          // null or undefined cases
          expect(clientOptions.maxTokens).toBe(maxTokens);
          expect(clientOptions.modelKwargs).toBeUndefined();
        } else {
          // 0 case - should transform
          expect(clientOptions.maxTokens).toBeUndefined();
          expect(clientOptions.modelKwargs?.max_completion_tokens).toBe(0);
        }
      });
    });
  });

  describe('buildMessages with MCP server instructions', () => {
    let client;
    let mockReq;
    let mockRes;
    let mockAgent;
    let mockOptions;

    beforeEach(() => {
      jest.clearAllMocks();

      // Reset the mock to default behavior
      mockFormatInstructions.mockResolvedValue(
        '# MCP Server Instructions\n\nTest MCP instructions here',
      );

      const { DynamicStructuredTool } = require('@librechat/agents/langchain/tools');

      // Create mock MCP tools with the delimiter pattern
      const mockMCPTool1 = new DynamicStructuredTool({
        name: `tool1${Constants.mcp_delimiter}server1`,
        description: 'Test MCP tool 1',
        schema: {},
        func: async () => 'result',
      });

      const mockMCPTool2 = new DynamicStructuredTool({
        name: `tool2${Constants.mcp_delimiter}server2`,
        description: 'Test MCP tool 2',
        schema: {},
        func: async () => 'result',
      });

      mockAgent = {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        instructions: 'Base agent instructions',
        model_parameters: {
          model: 'gpt-4',
        },
        tools: [mockMCPTool1, mockMCPTool2],
      };

      mockReq = {
        user: {
          id: 'user-123',
        },
        body: {
          endpoint: EModelEndpoint.openAI,
        },
        config: {},
      };

      mockRes = {};

      mockOptions = {
        req: mockReq,
        res: mockRes,
        agent: mockAgent,
        endpoint: EModelEndpoint.agents,
      };

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';
      client.shouldSummarize = false;
      client.maxContextTokens = 4096;
    });

    it('loads RAG, memory, attachment, and MCP context without serial waits', async () => {
      const ragContext = deferred();
      const memoryContext = deferred();
      const mcpConfig = deferred();
      client.contextHandlers = {
        createContext: jest.fn(() => ragContext.promise),
      };
      client.useMemory = jest.fn(() => memoryContext.promise);
      resolveConfigServers.mockReturnValueOnce(mcpConfig.promise);

      const buildPromise = client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'Load all context.',
            isCreatedByUser: true,
          },
        ],
        null,
        {},
      );

      expect(client.contextHandlers.createContext).toHaveBeenCalledTimes(1);
      expect(client.useMemory).toHaveBeenCalledTimes(1);
      expect(resolveConfigServers).toHaveBeenCalledWith(mockReq);

      ragContext.resolve('Retrieved context');
      memoryContext.resolve(undefined);
      mcpConfig.resolve({});
      await buildPromise;

      expect(client.augmentedPrompt).toBe('Retrieved context');
      expect(client.options.agent.additional_instructions).toContain('Retrieved context');
    });

    it('starts independent context and current-file work at their earliest dependency barriers', async () => {
      const requestAttachments = deferred();
      const memoryContext = deferred();
      const mcpConfig = deferred();
      const agentScopedContext = deferred();
      const fileContext = deferred();
      const providerAttachments = deferred();
      const requestFile = {
        file_id: 'request-file',
        filename: 'request.txt',
        source: 'text',
        type: 'text/plain',
      };

      client.options.attachments = requestAttachments.promise;
      client.useMemory = jest.fn(() => memoryContext.promise);
      resolveConfigServers.mockReturnValueOnce(mcpConfig.promise);
      mockBuildAgentScopedContext.mockReturnValueOnce(agentScopedContext.promise);
      client.addFileContextToMessage = jest.fn(() => fileContext.promise);
      client.processAttachments = jest.fn(() => providerAttachments.promise);

      const buildPromise = client.buildMessages(
        [
          {
            messageId: 'msg-early-context',
            parentMessageId: null,
            sender: 'User',
            text: 'Load the request file.',
            isCreatedByUser: true,
          },
        ],
        'msg-early-context',
        {},
      );

      expect(client.useMemory).toHaveBeenCalledTimes(1);
      expect(resolveConfigServers).toHaveBeenCalledWith(mockReq);
      expect(mockBuildAgentScopedContext).not.toHaveBeenCalled();
      expect(client.addFileContextToMessage).not.toHaveBeenCalled();
      expect(client.processAttachments).not.toHaveBeenCalled();

      requestAttachments.resolve([requestFile]);
      await Promise.resolve();

      expect(mockBuildAgentScopedContext).toHaveBeenCalledTimes(1);
      const scopedContextArgs = mockBuildAgentScopedContext.mock.calls[0][0];
      expect([...scopedContextArgs.sharedRunAttachmentIds]).toEqual(['request-file']);
      expect(client.addFileContextToMessage).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg-early-context' }),
        [requestFile],
      );
      expect(client.processAttachments).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg-early-context' }),
        [requestFile],
      );

      providerAttachments.resolve([requestFile]);
      await Promise.resolve();
      expect(client.options.attachments).toBe(requestAttachments.promise);

      fileContext.resolve();
      memoryContext.resolve(undefined);
      mcpConfig.resolve({});
      agentScopedContext.resolve(new Map());
      await buildPromise;

      expect(client.options.attachments).toEqual([requestFile]);
    });

    it('should await MCP instructions and not include [object Promise] in agent instructions', async () => {
      // Set specific return value for this test
      mockFormatInstructions.mockResolvedValue(
        '# MCP Server Instructions\n\nUse these tools carefully',
      );

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Hello',
          isCreatedByUser: true,
        },
      ];

      await client.buildMessages(messages, null, {
        instructions: 'Base instructions',
        additional_instructions: null,
      });

      // Verify formatInstructionsForContext was called with correct server names
      expect(mockFormatInstructions).toHaveBeenCalledWith(['server1', 'server2'], {});

      // Verify the instructions do NOT contain [object Promise]
      expect(client.options.agent.instructions).not.toContain('[object Promise]');

      // Verify the instructions DO contain the MCP instructions
      expect(client.options.agent.instructions).toContain('# MCP Server Instructions');
      expect(client.options.agent.instructions).toContain('Use these tools carefully');

      // Verify the base instructions are also included (from agent config, not buildOptions)
      expect(client.options.agent.instructions).toContain('Base agent instructions');
    });

    it('blocks fetched MCP instructions before they become model-bound', async () => {
      const privateInstruction = 'PRIVATE-MCP-INSTRUCTION';
      mockReq.config.filters = {
        agentInstructions: {
          pii: {
            fields: ['instructions'],
            starterPatterns: [],
            customPatterns: [
              {
                id: 'private-mcp-instruction',
                label: 'private MCP instruction',
                regex: privateInstruction,
              },
            ],
          },
        },
      };
      mockFormatInstructions.mockResolvedValue(privateInstruction);

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Hello',
              isCreatedByUser: true,
            },
          ],
          null,
          {},
        ),
      ).rejects.toMatchObject({
        code: 'content_filter_block',
        body: { source: 'agent_instruction', field: 'instructions' },
      });
    });

    it('should handle MCP instructions with ephemeral agent', async () => {
      // Set specific return value for this test
      mockFormatInstructions.mockResolvedValue(
        '# Ephemeral MCP Instructions\n\nSpecial ephemeral instructions',
      );

      // Set up ephemeral agent with MCP servers
      mockReq.body.ephemeralAgent = {
        mcp: ['ephemeral-server1', 'ephemeral-server2'],
      };

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Test ephemeral',
          isCreatedByUser: true,
        },
      ];

      await client.buildMessages(messages, null, {
        instructions: 'Ephemeral instructions',
        additional_instructions: null,
      });

      // Verify formatInstructionsForContext was called with ephemeral server names
      expect(mockFormatInstructions).toHaveBeenCalledWith(
        ['ephemeral-server1', 'ephemeral-server2'],
        {},
      );

      // Verify no [object Promise] in instructions
      expect(client.options.agent.instructions).not.toContain('[object Promise]');

      // Verify ephemeral MCP instructions are included
      expect(client.options.agent.instructions).toContain('# Ephemeral MCP Instructions');
      expect(client.options.agent.instructions).toContain('Special ephemeral instructions');
    });

    it('should handle empty MCP instructions gracefully', async () => {
      // Set empty return value for this test
      mockFormatInstructions.mockResolvedValue('');

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Hello',
          isCreatedByUser: true,
        },
      ];

      await client.buildMessages(messages, null, {
        instructions: 'Base instructions only',
        additional_instructions: null,
      });

      // Verify the instructions still work without MCP content (from agent config, not buildOptions)
      expect(client.options.agent.instructions).toBe('Base agent instructions');
      expect(client.options.agent.instructions).not.toContain('[object Promise]');
    });

    it('should handle MCP instructions error gracefully', async () => {
      // Set error return for this test
      mockFormatInstructions.mockRejectedValue(new Error('MCP error'));

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Hello',
          isCreatedByUser: true,
        },
      ];

      // Should not throw
      await client.buildMessages(messages, null, {
        instructions: 'Base instructions',
        additional_instructions: null,
      });

      // Should still have base instructions without MCP content (from agent config, not buildOptions)
      expect(client.options.agent.instructions).toContain('Base agent instructions');
      expect(client.options.agent.instructions).not.toContain('[object Promise]');
    });
  });

  describe('buildMessages with request and agent-scoped context attachments', () => {
    let client;
    let mockReq;
    let mockRes;
    let mockAgent;

    const makeTextFile = (file_id, filename, text) => ({
      user: 'user-123',
      file_id,
      filename,
      filepath: `/uploads/${filename}`,
      object: 'file',
      type: 'text/plain',
      bytes: text.length,
      embedded: false,
      usage: 0,
      source: 'text',
      text,
    });

    const makeUploadedFile = (file_id, filename, type) => ({
      user: 'user-123',
      file_id,
      filename,
      filepath: `/uploads/${filename}`,
      object: 'file',
      type,
      bytes: 128,
      embedded: false,
      usage: 0,
      source: 'local',
    });

    beforeEach(() => {
      jest.clearAllMocks();
      mockFormatInstructions.mockResolvedValue('');
      require('@librechat/api').countFormattedMessageTokens.mockImplementation(() => 42);
      require('~/models').getFiles.mockReset().mockResolvedValue([]);
      require('~/models').getUserMemories.mockReset().mockResolvedValue([]);

      mockAgent = {
        id: 'primary-agent',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        instructions: 'Primary instructions',
        model_parameters: {
          model: 'gpt-4',
        },
        tools: [],
      };

      mockReq = {
        user: {
          id: 'user-123',
          personalization: {
            memories: true,
          },
        },
        body: {
          endpoint: EModelEndpoint.openAI,
          fileTokenLimit: 1000,
        },
        config: {
          memory: {
            disabled: true,
          },
        },
      };
      mockRes = {};

      client = new AgentClient({
        req: mockReq,
        res: mockRes,
        agent: mockAgent,
        endpoint: EModelEndpoint.agents,
      });
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';
      client.shouldSummarize = false;
      client.maxContextTokens = 4096;
      client.useMemory = jest.fn().mockResolvedValue(undefined);
    });

    it.each(['primary', 'handoff'])(
      'blocks %s agent dynamic tool context before it becomes model-bound',
      async (agentScope) => {
        const privateContext = 'PRIVATE-DYNAMIC-TOOL-CONTEXT';
        mockReq.config.filters = {
          files: {
            pii: {
              fields: ['content'],
              starterPatterns: [],
              customPatterns: [
                {
                  id: 'private-dynamic-context',
                  label: 'private dynamic context',
                  regex: privateContext,
                },
              ],
            },
          },
        };
        const dynamicToolContextMap = {
          empty: '',
          dynamic: privateContext,
          ignored: 123,
        };
        if (agentScope === 'primary') {
          client.options.agent.dynamicToolContextMap = dynamicToolContextMap;
        } else {
          client.agentConfigs = new Map([
            [
              'handoff-agent',
              {
                ...mockAgent,
                id: 'handoff-agent',
                dynamicToolContextMap,
              },
            ],
          ]);
        }

        await expect(
          client.buildMessages(
            [
              {
                messageId: 'msg-1',
                parentMessageId: null,
                sender: 'User',
                text: 'Hello',
                isCreatedByUser: true,
              },
            ],
            'msg-1',
            {},
          ),
        ).rejects.toMatchObject({
          code: 'content_filter_block',
          body: { source: 'file', field: 'content' },
        });
      },
    );

    it('blocks a late-loaded tool definition on a nested pure subagent', async () => {
      const privateDescription = 'PRIVATE-NESTED-TOOL-DEFINITION';
      mockReq.config.filters = {
        agentInstructions: {
          pii: {
            fields: ['description'],
            starterPatterns: [],
            customPatterns: [
              {
                id: 'private-nested-tool-definition',
                label: 'private nested tool definition',
                regex: privateDescription,
              },
            ],
          },
        },
      };
      const nestedPureSubagent = {
        ...mockAgent,
        id: 'nested-pure-subagent',
        toolDefinitions: [
          {
            name: 'nested_lookup',
            description: privateDescription,
            parameters: { type: 'object' },
          },
        ],
      };
      client.options.agent.subagentAgentConfigs = [
        {
          ...mockAgent,
          id: 'pure-subagent',
          subagentAgentConfigs: [nestedPureSubagent],
        },
      ];

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Hello',
              isCreatedByUser: true,
            },
          ],
          'msg-1',
          {},
        ),
      ).rejects.toMatchObject({
        code: 'content_filter_block',
        body: { source: 'agent_instruction', field: 'description' },
      });
    });

    it('blocks dynamic tool context on a nested pure subagent', async () => {
      const privateContext = 'PRIVATE-NESTED-DYNAMIC-CONTEXT';
      mockReq.config.filters = {
        files: {
          pii: {
            fields: ['content'],
            starterPatterns: [],
            customPatterns: [
              {
                id: 'private-nested-dynamic-context',
                label: 'private nested dynamic context',
                regex: privateContext,
              },
            ],
          },
        },
      };
      client.options.agent.subagentAgentConfigs = [
        {
          ...mockAgent,
          id: 'pure-subagent',
          subagentAgentConfigs: [
            {
              ...mockAgent,
              id: 'nested-pure-subagent',
              dynamicToolContextMap: { nested_lookup: privateContext },
            },
          ],
        },
      ];

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Hello',
              isCreatedByUser: true,
            },
          ],
          'msg-1',
          {},
        ),
      ).rejects.toMatchObject({
        code: 'content_filter_block',
        body: { source: 'file', field: 'content' },
      });
    });

    it('blocks hydrated file context on a nested pure subagent', async () => {
      const privateFileText = 'PRIVATE-NESTED-HYDRATED-FILE';
      mockReq.config.filters = {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            customPatterns: [
              {
                id: 'private-nested-hydrated-file',
                label: 'private nested hydrated file',
                regex: privateFileText,
              },
            ],
          },
        },
      };
      client.options.agent.subagentAgentConfigs = [
        {
          ...mockAgent,
          id: 'pure-subagent',
          subagentAgentConfigs: [
            {
              ...mockAgent,
              id: 'nested-pure-subagent',
              agentContextAttachments: [makeTextFile('nested-file', 'nested.txt', privateFileText)],
            },
          ],
        },
      ];

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Hello',
              isCreatedByUser: true,
            },
          ],
          'msg-1',
          {},
        ),
      ).rejects.toMatchObject({
        code: 'content_filter_block',
        body: { source: 'file', field: 'extracted_text' },
      });
    });

    it('blocks loaded memory from a nested pure subagent partition', async () => {
      const privateMemory = 'PRIVATE-NESTED-MEMORY';
      mockReq.config.filters = {
        memories: {
          pii: {
            fields: ['value'],
            starterPatterns: [],
            customPatterns: [
              {
                id: 'private-nested-memory',
                label: 'private nested memory',
                regex: privateMemory,
              },
            ],
          },
        },
      };
      client.useMemory.mockResolvedValue({
        withKeys: 'safe shared memory',
        withoutKeys: 'safe shared memory',
      });
      require('~/models').getFormattedMemories.mockImplementation(({ agentId }) =>
        Promise.resolve(
          agentId === 'nested-pure-subagent'
            ? { withKeys: privateMemory, withoutKeys: privateMemory }
            : { withKeys: 'safe memory', withoutKeys: 'safe memory' },
        ),
      );
      require('~/models').getUserMemories.mockImplementation(({ agentId }) =>
        Promise.resolve(
          agentId === 'nested-pure-subagent' ? [{ key: 'private', value: privateMemory }] : [],
        ),
      );
      client.options.agent.subagentAgentConfigs = [
        {
          ...mockAgent,
          id: 'pure-subagent',
          subagentAgentConfigs: [
            {
              ...mockAgent,
              id: 'nested-pure-subagent',
              memory_scope: 'agent',
              memoryToolsRegistered: true,
            },
          ],
        },
      ];

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Hello',
              isCreatedByUser: true,
            },
          ],
          'msg-1',
          {},
        ),
      ).rejects.toMatchObject({
        code: 'content_filter_block',
        body: { source: 'memory', field: 'value' },
      });
    });

    it('blocks current attachment content before attachment processing', async () => {
      const privateFilename = 'PRIVATE-FILE.txt';
      mockReq.config.filters = {
        files: {
          pii: {
            fields: ['name'],
            starterPatterns: [],
            customPatterns: [{ id: 'private', label: 'private value', regex: privateFilename }],
          },
        },
      };
      client.options.attachments = [
        makeTextFile('current-file', privateFilename, 'otherwise safe content'),
      ];
      client.addFileContextToMessage = jest.fn();
      client.processAttachments = jest.fn();

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Read this file.',
              isCreatedByUser: true,
            },
          ],
          'msg-1',
          {},
        ),
      ).rejects.toMatchObject({ code: 'content_filter_block' });

      expect(client.addFileContextToMessage).not.toHaveBeenCalled();
      expect(client.processAttachments).not.toHaveBeenCalled();
    });

    it('accepts an owner-resolved historical file under fail-closed inspection', async () => {
      mockReq.config.filters = {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            uninspectable: 'block',
          },
        },
      };
      const historicalFile = makeTextFile(
        'historical-file',
        'history.txt',
        'Safe canonical content',
      );
      client.authorizedHistoricalFiles = new Map([['historical-file', historicalFile]]);

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Use the historical file.',
              isCreatedByUser: true,
              files: [{ file_id: 'historical-file' }],
            },
          ],
          'msg-1',
          {},
        ),
      ).resolves.toEqual(expect.objectContaining({ prompt: expect.any(Array) }));
    });

    it('preserves persisted source identity through both agent formatting passes', async () => {
      mockReq.config.filters = {
        messages: {
          pii: {
            fields: ['content_part'],
            starterPatterns: [],
            customPatterns: [
              { id: 'private', label: 'private value', regex: 'PRIVATE-USER-STEER' },
            ],
          },
        },
      };
      const storedMessage = {
        messageId: 'assistant-mixed',
        parentMessageId: null,
        sender: 'Assistant',
        role: 'assistant',
        isCreatedByUser: false,
        content: [
          { type: ContentTypes.TEXT, text: 'Safe model output' },
          { type: ContentTypes.STEER, steer: 'PRIVATE-USER-STEER' },
        ],
        userSubmittedPaths: ['/content/1/steer'],
      };
      client.setModelBoundStoredMessages([storedMessage]);

      const result = await client.buildMessages([storedMessage], 'assistant-mixed', {}, {});
      expect(result.prompt).toEqual([expect.objectContaining({ messageId: 'assistant-mixed' })]);
      expect(
        require('@librechat/api').countFormattedMessageTokens.mock.calls.some(
          ([message]) => message?.messageId === 'assistant-mixed',
        ),
      ).toBe(true);

      const { messages: providerMessages } = jest
        .requireActual('@librechat/agents')
        .formatAgentMessages(result.prompt);
      expect(providerMessages.length).toBeGreaterThanOrEqual(2);
      expect(
        providerMessages.every(
          (message) =>
            message.additional_kwargs?.sourceMessageId === 'assistant-mixed' ||
            message.id === 'assistant-mixed',
        ),
      ).toBe(true);
      expect(() =>
        client
          .createModelBoundChatModelCallback()
          .handleChatModelStart(undefined, [providerMessages]),
      ).toThrow(expect.objectContaining({ code: 'content_filter_block' }));
    });

    it('preserves persisted assistant attribution at the final agent provider boundary', async () => {
      const marker = 'E2E-PERSISTED-UNATTRIBUTED-ASSISTANT';
      mockReq.config.filters = {
        messages: {
          pii: {
            fields: ['text'],
            starterPatterns: [],
            customPatterns: [
              {
                id: 'persisted-unattributed-assistant',
                label: 'persisted unattributed assistant content',
                regex: `^${marker}$`,
              },
            ],
          },
          unattributedAssistantContent: 'inspect',
        },
      };
      const storedMessage = {
        messageId: 'legacy-assistant',
        parentMessageId: null,
        sender: 'Assistant',
        text: marker,
        isCreatedByUser: false,
      };
      client.setModelBoundStoredMessages([storedMessage]);

      const result = await client.buildMessages([storedMessage], 'legacy-assistant', {}, {});
      const { messages: providerMessages } = jest
        .requireActual('@librechat/agents')
        .formatAgentMessages(result.prompt);

      expect(() =>
        client
          .createModelBoundChatModelCallback()
          .handleChatModelStart(undefined, [providerMessages]),
      ).toThrow(expect.objectContaining({ code: 'content_filter_block' }));

      client.setModelBoundStoredMessages([{ ...storedMessage, isUserSubmitted: false }]);
      expect(() =>
        client
          .createModelBoundChatModelCallback()
          .handleChatModelStart(undefined, [providerMessages]),
      ).not.toThrow();
    });

    it('ignores historical file refs when this agent does not replay files', async () => {
      mockReq.config.filters = {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            uninspectable: 'block',
          },
        },
      };
      client.options.resendFiles = false;

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Continue without the deleted file.',
              isCreatedByUser: true,
              files: [{ file_id: 'deleted-historical-file' }],
            },
          ],
          'msg-1',
          {},
        ),
      ).resolves.toEqual(expect.objectContaining({ prompt: expect.any(Array) }));
    });

    it('filters historical attachment content only when its source survives pruning', async () => {
      const privateText = 'PRIVATE-HISTORICAL-CONTENT';
      mockReq.config.filters = {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            customPatterns: [{ id: 'private', label: 'private value', regex: privateText }],
          },
        },
      };
      client.options.resendFiles = true;
      require('~/models').getFiles.mockResolvedValue([
        makeTextFile('historical-file', 'history.txt', privateText),
      ]);
      client.addFileContextToMessage = jest.fn();
      client.processAttachments = jest.fn();

      const hydratedMessages = await client.addPreviousAttachments([
        {
          messageId: 'msg-1',
          parentMessageId: null,
          isCreatedByUser: true,
          files: [{ file_id: 'historical-file' }],
        },
      ]);
      client.setModelBoundStoredMessages([
        ...hydratedMessages,
        {
          messageId: 'safe-message',
          role: 'user',
          text: 'Safe retained turn',
          isCreatedByUser: true,
        },
      ]);
      const callback = client.createModelBoundChatModelCallback();

      expect(() =>
        callback.handleChatModelStart(undefined, [
          [
            {
              role: 'human',
              content: 'Safe retained turn',
              additional_kwargs: { sourceMessageId: 'safe-message' },
            },
          ],
        ]),
      ).not.toThrow();
      expect(() =>
        callback.handleChatModelStart(undefined, [
          [
            {
              role: 'human',
              content: 'Use the historical file.',
              additional_kwargs: { sourceMessageId: 'msg-1' },
            },
          ],
        ]),
      ).toThrow(expect.objectContaining({ code: 'content_filter_block' }));

      expect(client.addFileContextToMessage).toHaveBeenCalled();
      expect(client.processAttachments).toHaveBeenCalled();
    });

    it('does not run historical file contexts through the pre-pruning build preflight', async () => {
      const privateText = 'PRIVATE-PRUNED-HISTORICAL-FILE';
      mockReq.config.filters = {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            customPatterns: [{ id: 'private', label: 'private value', regex: privateText }],
          },
        },
      };
      const historicalFile = makeTextFile('historical-file', 'history.txt', privateText);
      const storedMessages = [
        {
          messageId: 'file-message',
          parentMessageId: null,
          sender: 'User',
          role: 'user',
          text: 'Use the historical file.',
          fileContext: privateText,
          files: [{ file_id: 'historical-file' }],
          isCreatedByUser: true,
        },
        {
          messageId: 'safe-message',
          parentMessageId: 'file-message',
          sender: 'User',
          role: 'user',
          text: 'Safe retained turn',
          isCreatedByUser: true,
        },
      ];
      client.authorizedHistoricalFiles = new Map([['historical-file', historicalFile]]);
      client.message_file_map = { 'file-message': [historicalFile] };
      client.setModelBoundStoredMessages(storedMessages);

      await expect(client.buildMessages(storedMessages, 'safe-message', {}, {})).resolves.toEqual(
        expect.objectContaining({ prompt: expect.any(Array) }),
      );

      const callback = client.createModelBoundChatModelCallback();
      expect(() =>
        callback.handleChatModelStart(undefined, [
          [
            {
              role: 'human',
              content: 'Safe retained turn',
              additional_kwargs: { sourceMessageId: 'safe-message' },
            },
          ],
        ]),
      ).not.toThrow();
      expect(() =>
        callback.handleChatModelStart(undefined, [
          [
            {
              role: 'human',
              content: 'Use the historical file.',
              additional_kwargs: { sourceMessageId: 'file-message' },
            },
          ],
        ]),
      ).toThrow(expect.objectContaining({ code: 'content_filter_block' }));
    });

    it('filters historical steer attachments only when their source survives pruning', async () => {
      const privateText = 'PRIVATE-STEER-FILE-CONTENT';
      mockReq.config.filters = {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            customPatterns: [{ id: 'private', label: 'private value', regex: privateText }],
          },
        },
      };
      client.options.resendFiles = true;
      require('~/models').getFiles.mockResolvedValue([
        makeTextFile('steer-file', 'steer.txt', privateText),
      ]);

      const storedMessages = await client.addPreviousAttachments([
        {
          messageId: 'assistant-msg',
          parentMessageId: null,
          isCreatedByUser: false,
          content: [
            {
              type: ContentTypes.STEER,
              steer: 'Read the attached file.',
              files: [{ file_id: 'steer-file' }],
            },
          ],
        },
      ]);
      client.setModelBoundStoredMessages([
        ...storedMessages,
        {
          messageId: 'safe-message',
          role: 'user',
          text: 'Safe retained turn',
          isCreatedByUser: true,
        },
      ]);
      client.modelBoundSteerFileIdsBySourceMessageId = new Map([
        ['assistant-msg', new Set(['steer-file'])],
      ]);
      const callback = client.createModelBoundChatModelCallback();

      expect(() =>
        callback.handleChatModelStart(undefined, [
          [
            {
              role: 'human',
              content: 'Safe retained turn',
              additional_kwargs: { sourceMessageId: 'safe-message' },
            },
          ],
        ]),
      ).not.toThrow();
      expect(() =>
        callback.handleChatModelStart(undefined, [
          [
            {
              role: 'human',
              content: 'Read the attached file.',
              additional_kwargs: { sourceMessageId: 'assistant-msg' },
            },
          ],
        ]),
      ).toThrow(expect.objectContaining({ code: 'content_filter_block' }));
    });

    it('fails closed when canonical memory loading fails under active policy', async () => {
      mockReq.config.filters = {
        memories: {
          pii: {
            fields: ['key'],
            starterPatterns: ['sk_prefix'],
          },
        },
      };
      require('~/models').getUserMemories.mockRejectedValue(new Error('memory read failed'));
      client.useMemory.mockResolvedValue({
        withKeys: '["key": "sk-private-memory"]',
        withoutKeys: 'safe value',
      });

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Use my preferences.',
              isCreatedByUser: true,
            },
          ],
          'msg-1',
          {},
        ),
      ).rejects.toThrow('memory read failed');
    });

    it('inspects formatted memory text when canonical loading returns no rows', async () => {
      const privateMemory = 'PRIVATE-MEMORY';
      mockReq.config.filters = {
        memories: {
          pii: {
            fields: ['value'],
            starterPatterns: [],
            customPatterns: [{ id: 'private', label: 'private value', regex: privateMemory }],
          },
        },
      };
      require('~/models').getUserMemories.mockResolvedValue([]);
      client.useMemory.mockResolvedValue({
        withKeys: privateMemory,
        withoutKeys: privateMemory,
      });

      await expect(
        client.buildMessages(
          [
            {
              messageId: 'msg-1',
              parentMessageId: null,
              sender: 'User',
              text: 'Use my preferences.',
              isCreatedByUser: true,
            },
          ],
          'msg-1',
          {},
        ),
      ).rejects.toMatchObject({
        code: 'content_filter_block',
        body: { source: 'memory', field: 'value' },
      });
    });

    it.each([
      ['CSV', 'csv-file', 'sample.csv', 'text/csv'],
      [
        'XLSX',
        'xlsx-file',
        'sample.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    ])(
      'routes default-supported provider uploads like %s as request documents without custom file config',
      async (_label, file_id, filename, type) => {
        const currentFile = makeUploadedFile(file_id, filename, type);
        const message = {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: `Read this ${filename}.`,
          isCreatedByUser: true,
        };

        client.addDocuments = jest.fn(async (targetMessage, attachments) => {
          targetMessage.documents = attachments.map((file) => ({
            type: 'input_file',
            filename: file.filename,
            file_data: `data:${file.type};base64,Y29sMQox`,
          }));
          return attachments;
        });

        const files = await client.processAttachments(message, [currentFile]);

        expect(client.addDocuments).toHaveBeenCalledWith(message, [currentFile]);
        expect(message.documents).toEqual([
          expect.objectContaining({
            type: 'input_file',
            filename,
          }),
        ]);
        expect(files).toEqual([currentFile]);
      },
    );

    it('places request context inline and applies each agent context doc only once', async () => {
      const requestFile = makeTextFile('request-file', 'request.txt', 'Shared request context');
      const primaryContext = makeTextFile(
        'primary-context',
        'primary.txt',
        'Primary private context',
      );
      const handoffContext = makeTextFile(
        'handoff-context',
        'handoff.txt',
        'Handoff private context',
      );
      const handoffAgent = {
        id: 'handoff-agent',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        instructions: 'Handoff instructions',
        model_parameters: {
          model: 'gpt-4',
        },
        tools: [],
      };

      client.options.attachments = [requestFile];
      client.options.agentContextAttachmentsByAgentId = new Map([
        ['primary-agent', [primaryContext]],
        ['handoff-agent', [handoffContext]],
      ]);
      client.agentConfigs = new Map([['handoff-agent', handoffAgent]]);

      const result = await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'Use the available context.',
            isCreatedByUser: true,
          },
        ],
        'msg-1',
        {},
      );

      expect(result.prompt[0].content).toContain('Shared request context');

      expect(mockAgent.additional_instructions).toContain('Primary private context');
      expect(mockAgent.additional_instructions).not.toContain('Shared request context');
      expect(mockAgent.additional_instructions).not.toContain('Handoff private context');

      expect(handoffAgent.additional_instructions).toContain('Handoff private context');
      expect(handoffAgent.additional_instructions).not.toContain('Shared request context');
      expect(handoffAgent.additional_instructions).not.toContain('Primary private context');
    });

    it('places current request file context on the latest user message', async () => {
      const currentFile = makeTextFile('current-file', 'current.txt', 'Current turn file body');
      const previousFileContext =
        'Attached document(s):\n```md\n# "previous.txt"\nPrevious turn file body\n```';

      client.options.attachments = [currentFile];

      const result = await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'What is written here?',
            isCreatedByUser: true,
            fileContext: previousFileContext,
          },
          {
            messageId: 'msg-2',
            parentMessageId: 'msg-1',
            sender: 'Assistant',
            text: 'It describes the previous file.',
            isCreatedByUser: false,
          },
          {
            messageId: 'msg-3',
            parentMessageId: 'msg-2',
            sender: 'User',
            text: 'What is written here?',
            isCreatedByUser: true,
          },
        ],
        'msg-3',
        {},
      );

      expect(result.prompt[0].content).toContain('Previous turn file body');
      expect(result.prompt[2].content).toContain('Current turn file body');
      expect(result.prompt[2].content).toContain('What is written here?');
      expect(result.prompt[2].content).not.toContain('Previous turn file body');
      expect(client.memoryPayload[2].content).toContain('What is written here?');
      expect(client.memoryPayload[2].content).not.toContain('Current turn file body');
      expect(mockAgent.additional_instructions ?? '').not.toContain('Current turn file body');
      expect(result.prompt[2].content.indexOf('Current turn file body')).toBeLessThan(
        result.prompt[2].content.indexOf('What is written here?'),
      );
    });

    it('quote-merges historical steer parts into the prompt AND the memory copy', async () => {
      const previousFileContext =
        'Attached document(s):\n```md\n# "previous.txt"\nPrevious turn file body\n```';

      const result = await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'Summarize.',
            isCreatedByUser: true,
            fileContext: previousFileContext,
          },
          {
            messageId: 'msg-2',
            parentMessageId: 'msg-1',
            sender: 'Assistant',
            text: '',
            isCreatedByUser: false,
            content: [
              { type: ContentTypes.TEXT, text: 'working on it' },
              {
                type: ContentTypes.STEER,
                [ContentTypes.STEER]: 'remember this',
                steerId: 's1',
                quotes: ['the important fact'],
              },
            ],
          },
          {
            messageId: 'msg-3',
            parentMessageId: 'msg-2',
            sender: 'User',
            text: 'Continue.',
            isCreatedByUser: true,
          },
        ],
        'msg-3',
        {},
      );

      const merged = '> the important fact\n\nremember this';
      const promptSteer = result.prompt[1].content.find((part) => part.type === ContentTypes.STEER);
      expect(promptSteer.media).toEqual([{ type: ContentTypes.TEXT, text: merged }]);
      // The memory copy replays through the same formatter, which ignores
      // `part.quotes` — it needs its own merged stamp or memory extraction
      // never sees the excerpt.
      const memorySteer = client.memoryPayload[1].content.find(
        (part) => part.type === ContentTypes.STEER,
      );
      expect(memorySteer.media).toEqual([{ type: ContentTypes.TEXT, text: merged }]);
    });

    it('persists canonical token counts while counting request file context for the prompt', async () => {
      const { countFormattedMessageTokens } = require('@librechat/api');
      const currentFile = makeTextFile('current-file', 'current.txt', 'Current turn file body');

      countFormattedMessageTokens.mockImplementation(({ content }) => {
        const text = Array.isArray(content)
          ? content.map((part) => part.text ?? part[ContentTypes.TEXT] ?? '').join('\n')
          : String(content ?? '');
        return text.includes('Current turn file body') ? 200 : 20;
      });

      client.options.attachments = [currentFile];

      const result = await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'What is written here?',
            isCreatedByUser: true,
          },
        ],
        'msg-1',
        {},
      );

      expect(result.prompt[0].content).toContain('Current turn file body');
      expect(result.tokenCountMap['msg-1']).toBe(20);
      expect(result.promptTokens).toBe(200);
      expect(client.indexTokenCountMap[0]).toBe(200);
      expect(client.memoryPayload[0].content).toBe('What is written here?');
    });

    it('recounts a quote-bearing history row from quote-merged content and keeps the memory payload unbuilt without file context', async () => {
      const { countFormattedMessageTokens } = require('@librechat/api');
      countFormattedMessageTokens.mockImplementation(({ content }) => {
        const text = Array.isArray(content)
          ? content.map((part) => part.text ?? part[ContentTypes.TEXT] ?? '').join('\n')
          : String(content ?? '');
        return text.includes('quoted excerpt') ? 77 : 11;
      });

      const result = await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'Discuss this.',
            isCreatedByUser: true,
            tokenCount: 5,
            quotes: ['quoted excerpt'],
          },
          {
            messageId: 'msg-2',
            parentMessageId: 'msg-1',
            sender: 'Assistant',
            text: 'Sure.',
            isCreatedByUser: false,
            tokenCount: 3,
          },
        ],
        'msg-2',
        {},
      );

      expect(result.tokenCountMap['msg-1']).toBe(77);
      expect(result.tokenCountMap['msg-2']).toBe(3);
      expect(client.memoryPayload).toBeNull();
    });

    it('does not duplicate a file that is both request context and scoped context', async () => {
      const sharedFile = makeTextFile('shared-file', 'shared.txt', 'Shared duplicate context');

      client.options.attachments = [sharedFile];
      client.options.agentContextAttachmentsByAgentId = new Map([['primary-agent', [sharedFile]]]);
      client.agentConfigs = new Map();

      const result = await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'Use the available context.',
            isCreatedByUser: true,
          },
        ],
        'msg-1',
        {},
      );

      const inlineOccurrences = (result.prompt[0].content.match(/Shared duplicate context/g) ?? [])
        .length;
      expect(inlineOccurrences).toBe(1);
      expect(mockAgent.additional_instructions ?? '').not.toContain('Shared duplicate context');
    });

    it('keeps direct chats with context-doc agents working without request attachments', async () => {
      const primaryContext = makeTextFile(
        'primary-context',
        'primary.txt',
        'Direct primary context',
      );

      client.options.agentContextAttachmentsByAgentId = new Map([
        ['primary-agent', [primaryContext]],
      ]);
      client.agentConfigs = new Map();

      await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'Answer from your context.',
            isCreatedByUser: true,
          },
        ],
        'msg-1',
        {},
      );

      expect(mockAgent.additional_instructions).toContain('Direct primary context');
    });

    it('hydrates a pure lazy subagent with its own File Context when selected', async () => {
      const childContext = makeTextFile('child-context', 'child.txt', 'Pure child private context');
      const resolvedChild = {
        id: 'pure-child-agent',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        instructions: 'Pure child instructions',
        model_parameters: { model: 'gpt-4' },
        tools: [],
        agentContextAttachments: [childContext],
      };
      const descriptor = {
        id: resolvedChild.id,
        resolve: jest.fn().mockResolvedValue(resolvedChild),
      };
      mockAgent.lazySubagentConfigs = [descriptor];
      client.agentConfigs = new Map();

      await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'Answer from the child context.',
            isCreatedByUser: true,
          },
        ],
        'msg-1',
        {},
      );
      const resolved = await descriptor.resolve({ signal: new AbortController().signal });

      expect(resolved).toBe(resolvedChild);
      expect(resolvedChild.additional_instructions).toContain('Pure child private context');
      expect(mockAgent.additional_instructions ?? '').not.toContain('Pure child private context');
      expect(mockBuildAgentScopedContext).toHaveBeenLastCalledWith(
        expect.objectContaining({
          agentIds: ['pure-child-agent'],
          attachmentsByAgentId: new Map([['pure-child-agent', [childContext]]]),
        }),
      );
    });
  });

  describe('provider-native YouTube file preflight', () => {
    const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    const createClient = ({ provider, filters }) => {
      const req = {
        user: { id: 'user-123' },
        body: { endpoint: EModelEndpoint.agents },
        config: {
          memory: { disabled: true },
          ...(filters && { filters }),
        },
      };
      const client = new AgentClient({
        req,
        res: {},
        endpoint: EModelEndpoint.agents,
        agent: {
          id: `${provider}-agent`,
          endpoint: EModelEndpoint.agents,
          provider,
          instructions: 'Summarize the submitted video.',
          model_parameters: { model: 'gemini-2.5-flash' },
          tools: [{ urlContext: {} }],
        },
      });
      const invokeModel = jest.fn().mockResolvedValue({ completion: [], metadata: {} });

      client.shouldSummarize = false;
      client.maxContextTokens = 4096;
      client.useMemory = jest.fn().mockResolvedValue(undefined);
      client.loadHistory = jest.fn().mockResolvedValue([]);
      client.skipSaveUserMessage = true;
      client.saveMessageToDatabase = jest.fn().mockResolvedValue({});
      client.recordTokenUsage = jest.fn().mockResolvedValue(undefined);
      client.getTokenCountForResponse = jest.fn(() => 0);
      client.sendCompletion = invokeModel;

      return { client, invokeModel };
    };

    const sendYouTubeMessage = (client) =>
      client.sendMessage(`Summarize ${youtubeUrl}`, {
        conversationId: 'youtube-conversation',
        parentMessageId: Constants.NO_PARENT,
        user: 'user-123',
      });

    beforeEach(() => {
      jest.clearAllMocks();
      mockFormatInstructions.mockResolvedValue('');
      require('@librechat/api').countFormattedMessageTokens.mockImplementation(() => 42);
      require('~/models').getFiles.mockReset().mockResolvedValue([]);
      require('~/models').getUserMemories.mockReset().mockResolvedValue([]);
    });

    it.each([Providers.GOOGLE, Providers.VERTEXAI])(
      'blocks a late %s fileUri before model invocation under strict content policy',
      async (provider) => {
        const { client, invokeModel } = createClient({
          provider,
          filters: {
            files: {
              pii: {
                fields: ['content'],
                starterPatterns: [],
                uninspectable: 'block',
              },
            },
          },
        });

        await expect(sendYouTubeMessage(client)).rejects.toMatchObject({
          code: 'content_filter_uninspectable',
          body: { source: 'file', field: 'content' },
        });
        expect(invokeModel).not.toHaveBeenCalled();
      },
    );

    it.each([Providers.GOOGLE, Providers.VERTEXAI])(
      'keeps late %s fileUri compatible when file protection is off',
      async (provider) => {
        const { client, invokeModel } = createClient({ provider });

        await expect(sendYouTubeMessage(client)).resolves.toMatchObject({
          isCreatedByUser: false,
        });
        expect(invokeModel).toHaveBeenCalledTimes(1);
        expect(invokeModel.mock.calls[0][0]).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({ type: 'media', fileUri: youtubeUrl }),
              ]),
            }),
          ]),
        );
      },
    );

    it('allows a known non-audio Vertex fileUri under transcript-only strict policy', async () => {
      const { client, invokeModel } = createClient({
        provider: Providers.VERTEXAI,
        filters: {
          files: {
            pii: {
              fields: ['transcript'],
              starterPatterns: [],
              uninspectable: 'block',
            },
          },
        },
      });

      await expect(sendYouTubeMessage(client)).resolves.toMatchObject({
        isCreatedByUser: false,
      });
      expect(invokeModel).toHaveBeenCalledTimes(1);
      expect(invokeModel.mock.calls[0][0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'media',
                mimeType: 'video/mp4',
                fileUri: youtubeUrl,
              }),
            ]),
          }),
        ]),
      );
    });
  });

  describe('runMemory method', () => {
    let client;
    let mockReq;
    let mockRes;
    let mockAgent;
    let mockOptions;
    let mockProcessMemory;

    beforeEach(() => {
      jest.clearAllMocks();

      mockAgent = {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: {
          model: 'gpt-4',
        },
      };

      mockReq = {
        user: {
          id: 'user-123',
          personalization: {
            memories: true,
          },
        },
      };

      // Mock getAppConfig for memory tests
      mockReq.config = {
        memory: {
          messageWindowSize: 3,
        },
      };

      mockRes = {};

      mockOptions = {
        req: mockReq,
        res: mockRes,
        agent: mockAgent,
      };

      mockProcessMemory = jest.fn().mockResolvedValue([]);

      client = new AgentClient(mockOptions);
      client.processMemory = mockProcessMemory;
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';
    });

    it('should filter out image URLs from message content', async () => {
      const { HumanMessage, AIMessage } = require('@librechat/agents/langchain/messages');
      const messages = [
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: 'What is in this image?',
            },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                detail: 'auto',
              },
            },
          ],
        }),
        new AIMessage('I can see a small red pixel in the image.'),
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: 'What about this one?',
            },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/',
                detail: 'high',
              },
            },
          ],
        }),
      ];

      await client.runMemory(messages);

      expect(mockProcessMemory).toHaveBeenCalledTimes(1);
      const processedMessage = mockProcessMemory.mock.calls[0][0][0];

      // Verify the buffer message was created
      expect(processedMessage.constructor.name).toBe('HumanMessage');
      expect(processedMessage.content).toContain('# Current Chat:');

      // Verify that image URLs are not in the buffer string
      expect(processedMessage.content).not.toContain('image_url');
      expect(processedMessage.content).not.toContain('data:image');
      expect(processedMessage.content).not.toContain('base64');

      // Verify text content is preserved
      expect(processedMessage.content).toContain('What is in this image?');
      expect(processedMessage.content).toContain('I can see a small red pixel in the image.');
      expect(processedMessage.content).toContain('What about this one?');
    });

    it('should handle messages with only text content', async () => {
      const { HumanMessage, AIMessage } = require('@librechat/agents/langchain/messages');
      const messages = [
        new HumanMessage('Hello, how are you?'),
        new AIMessage('I am doing well, thank you!'),
        new HumanMessage('That is great to hear.'),
      ];

      await client.runMemory(messages);

      expect(mockProcessMemory).toHaveBeenCalledTimes(1);
      const processedMessage = mockProcessMemory.mock.calls[0][0][0];

      expect(processedMessage.content).toContain('Hello, how are you?');
      expect(processedMessage.content).toContain('I am doing well, thank you!');
      expect(processedMessage.content).toContain('That is great to hear.');
    });

    it('should keep original roles separate for content policy inspection', async () => {
      const { HumanMessage, AIMessage } = require('@librechat/agents/langchain/messages');
      const messages = [new HumanMessage('Safe user input'), new AIMessage('PRIVATE-MODEL-OUTPUT')];

      await client.runMemory(messages);

      expect(mockProcessMemory).toHaveBeenCalledTimes(1);
      const [flattenedMessages, inspectionMessages] = mockProcessMemory.mock.calls[0];
      expect(flattenedMessages).toHaveLength(1);
      expect(flattenedMessages[0].constructor.name).toBe('HumanMessage');
      expect(flattenedMessages[0].content).toContain('PRIVATE-MODEL-OUTPUT');
      expect(inspectionMessages).toHaveLength(2);
      expect(inspectionMessages[0].constructor.name).toBe('HumanMessage');
      expect(inspectionMessages[0].content).toBe('Safe user input');
      expect(inspectionMessages[1].constructor.name).toBe('AIMessage');
      expect(inspectionMessages[1].content).toBe('PRIVATE-MODEL-OUTPUT');
    });

    it('should handle mixed content types correctly', async () => {
      const { HumanMessage } = require('@librechat/agents/langchain/messages');
      const { ContentTypes } = require('librechat-data-provider');

      const messages = [
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: 'Here is some text',
            },
            {
              type: ContentTypes.IMAGE_URL,
              image_url: {
                url: 'https://example.com/image.png',
              },
            },
            {
              type: 'text',
              text: ' and more text',
            },
          ],
        }),
      ];

      await client.runMemory(messages);

      expect(mockProcessMemory).toHaveBeenCalledTimes(1);
      const processedMessage = mockProcessMemory.mock.calls[0][0][0];

      // Should contain text parts but not image URLs
      expect(processedMessage.content).toContain('Here is some text');
      expect(processedMessage.content).toContain('and more text');
      expect(processedMessage.content).not.toContain('example.com/image.png');
      expect(processedMessage.content).not.toContain('IMAGE_URL');
    });

    it('should preserve original messages without mutation', async () => {
      const { HumanMessage } = require('@librechat/agents/langchain/messages');
      const originalContent = [
        {
          type: 'text',
          text: 'Original text',
        },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,ABC123',
          },
        },
      ];

      const messages = [
        new HumanMessage({
          content: [...originalContent],
        }),
      ];

      await client.runMemory(messages);

      // Verify original message wasn't mutated
      expect(messages[0].content).toHaveLength(2);
      expect(messages[0].content[1].type).toBe('image_url');
      expect(messages[0].content[1].image_url.url).toBe('data:image/png;base64,ABC123');
    });

    it('should handle message window size correctly', async () => {
      const { HumanMessage, AIMessage } = require('@librechat/agents/langchain/messages');
      const messages = [
        new HumanMessage('Message 1'),
        new AIMessage('Response 1'),
        new HumanMessage('Message 2'),
        new AIMessage('Response 2'),
        new HumanMessage('Message 3'),
        new AIMessage('Response 3'),
      ];

      // Window size is set to 3 in mockReq
      await client.runMemory(messages);

      expect(mockProcessMemory).toHaveBeenCalledTimes(1);
      const processedMessage = mockProcessMemory.mock.calls[0][0][0];

      // Should only include last 3 messages due to window size
      expect(processedMessage.content).toContain('Message 3');
      expect(processedMessage.content).toContain('Response 3');
      expect(processedMessage.content).not.toContain('Message 1');
      expect(processedMessage.content).not.toContain('Response 1');
    });

    it('should cap memory input tokens and preserve recent content', async () => {
      const { HumanMessage, AIMessage } = require('@librechat/agents/langchain/messages');
      mockReq.config.memory.maxInputTokens = 12;
      const messages = [
        new HumanMessage(`OLDER_CONTENT ${'a'.repeat(600)}`),
        new AIMessage('Intermediate response'),
        new HumanMessage('Please remember LATEST_MEMORY_MARKER'),
      ];

      await client.runMemory(messages);

      expect(mockProcessMemory).toHaveBeenCalledTimes(1);
      const processedMessage = mockProcessMemory.mock.calls[0][0][0];

      expect(processedMessage.content).toContain('LATEST_MEMORY_MARKER');
      expect(processedMessage.content).not.toContain('OLDER_CONTENT');
      expect(Math.ceil(processedMessage.content.length / 4)).toBeLessThanOrEqual(12);
    });

    it('should return early if processMemory is not set', async () => {
      const { HumanMessage } = require('@librechat/agents/langchain/messages');
      client.processMemory = null;

      const result = await client.runMemory([new HumanMessage('Test')]);

      expect(result).toBeUndefined();
      expect(mockProcessMemory).not.toHaveBeenCalled();
    });

    it('should contain automatic memory rejection and log only bounded metadata', async () => {
      const { HumanMessage } = require('@librechat/agents/langchain/messages');
      const { logger } = require('@librechat/data-schemas');
      const sensitiveValue = 'PRIVATE-MEMORY-REJECTION-CONTENT';
      const contentFilterError = new Error(sensitiveValue);
      contentFilterError.code = 'content_filter_block';
      mockProcessMemory.mockRejectedValueOnce(contentFilterError);
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

      try {
        await expect(client.runMemory([new HumanMessage('Safe message')])).resolves.toBeUndefined();

        expect(mockProcessMemory).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('Memory Agent failed to process memory', {
          type: 'Error',
        });
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(sensitiveValue);
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  describe('getMessagesForConversation - mapMethod and mapCondition', () => {
    const createMessage = (id, parentId, text, extras = {}) => ({
      messageId: id,
      parentMessageId: parentId,
      text,
      isCreatedByUser: false,
      ...extras,
    });

    it('should apply mapMethod to all messages when mapCondition is not provided', () => {
      const messages = [
        createMessage('msg-1', null, 'First message'),
        createMessage('msg-2', 'msg-1', 'Second message'),
        createMessage('msg-3', 'msg-2', 'Third message'),
      ];

      const mapMethod = jest.fn((msg) => ({ ...msg, mapped: true }));

      const result = AgentClient.getMessagesForConversation({
        messages,
        parentMessageId: 'msg-3',
        mapMethod,
      });

      expect(result).toHaveLength(3);
      expect(mapMethod).toHaveBeenCalledTimes(3);
      result.forEach((msg) => {
        expect(msg.mapped).toBe(true);
      });
    });

    it('should apply mapMethod only to messages where mapCondition returns true', () => {
      const messages = [
        createMessage('msg-1', null, 'First message', { addedConvo: false }),
        createMessage('msg-2', 'msg-1', 'Second message', { addedConvo: true }),
        createMessage('msg-3', 'msg-2', 'Third message', { addedConvo: true }),
        createMessage('msg-4', 'msg-3', 'Fourth message', { addedConvo: false }),
      ];

      const mapMethod = jest.fn((msg) => ({ ...msg, mapped: true }));
      const mapCondition = (msg) => msg.addedConvo === true;

      const result = AgentClient.getMessagesForConversation({
        messages,
        parentMessageId: 'msg-4',
        mapMethod,
        mapCondition,
      });

      expect(result).toHaveLength(4);
      expect(mapMethod).toHaveBeenCalledTimes(2);

      expect(result[0].mapped).toBeUndefined();
      expect(result[1].mapped).toBe(true);
      expect(result[2].mapped).toBe(true);
      expect(result[3].mapped).toBeUndefined();
    });

    it('should not apply mapMethod when mapCondition returns false for all messages', () => {
      const messages = [
        createMessage('msg-1', null, 'First message', { addedConvo: false }),
        createMessage('msg-2', 'msg-1', 'Second message', { addedConvo: false }),
      ];

      const mapMethod = jest.fn((msg) => ({ ...msg, mapped: true }));
      const mapCondition = (msg) => msg.addedConvo === true;

      const result = AgentClient.getMessagesForConversation({
        messages,
        parentMessageId: 'msg-2',
        mapMethod,
        mapCondition,
      });

      expect(result).toHaveLength(2);
      expect(mapMethod).not.toHaveBeenCalled();
      result.forEach((msg) => {
        expect(msg.mapped).toBeUndefined();
      });
    });

    it('should not call mapMethod when mapMethod is null', () => {
      const messages = [
        createMessage('msg-1', null, 'First message'),
        createMessage('msg-2', 'msg-1', 'Second message'),
      ];

      const mapCondition = jest.fn(() => true);

      const result = AgentClient.getMessagesForConversation({
        messages,
        parentMessageId: 'msg-2',
        mapMethod: null,
        mapCondition,
      });

      expect(result).toHaveLength(2);
      expect(mapCondition).not.toHaveBeenCalled();
    });

    it('should handle mapCondition with complex logic', () => {
      const messages = [
        createMessage('msg-1', null, 'User message', { isCreatedByUser: true, addedConvo: true }),
        createMessage('msg-2', 'msg-1', 'Assistant response', { addedConvo: true }),
        createMessage('msg-3', 'msg-2', 'Another user message', { isCreatedByUser: true }),
        createMessage('msg-4', 'msg-3', 'Another response', { addedConvo: true }),
      ];

      const mapMethod = jest.fn((msg) => ({ ...msg, processed: true }));
      const mapCondition = (msg) => msg.addedConvo === true && !msg.isCreatedByUser;

      const result = AgentClient.getMessagesForConversation({
        messages,
        parentMessageId: 'msg-4',
        mapMethod,
        mapCondition,
      });

      expect(result).toHaveLength(4);
      expect(mapMethod).toHaveBeenCalledTimes(2);

      expect(result[0].processed).toBeUndefined();
      expect(result[1].processed).toBe(true);
      expect(result[2].processed).toBeUndefined();
      expect(result[3].processed).toBe(true);
    });

    it('should preserve message order after applying mapMethod with mapCondition', () => {
      const messages = [
        createMessage('msg-1', null, 'First', { addedConvo: true }),
        createMessage('msg-2', 'msg-1', 'Second', { addedConvo: false }),
        createMessage('msg-3', 'msg-2', 'Third', { addedConvo: true }),
      ];

      const mapMethod = (msg) => ({ ...msg, text: `[MAPPED] ${msg.text}` });
      const mapCondition = (msg) => msg.addedConvo === true;

      const result = AgentClient.getMessagesForConversation({
        messages,
        parentMessageId: 'msg-3',
        mapMethod,
        mapCondition,
      });

      expect(result[0].text).toBe('[MAPPED] First');
      expect(result[1].text).toBe('Second');
      expect(result[2].text).toBe('[MAPPED] Third');
    });

    it('should work with summary option alongside mapMethod and mapCondition', () => {
      const messages = [
        createMessage('msg-1', null, 'First', { addedConvo: false }),
        createMessage('msg-2', 'msg-1', 'Second', {
          summary: 'Summary of conversation',
          addedConvo: true,
        }),
        createMessage('msg-3', 'msg-2', 'Third', { addedConvo: true }),
        createMessage('msg-4', 'msg-3', 'Fourth', { addedConvo: false }),
      ];

      const mapMethod = jest.fn((msg) => ({ ...msg, mapped: true }));
      const mapCondition = (msg) => msg.addedConvo === true;

      const result = AgentClient.getMessagesForConversation({
        messages,
        parentMessageId: 'msg-4',
        mapMethod,
        mapCondition,
        summary: true,
      });

      /** Traversal stops at msg-2 (has summary), so we get msg-4 -> msg-3 -> msg-2 */
      expect(result).toHaveLength(3);
      expect(result[0].content).toEqual([{ type: 'text', text: 'Summary of conversation' }]);
      expect(result[0].role).toBe('system');
      expect(result[0].mapped).toBe(true);
      expect(result[1].mapped).toBe(true);
      expect(result[2].mapped).toBeUndefined();
    });

    it('should handle empty messages array', () => {
      const mapMethod = jest.fn();
      const mapCondition = jest.fn();

      const result = AgentClient.getMessagesForConversation({
        messages: [],
        parentMessageId: 'msg-1',
        mapMethod,
        mapCondition,
      });

      expect(result).toHaveLength(0);
      expect(mapMethod).not.toHaveBeenCalled();
      expect(mapCondition).not.toHaveBeenCalled();
    });

    it('should handle undefined mapCondition explicitly', () => {
      const messages = [
        createMessage('msg-1', null, 'First'),
        createMessage('msg-2', 'msg-1', 'Second'),
      ];

      const mapMethod = jest.fn((msg) => ({ ...msg, mapped: true }));

      const result = AgentClient.getMessagesForConversation({
        messages,
        parentMessageId: 'msg-2',
        mapMethod,
        mapCondition: undefined,
      });

      expect(result).toHaveLength(2);
      expect(mapMethod).toHaveBeenCalledTimes(2);
      result.forEach((msg) => {
        expect(msg.mapped).toBe(true);
      });
    });
  });

  describe('buildMessages - memory context for parallel agents', () => {
    let client;
    let mockReq;
    let mockRes;
    let mockAgent;
    let mockOptions;

    beforeEach(() => {
      jest.clearAllMocks();

      mockAgent = {
        id: 'primary-agent',
        name: 'Primary Agent',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        instructions: 'Primary agent instructions',
        model_parameters: {
          model: 'gpt-4',
        },
        tools: [],
      };

      mockReq = {
        user: {
          id: 'user-123',
          personalization: {
            memories: true,
          },
        },
        body: {
          endpoint: EModelEndpoint.openAI,
        },
        config: {
          memory: {
            disabled: false,
          },
        },
      };

      mockRes = {};

      mockOptions = {
        req: mockReq,
        res: mockRes,
        agent: mockAgent,
        endpoint: EModelEndpoint.agents,
      };

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';
      client.shouldSummarize = false;
      client.maxContextTokens = 4096;
    });

    it('should only pass memory context to the primary agent by default', async () => {
      const memoryContent = 'User prefers dark mode. User is a software developer.';
      client.useMemory = jest
        .fn()
        .mockResolvedValue({ withKeys: memoryContent, withoutKeys: memoryContent });

      const parallelAgent1 = {
        id: 'parallel-agent-1',
        name: 'Parallel Agent 1',
        instructions: 'Parallel agent 1 instructions',
        provider: EModelEndpoint.openAI,
      };

      const parallelAgent2 = {
        id: 'parallel-agent-2',
        name: 'Parallel Agent 2',
        instructions: 'Parallel agent 2 instructions',
        provider: EModelEndpoint.anthropic,
      };

      client.agentConfigs = new Map([
        ['parallel-agent-1', parallelAgent1],
        ['parallel-agent-2', parallelAgent2],
      ]);

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Hello',
          isCreatedByUser: true,
        },
      ];

      await client.buildMessages(messages, null, {
        instructions: 'Base instructions',
        additional_instructions: null,
      });

      expect(client.useMemory).toHaveBeenCalled();

      expect(client.options.agent.instructions).toContain('Primary agent instructions');
      expect(client.options.agent.instructions).not.toContain(memoryContent);
      expect(client.options.agent.additional_instructions).toContain(memoryContent);

      expect(parallelAgent1.instructions).toContain('Parallel agent 1 instructions');
      expect(parallelAgent1.instructions).not.toContain(memoryContent);
      expect(parallelAgent1.additional_instructions ?? '').not.toContain(memoryContent);

      expect(parallelAgent2.instructions).toContain('Parallel agent 2 instructions');
      expect(parallelAgent2.instructions).not.toContain(memoryContent);
      expect(parallelAgent2.additional_instructions ?? '').not.toContain(memoryContent);
    });

    it('applies scoped context to graph-only members without promoting them', async () => {
      client.useMemory = jest.fn().mockResolvedValue(undefined);
      const graphMember = {
        id: 'graph-member',
        name: 'Graph Member',
        instructions: 'Graph member instructions',
        provider: EModelEndpoint.openAI,
      };
      mockAgent.subagentGraphConfigs = [
        {
          definition: { type: 'review_team' },
          memberConfigs: [mockAgent, graphMember],
        },
      ];
      client.agentConfigs = new Map();
      mockBuildAgentScopedContext.mockResolvedValueOnce(
        new Map([['graph-member', 'Graph member context']]),
      );

      await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'Hello',
            isCreatedByUser: true,
          },
        ],
        null,
        { instructions: 'Base instructions', additional_instructions: null },
      );

      expect(mockBuildAgentScopedContext).toHaveBeenCalledWith(
        expect.objectContaining({ agentIds: ['primary-agent', 'graph-member'] }),
      );
      expect(graphMember.additional_instructions).toContain('Graph member context');
      expect(client.agentConfigs).toEqual(new Map());
    });

    it('applies scoped context to graph members resolved by a lazy child', async () => {
      client.useMemory = jest.fn().mockResolvedValue(undefined);
      const graphMember = {
        id: 'lazy-graph-member',
        name: 'Lazy Graph Member',
        instructions: 'Lazy graph member instructions',
        provider: EModelEndpoint.openAI,
      };
      const resolvedChild = {
        id: 'lazy-child',
        name: 'Lazy Child',
        instructions: 'Lazy child instructions',
        provider: EModelEndpoint.openAI,
        subagentGraphConfigs: [
          {
            definition: { type: 'lazy_team' },
            memberConfigs: [graphMember],
          },
        ],
      };
      const descriptor = {
        id: 'lazy-child',
        resolve: jest.fn().mockResolvedValue(resolvedChild),
      };
      mockAgent.lazySubagentConfigs = [descriptor];
      client.agentConfigs = new Map();
      mockBuildAgentScopedContext.mockResolvedValueOnce(new Map()).mockResolvedValueOnce(
        new Map([
          ['lazy-child', 'Lazy child context'],
          ['lazy-graph-member', 'Lazy graph member context'],
        ]),
      );

      await client.buildMessages(
        [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            sender: 'User',
            text: 'Hello',
            isCreatedByUser: true,
          },
        ],
        null,
        { instructions: 'Base instructions', additional_instructions: null },
      );
      const resolved = await descriptor.resolve({ signal: new AbortController().signal });

      expect(resolved).toBe(resolvedChild);
      expect(resolvedChild.additional_instructions).toContain('Lazy child context');
      expect(graphMember.additional_instructions).toContain('Lazy graph member context');
      expect(mockBuildAgentScopedContext).toHaveBeenLastCalledWith(
        expect.objectContaining({ agentIds: ['lazy-child', 'lazy-graph-member'] }),
      );
    });

    it('should pass memory context to parallel agents when automatic memory updates are enabled', async () => {
      const memoryContent = 'User prefers dark mode. User is a software developer.';
      client.useMemory = jest
        .fn()
        .mockResolvedValue({ withKeys: memoryContent, withoutKeys: memoryContent });
      mockReq.config.memory.agent = {
        enabled: true,
        id: 'memory-agent',
      };

      const parallelAgent = {
        id: 'parallel-agent-1',
        name: 'Parallel Agent 1',
        instructions: 'Parallel agent instructions',
        provider: EModelEndpoint.openAI,
      };

      client.agentConfigs = new Map([['parallel-agent-1', parallelAgent]]);

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Hello',
          isCreatedByUser: true,
        },
      ];

      await client.buildMessages(messages, null, {
        instructions: 'Base instructions',
        additional_instructions: null,
      });

      expect(client.options.agent.instructions).toContain('Primary agent instructions');
      expect(client.options.agent.instructions).not.toContain(memoryContent);
      expect(client.options.agent.additional_instructions).toContain(memoryContent);

      expect(parallelAgent.instructions).toContain('Parallel agent instructions');
      expect(parallelAgent.instructions).not.toContain(memoryContent);
      expect(parallelAgent.additional_instructions).toContain(memoryContent);
    });

    it('should not modify parallel agents when no memory context is available', async () => {
      client.useMemory = jest.fn().mockResolvedValue(undefined);

      const parallelAgent = {
        id: 'parallel-agent-1',
        name: 'Parallel Agent 1',
        instructions: 'Original parallel instructions',
        provider: EModelEndpoint.openAI,
      };

      client.agentConfigs = new Map([['parallel-agent-1', parallelAgent]]);

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Hello',
          isCreatedByUser: true,
        },
      ];

      await client.buildMessages(messages, null, {
        instructions: 'Base instructions',
        additional_instructions: null,
      });

      expect(parallelAgent.instructions).toBe('Original parallel instructions');
    });

    it('should handle parallel agents without existing instructions when memory stays primary-only', async () => {
      const memoryContent = 'User is a data scientist.';
      client.useMemory = jest
        .fn()
        .mockResolvedValue({ withKeys: memoryContent, withoutKeys: memoryContent });

      const parallelAgentNoInstructions = {
        id: 'parallel-agent-no-instructions',
        name: 'Parallel Agent No Instructions',
        provider: EModelEndpoint.openAI,
      };

      client.agentConfigs = new Map([
        ['parallel-agent-no-instructions', parallelAgentNoInstructions],
      ]);

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Hello',
          isCreatedByUser: true,
        },
      ];

      await client.buildMessages(messages, null, {
        instructions: null,
        additional_instructions: null,
      });

      expect(client.options.agent.additional_instructions).toContain(memoryContent);
      expect(parallelAgentNoInstructions.instructions).toBeUndefined();
      expect(parallelAgentNoInstructions.additional_instructions ?? '').not.toContain(
        memoryContent,
      );
    });

    it('should not modify agentConfigs when none exist', async () => {
      const memoryContent = 'User prefers concise responses.';
      client.useMemory = jest
        .fn()
        .mockResolvedValue({ withKeys: memoryContent, withoutKeys: memoryContent });

      client.agentConfigs = null;

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Hello',
          isCreatedByUser: true,
        },
      ];

      await expect(
        client.buildMessages(messages, null, {
          instructions: 'Base instructions',
          additional_instructions: null,
        }),
      ).resolves.not.toThrow();

      expect(client.options.agent.additional_instructions).toContain(memoryContent);
    });

    it('should handle empty agentConfigs map', async () => {
      const memoryContent = 'User likes detailed explanations.';
      client.useMemory = jest
        .fn()
        .mockResolvedValue({ withKeys: memoryContent, withoutKeys: memoryContent });

      client.agentConfigs = new Map();

      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: null,
          sender: 'User',
          text: 'Hello',
          isCreatedByUser: true,
        },
      ];

      await expect(
        client.buildMessages(messages, null, {
          instructions: 'Base instructions',
          additional_instructions: null,
        }),
      ).resolves.not.toThrow();

      expect(client.options.agent.additional_instructions).toContain(memoryContent);
    });
  });

  describe('useMemory method - prelimAgent assignment', () => {
    let client;
    let mockReq;
    let mockRes;
    let mockAgent;
    let mockOptions;
    let mockCheckAccess;
    let mockLoadAgent;
    let mockInitializeAgent;
    let mockCreateMemoryProcessor;
    let mockGetFormattedMemories;

    beforeEach(() => {
      jest.clearAllMocks();

      mockAgent = {
        id: 'agent-123',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        instructions: 'Test instructions',
        model: 'gpt-4',
        model_parameters: {
          model: 'gpt-4',
        },
      };

      mockReq = {
        user: {
          id: 'user-123',
          personalization: {
            memories: true,
          },
        },
        config: {
          memory: {
            agent: {
              enabled: true,
              id: 'agent-123',
            },
          },
          endpoints: {
            [EModelEndpoint.agents]: {
              allowedProviders: [EModelEndpoint.openAI],
            },
          },
        },
      };

      mockRes = {};

      mockOptions = {
        req: mockReq,
        res: mockRes,
        agent: mockAgent,
      };

      mockCheckAccess = require('@librechat/api').checkAccess;
      mockLoadAgent = require('@librechat/api').loadAgent;
      mockInitializeAgent = require('@librechat/api').initializeAgent;
      mockCreateMemoryProcessor = require('@librechat/api').createMemoryProcessor;
      mockGetFormattedMemories = require('~/models').getFormattedMemories;
      mockGetFormattedMemories.mockResolvedValue({
        withKeys: '',
        withoutKeys: '',
        totalTokens: 0,
      });
    });

    it('should use current agent when memory config agent.id matches current agent id', async () => {
      mockCheckAccess.mockResolvedValue(true);
      mockInitializeAgent.mockResolvedValue({
        ...mockAgent,
        provider: EModelEndpoint.openAI,
      });
      mockCreateMemoryProcessor.mockResolvedValue([undefined, jest.fn()]);

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';

      await client.useMemory();

      expect(mockLoadAgent).not.toHaveBeenCalled();
      expect(mockInitializeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: mockAgent,
        }),
        expect.any(Object),
      );
    });

    it('should bind memory processing to the current generation epoch', async () => {
      mockReq._resumableStreamId = 'convo-123';
      mockCheckAccess.mockResolvedValue(true);
      mockInitializeAgent.mockResolvedValue({
        ...mockAgent,
        provider: EModelEndpoint.openAI,
      });
      mockCreateMemoryProcessor.mockResolvedValue([undefined, jest.fn()]);

      client = new AgentClient({ ...mockOptions, jobCreatedAt: 1234 });
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';

      await client.useMemory();

      expect(mockCreateMemoryProcessor).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: 'convo-123',
          jobCreatedAt: 1234,
        }),
      );
    });

    it('should pass only source-aware filters to automatic memory processing', async () => {
      const filters = {
        memories: {
          pii: {
            fields: ['value'],
          },
        },
      };
      const legacyPii = {
        starterPatterns: ['email'],
      };
      mockReq.config.filters = filters;
      mockReq.config.messageFilter = { pii: legacyPii };
      mockCheckAccess.mockResolvedValue(true);
      mockInitializeAgent.mockResolvedValue({
        ...mockAgent,
        provider: EModelEndpoint.openAI,
      });
      mockCreateMemoryProcessor.mockResolvedValue([undefined, jest.fn()]);

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';

      await client.useMemory();

      expect(mockCreateMemoryProcessor).toHaveBeenCalledWith(
        expect.objectContaining({
          filters,
        }),
      );
      expect(mockCreateMemoryProcessor.mock.calls[0][0]).not.toHaveProperty('legacyPii');
      expect(mockCreateMemoryProcessor.mock.calls[0][0]).not.toHaveProperty('contentInspection');
    });

    it('should load different agent when memory config agent.id differs from current agent id', async () => {
      const differentAgentId = 'different-agent-456';
      const differentAgent = {
        id: differentAgentId,
        provider: EModelEndpoint.openAI,
        model: 'gpt-4',
        instructions: 'Different agent instructions',
      };

      mockReq.config.memory.agent.id = differentAgentId;

      mockCheckAccess.mockResolvedValue(true);
      mockLoadAgent.mockResolvedValue(differentAgent);
      mockInitializeAgent.mockResolvedValue({
        ...differentAgent,
        provider: EModelEndpoint.openAI,
      });
      mockCreateMemoryProcessor.mockResolvedValue([undefined, jest.fn()]);

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';

      await client.useMemory();

      expect(mockLoadAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: differentAgentId,
        }),
        expect.any(Object),
      );
      expect(mockInitializeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: differentAgent,
        }),
        expect.any(Object),
      );
    });

    it('should return existing memories without auto-processing when memory agent is not enabled', async () => {
      mockReq.config.memory = {
        personalize: true,
      };

      mockCheckAccess.mockResolvedValue(true);
      mockGetFormattedMemories.mockResolvedValue({
        withKeys: 'food: likes pasta',
        withoutKeys: 'likes pasta',
        totalTokens: 3,
      });

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';

      const result = await client.useMemory();

      expect(result).toEqual({ withKeys: 'food: likes pasta', withoutKeys: 'likes pasta' });
      expect(mockGetFormattedMemories).toHaveBeenCalledWith({ userId: 'user-123' });
      expect(mockInitializeAgent).not.toHaveBeenCalled();
      expect(mockCreateMemoryProcessor).not.toHaveBeenCalled();
      expect(client.processMemory).toBeUndefined();
    });

    it('should not initialize auto-processing when no memories exist', async () => {
      mockReq.config.memory = {
        personalize: true,
      };

      mockCheckAccess.mockResolvedValue(true);
      mockGetFormattedMemories.mockResolvedValue({
        withKeys: '',
        withoutKeys: '',
        totalTokens: 0,
      });

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';

      const result = await client.useMemory();

      expect(result).toEqual({ withKeys: '', withoutKeys: '' });
      expect(mockGetFormattedMemories).toHaveBeenCalledWith({ userId: 'user-123' });
      expect(mockInitializeAgent).not.toHaveBeenCalled();
      expect(mockCreateMemoryProcessor).not.toHaveBeenCalled();
      expect(client.processMemory).toBeUndefined();
    });

    it('should return existing memories without auto-processing when memory agent config lacks explicit enablement', async () => {
      mockReq.config.memory.agent = {
        id: 'agent-123',
      };

      mockCheckAccess.mockResolvedValue(true);
      mockGetFormattedMemories.mockResolvedValue({
        withKeys: 'tone: concise',
        withoutKeys: 'prefers concise answers',
        totalTokens: 4,
      });

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';

      const result = await client.useMemory();

      expect(result).toEqual({ withKeys: 'tone: concise', withoutKeys: 'prefers concise answers' });
      expect(mockLoadAgent).not.toHaveBeenCalled();
      expect(mockInitializeAgent).not.toHaveBeenCalled();
      expect(mockCreateMemoryProcessor).not.toHaveBeenCalled();
    });

    it('should return undefined when loading memories fails without auto-processing', async () => {
      const { logger } = require('@librechat/data-schemas');
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
      mockReq.config.memory = {
        personalize: true,
      };

      mockCheckAccess.mockResolvedValue(true);
      mockGetFormattedMemories.mockRejectedValue(new Error('DB connection failed'));

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';

      const result = await client.useMemory();

      expect(result).toBeUndefined();
      expect(mockGetFormattedMemories).toHaveBeenCalledWith({ userId: 'user-123' });
      expect(mockInitializeAgent).not.toHaveBeenCalled();
      expect(mockCreateMemoryProcessor).not.toHaveBeenCalled();
      expect(client.processMemory).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        '[api/server/controllers/agents/client.js #useMemory] Error loading memories',
        { type: 'Error' },
      );
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('DB connection failed');
      errorSpy.mockRestore();
    });

    it('should create ephemeral agent when no id but model and provider are specified', async () => {
      mockReq.config.memory = {
        agent: {
          enabled: true,
          model: 'gpt-4',
          provider: EModelEndpoint.openAI,
        },
      };

      mockCheckAccess.mockResolvedValue(true);
      mockInitializeAgent.mockResolvedValue({
        id: Constants.EPHEMERAL_AGENT_ID,
        model: 'gpt-4',
        provider: EModelEndpoint.openAI,
      });
      mockCreateMemoryProcessor.mockResolvedValue([undefined, jest.fn()]);

      client = new AgentClient(mockOptions);
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';

      await client.useMemory();

      expect(mockLoadAgent).not.toHaveBeenCalled();
      expect(mockInitializeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: expect.objectContaining({
            id: Constants.EPHEMERAL_AGENT_ID,
            model: 'gpt-4',
            provider: EModelEndpoint.openAI,
          }),
        }),
        expect.any(Object),
      );
    });
  });
});

describe('AgentClient - finalizeSubagentContent', () => {
  /** Verifies the backend persistence path: per-subagent
   *  `createContentAggregator` instances (populated by the callbacks
   *  ON_SUBAGENT_UPDATE handler) have their `contentParts` harvested
   *  onto the matching parent `subagent` tool_call at message-save time
   *  so a page refresh shows the same activity the user saw live. */
  const { GraphEvents } = jest.requireActual('@librechat/agents');
  const { getDefaultHandlers } = require('./callbacks');

  const makeClient = (subagentAggregatorsByToolCallId) => {
    const client = new AgentClient({
      req: { user: { id: 'u' }, body: {}, config: { endpoints: {} } },
      res: {},
      agent: {
        id: 'agent',
        endpoint: EModelEndpoint.openAI,
        provider: EModelEndpoint.openAI,
        model_parameters: { model: 'gpt-4' },
      },
      contentParts: [],
      subagentAggregatorsByToolCallId,
    });
    return client;
  };

  const event = (phase, data, parentToolCallId = 'call_sub') => ({
    runId: 'parent-run',
    subagentRunId: 'child-run',
    subagentType: 'self',
    subagentAgentId: 'child',
    parentToolCallId,
    phase,
    data,
    timestamp: '2026-04-17T00:00:00Z',
  });

  /** Feeds a SubagentUpdateEvent sequence through the real
   *  `ON_SUBAGENT_UPDATE` handler so we exercise the same get-or-create
   *  aggregator logic the live request uses, rather than constructing
   *  aggregators directly in the test. */
  const runSubagentEvents = async (events) => {
    const map = new Map();
    const handlers = getDefaultHandlers({
      res: { write: jest.fn(), writableEnded: false },
      aggregateContent: jest.fn(),
      toolEndCallback: jest.fn(),
      collectedUsage: [],
      subagentAggregatorsByToolCallId: map,
    });
    const handler = handlers[GraphEvents.ON_SUBAGENT_UPDATE];
    for (const e of events) {
      await handler.handle(GraphEvents.ON_SUBAGENT_UPDATE, e);
    }
    return map;
  };

  it('attaches aggregated subagent_content to the matching subagent tool_call part', async () => {
    const buffer = await runSubagentEvents([
      event('run_step', {
        id: 'step_msg',
        index: 0,
        stepDetails: { type: 'message_creation' },
      }),
      event('message_delta', {
        id: 'step_msg',
        delta: { content: [{ type: 'text', text: 'Hello ' }] },
      }),
      event('message_delta', {
        id: 'step_msg',
        delta: { content: [{ type: 'text', text: 'world!' }] },
      }),
      event('run_step', {
        id: 'step_tool',
        index: 1,
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'inner_1', name: 'calculator', args: '{}' }],
        },
      }),
      event('run_step_completed', {
        id: 'step_tool',
        index: 1,
        result: {
          id: 'step_tool',
          type: 'tool_call',
          tool_call: {
            id: 'inner_1',
            name: 'calculator',
            output: '4',
            progress: 1,
          },
        },
      }),
    ]);

    const client = makeClient(buffer);
    client.contentParts = [
      {
        type: 'tool_call',
        tool_call: {
          id: 'call_sub',
          name: Constants.SUBAGENT,
          args: '{}',
          output: 'final text',
          progress: 1,
        },
      },
    ];

    client.finalizeSubagentContent();

    const attached = client.contentParts[0].tool_call.subagent_content;
    expect(Array.isArray(attached)).toBe(true);
    expect(attached).toHaveLength(2);
    expect(attached[0].type).toBe('text');
    expect(attached[0].text).toBe('Hello world!');
    expect(attached[1].type).toBe('tool_call');
    expect(attached[1].tool_call.name).toBe('calculator');
    expect(attached[1].tool_call.output).toBe('4');
    /** Buffer drained so a second call (e.g. resumable retry) doesn't
     *  double-append. */
    expect(buffer.size).toBe(0);
  });

  it('ignores tool_call parts whose name is not SUBAGENT', async () => {
    const buffer = await runSubagentEvents([
      event(
        'run_step',
        {
          id: 'step_msg',
          index: 0,
          stepDetails: { type: 'message_creation' },
        },
        'call_regular',
      ),
      event(
        'message_delta',
        {
          id: 'step_msg',
          delta: { content: [{ type: 'text', text: 'x' }] },
        },
        'call_regular',
      ),
    ]);
    const client = makeClient(buffer);
    client.contentParts = [
      {
        type: 'tool_call',
        tool_call: { id: 'call_regular', name: 'calculator', args: '{}' },
      },
    ];
    client.finalizeSubagentContent();
    expect(client.contentParts[0].tool_call.subagent_content).toBeUndefined();
  });

  it('is a safe no-op when the aggregator map is empty or missing', () => {
    const client = makeClient(undefined);
    client.contentParts = [
      {
        type: 'tool_call',
        tool_call: { id: 'call_sub', name: Constants.SUBAGENT, args: '{}' },
      },
    ];
    expect(() => client.finalizeSubagentContent()).not.toThrow();
    expect(client.contentParts[0].tool_call.subagent_content).toBeUndefined();
  });

  it('discards aggregators keyed by a tool_call_id not present in contentParts', async () => {
    const buffer = await runSubagentEvents([
      event(
        'run_step',
        {
          id: 'step_msg',
          index: 0,
          stepDetails: { type: 'message_creation' },
        },
        'call_missing',
      ),
      event(
        'message_delta',
        {
          id: 'step_msg',
          delta: { content: [{ type: 'text', text: 'x' }] },
        },
        'call_missing',
      ),
    ]);
    const client = makeClient(buffer);
    client.contentParts = [
      {
        type: 'tool_call',
        tool_call: { id: 'call_other', name: Constants.SUBAGENT, args: '{}' },
      },
    ];
    client.finalizeSubagentContent();
    expect(client.contentParts[0].tool_call.subagent_content).toBeUndefined();
  });

  it('keeps per-parent tool_call aggregators isolated for parallel subagents', async () => {
    const buffer = await runSubagentEvents([
      event(
        'run_step',
        {
          id: 'step_a',
          index: 0,
          stepDetails: { type: 'message_creation' },
        },
        'call_a',
      ),
      event(
        'message_delta',
        { id: 'step_a', delta: { content: [{ type: 'text', text: 'A' }] } },
        'call_a',
      ),
      event(
        'run_step',
        {
          id: 'step_b',
          index: 0,
          stepDetails: { type: 'message_creation' },
        },
        'call_b',
      ),
      event(
        'message_delta',
        { id: 'step_b', delta: { content: [{ type: 'text', text: 'B' }] } },
        'call_b',
      ),
    ]);
    const client = makeClient(buffer);
    client.contentParts = [
      { type: 'tool_call', tool_call: { id: 'call_a', name: Constants.SUBAGENT, args: '{}' } },
      { type: 'tool_call', tool_call: { id: 'call_b', name: Constants.SUBAGENT, args: '{}' } },
    ];
    client.finalizeSubagentContent();
    expect(client.contentParts[0].tool_call.subagent_content).toEqual([
      expect.objectContaining({ type: 'text', text: 'A' }),
    ]);
    expect(client.contentParts[1].tool_call.subagent_content).toEqual([
      expect.objectContaining({ type: 'text', text: 'B' }),
    ]);
  });
});

describe('AgentClient - resumeCompletion content protection', () => {
  const makeContext = (filters) => ({
    options: {
      req: {
        user: { id: 'user-123' },
        body: { files: [] },
        config: {
          endpoints: { [EModelEndpoint.agents]: { checkpointer: {} } },
          filters,
        },
      },
      agent: {
        id: 'agent-123',
        hide_sequential_outputs: false,
        model_parameters: { model: 'gpt-4' },
        tools: [],
      },
    },
    user: 'user-123',
    conversationId: 'conversation-123',
    responseMessageId: 'response-123',
    parentMessageId: 'parent-123',
    agentConfigs: new Map(),
    contentParts: [],
    collectedUsage: [],
    pendingSubagentEmits: [],
    getEncoding: jest.fn(() => 'o200k_base'),
    buildSteerWiring: jest.fn(),
    buildActivityLabelWiring: jest.fn(() => null),
    buildActivityPhaseWiring: jest.fn(() => null),
    buildReasoningLabelWiring: jest.fn(() => null),
    buildSubagentUsageEmitter: jest.fn(),
    buildDetachedSubagentUsageRecorder: jest.fn(),
    handleRunInterrupt: jest.fn().mockResolvedValue(undefined),
    completeActivityPhase: jest.fn(),
    applyHideSequentialOutputsFilter: jest.fn(),
    rebaseActivityPhaseBounds: jest.fn(),
    finalizeSubagentContent: jest.fn(),
    settleActivityLabels: jest.fn().mockResolvedValue(undefined),
    recordCollectedUsage: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRun.mockReset();
    mockGetAgentCheckpointer.mockReset();
    require('~/models')
      .getMessages.mockReset()
      .mockResolvedValue([
        {
          messageId: 'parent-123',
          parentMessageId: Constants.NO_PARENT,
          isCreatedByUser: true,
          role: 'user',
          text: 'safe',
        },
      ]);
    require('~/models').getFiles.mockReset().mockResolvedValue([]);
  });

  it('blocks checkpoint user content before rebuilding the run', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: {
          channel_values: {
            messages: [{ _getType: () => 'human', content: 'PRIVATE-RESUME-CONTENT' }],
          },
        },
      }),
    });
    const context = makeContext({
      messages: {
        pii: {
          fields: ['text'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'private-resume',
              label: 'private resume content',
              regex: 'PRIVATE-RESUME-CONTENT',
            },
          ],
        },
      },
    });

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} }),
    ).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'message', field: 'text' },
    });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('blocks a path-marked assistant fragment restored from the exact persisted branch', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    require('~/models').getMessages.mockResolvedValue([
      {
        messageId: 'root',
        parentMessageId: Constants.NO_PARENT,
        isCreatedByUser: true,
        role: 'user',
        text: 'safe',
      },
      {
        messageId: 'assistant-1',
        parentMessageId: 'root',
        isCreatedByUser: false,
        role: 'assistant',
        content: [
          { type: ContentTypes.TEXT, text: 'ordinary model prose' },
          { type: ContentTypes.TEXT, text: 'PRIVATE-RESUME-EDIT' },
        ],
        userSubmittedPaths: ['/content/1/text'],
      },
      {
        messageId: 'parent-123',
        parentMessageId: 'assistant-1',
        isCreatedByUser: true,
        role: 'user',
        text: 'continue',
      },
    ]);
    const context = makeContext({
      messages: {
        pii: {
          fields: ['content_part'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'private-resume-edit',
              label: 'private resume edit',
              regex: 'PRIVATE-RESUME-EDIT',
            },
          ],
        },
      },
    });

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} }),
    ).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'message', field: 'content_part' },
    });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('fails closed when the persisted resume branch has a missing ancestor', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    require('~/models').getMessages.mockResolvedValue([
      {
        messageId: 'parent-123',
        parentMessageId: 'missing-ancestor',
        isCreatedByUser: true,
        role: 'user',
        text: 'continue',
      },
    ]);
    const context = makeContext({
      messages: {
        pii: {
          fields: ['text'],
          starterPatterns: ['email'],
        },
      },
    });

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} }),
    ).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      body: { source: 'message', field: 'content_part' },
    });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('allows unmarked model prose and ignores a marked sibling branch on resume', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    require('~/models').getMessages.mockResolvedValue([
      {
        messageId: 'root',
        parentMessageId: Constants.NO_PARENT,
        isCreatedByUser: true,
        role: 'user',
        text: 'safe',
      },
      {
        messageId: 'target-assistant',
        parentMessageId: 'root',
        isCreatedByUser: false,
        role: 'assistant',
        text: 'PRIVATE-MODEL-PROSE',
      },
      {
        messageId: 'parent-123',
        parentMessageId: 'target-assistant',
        isCreatedByUser: true,
        role: 'user',
        text: 'continue target branch',
      },
      {
        messageId: 'sibling-assistant',
        parentMessageId: 'root',
        isCreatedByUser: false,
        role: 'assistant',
        content: [{ type: ContentTypes.TEXT, text: 'PRIVATE-MODEL-PROSE' }],
        userSubmittedPaths: ['/content/0/text'],
      },
      {
        messageId: 'sibling-user',
        parentMessageId: 'sibling-assistant',
        isCreatedByUser: true,
        role: 'user',
        text: 'continue sibling branch',
      },
    ]);
    const resume = jest.fn().mockResolvedValue(undefined);
    mockCreateRun.mockResolvedValue({
      resume,
      getCalibrationRatio: jest.fn(() => 0),
    });
    const context = makeContext({
      messages: {
        pii: {
          fields: ['text', 'content_part'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'private-model-prose',
              label: 'private model prose',
              regex: 'PRIVATE-MODEL-PROSE',
            },
          ],
        },
      },
    });

    await AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} });

    expect(mockCreateRun).toHaveBeenCalledTimes(1);
    expect(mockCreateRun.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        modelCallbacks: [expect.objectContaining({ name: 'librechat-model-bound-content-filter' })],
      }),
    );
    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume.mock.calls[0][1]).not.toHaveProperty('callbacks');
  });

  it('blocks handoff dynamic tool context before rebuilding a resumed run', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    const context = makeContext({
      files: {
        pii: {
          fields: ['content'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'private-resume-dynamic-context',
              label: 'private resume dynamic context',
              regex: 'PRIVATE-RESUME-DYNAMIC-CONTEXT',
            },
          ],
        },
      },
    });
    context.agentConfigs = new Map([
      [
        'handoff-agent',
        {
          id: 'handoff-agent',
          model_parameters: { model: 'gpt-4' },
          dynamicToolContextMap: {
            ignored: 42,
            web_search: 'PRIVATE-RESUME-DYNAMIC-CONTEXT',
          },
        },
      ],
    ]);

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} }),
    ).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'file', field: 'content' },
    });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('blocks a nested pure subagent tool definition before rebuilding a resumed run', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    const context = makeContext({
      agentInstructions: {
        pii: {
          fields: ['description'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'private-resume-subagent-tool',
              label: 'private resume subagent tool',
              regex: 'PRIVATE-RESUME-SUBAGENT-TOOL',
            },
          ],
        },
      },
    });
    context.options.agent.subagentAgentConfigs = [
      {
        id: 'pure-subagent',
        model_parameters: { model: 'gpt-4' },
        subagentAgentConfigs: [
          {
            id: 'nested-pure-subagent',
            model_parameters: { model: 'gpt-4' },
            toolDefinitions: [
              {
                name: 'resume_lookup',
                description: 'PRIVATE-RESUME-SUBAGENT-TOOL',
                parameters: { type: 'object' },
              },
            ],
          },
        ],
      },
    ];

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} }),
    ).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'agent_instruction', field: 'description' },
    });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('re-inspects current extracted file text when policy tightens while paused', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    require('~/models').getMessages.mockResolvedValue([
      {
        messageId: 'parent-123',
        parentMessageId: Constants.NO_PARENT,
        isCreatedByUser: true,
        role: 'user',
        text: 'inspect the attached file',
        files: [{ file_id: 'file-paused', filename: 'report.txt' }],
      },
    ]);
    require('~/models').getFiles.mockResolvedValue([
      {
        file_id: 'file-paused',
        filename: 'report.txt',
        text: 'PRIVATE-EXTRACTED-TEXT',
      },
    ]);
    const context = makeContext({
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'private-extracted-text',
              label: 'private extracted text',
              regex: 'PRIVATE-EXTRACTED-TEXT',
            },
          ],
          uninspectable: 'block',
        },
      },
    });

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} }),
    ).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'file', field: 'extracted_text' },
    });
    expect(require('~/models').getFiles).toHaveBeenCalledWith(
      {
        file_id: { $in: ['file-paused'] },
        user: 'user-123',
      },
      {},
      {},
    );
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('freezes owner-hydrated resume files into the final model callback', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    const storedMessage = {
      messageId: 'parent-123',
      parentMessageId: Constants.NO_PARENT,
      isCreatedByUser: true,
      role: 'user',
      text: 'inspect the attached file',
      files: [{ file_id: 'file-paused', filename: 'report.txt' }],
    };
    require('~/models').getMessages.mockResolvedValue([storedMessage]);
    require('~/models').getFiles.mockResolvedValue([
      {
        file_id: 'file-paused',
        filename: 'report.txt',
        text: 'Safe extracted text',
      },
    ]);
    const resume = jest.fn().mockResolvedValue(undefined);
    mockCreateRun.mockResolvedValue({ resume, getCalibrationRatio: jest.fn(() => 0) });
    const context = makeContext({
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          uninspectable: 'block',
        },
      },
    });

    await AgentClient.prototype.resumeCompletion.call(context, {
      resumeValue: {},
      storedMessages: [storedMessage],
    });

    const [modelBoundCallback] = mockCreateRun.mock.calls[0][0].modelCallbacks;
    expect(() =>
      modelBoundCallback.handleChatModelStart(undefined, [
        [
          {
            role: 'human',
            content: [{ type: 'input_file', file_id: 'file-paused' }],
            additional_kwargs: { sourceMessageId: 'parent-123' },
          },
        ],
      ]),
    ).not.toThrow();
  });

  it('fails closed when a paused file reference cannot be rehydrated', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    require('~/models').getMessages.mockResolvedValue([
      {
        messageId: 'parent-123',
        parentMessageId: Constants.NO_PARENT,
        isCreatedByUser: true,
        role: 'user',
        text: 'inspect the attached file',
        files: [{ file_id: 'missing-paused-file' }],
      },
    ]);
    const context = makeContext({
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          uninspectable: 'block',
        },
      },
    });

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} }),
    ).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      body: { source: 'file', field: 'extracted_text' },
    });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('fails closed when resume file-reference traversal exceeds its depth bound', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    let nested = { file_id: 'deep-paused-file' };
    for (let depth = 0; depth < 30; depth++) {
      nested = { nested };
    }
    require('~/models').getMessages.mockResolvedValue([
      {
        messageId: 'parent-123',
        parentMessageId: Constants.NO_PARENT,
        isCreatedByUser: true,
        role: 'user',
        text: 'inspect the nested file',
        content: [{ type: ContentTypes.TEXT, nested }],
      },
    ]);
    const context = makeContext({
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          uninspectable: 'block',
        },
      },
    });

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} }),
    ).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      body: { source: 'file', field: 'extracted_text' },
    });
    expect(require('~/models').getFiles).not.toHaveBeenCalled();
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('blocks seeded tool arguments before rebuilding the run', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    const context = makeContext({
      toolArguments: {
        pii: {
          fields: ['arguments'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'private-tool-input',
              label: 'private tool input',
              regex: 'PRIVATE-TOOL-INPUT',
            },
          ],
        },
      },
    });

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, {
        resumeValue: {},
        seedContent: [
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: {
              name: 'example_tool',
              arguments: { value: 'PRIVATE-TOOL-INPUT' },
            },
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'tool_argument', field: 'arguments' },
    });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('fails closed when selected seeded tool arguments cannot be fully traversed', async () => {
    mockGetAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: { channel_values: { messages: [] } },
      }),
    });
    const deepArguments = {};
    let current = deepArguments;
    for (let depth = 0; depth < 30; depth++) {
      current.nested = {};
      current = current.nested;
    }
    Object.defineProperty(deepArguments, 'toJSON', {
      value: () => {
        throw new Error('cannot serialize');
      },
    });
    const context = makeContext({
      toolArguments: {
        pii: {
          fields: ['arguments'],
          starterPatterns: ['sk_prefix'],
        },
      },
    });

    await expect(
      AgentClient.prototype.resumeCompletion.call(context, {
        resumeValue: {},
        seedContent: [
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: {
              name: 'example_tool',
              arguments: deepArguments,
            },
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      body: { source: 'tool_argument', field: 'arguments' },
    });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it('does not log or persist provider error content while resuming', async () => {
    const { logger } = require('@librechat/data-schemas');
    const privateValue = 'PRIVATE-RESUME-PROVIDER-CONTENT';
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    mockCreateRun.mockRejectedValue(
      Object.assign(new Error(`Provider echoed ${privateValue}`), {
        code: 'ERR_REMOTE',
        response: { status: 422, data: { prompt: privateValue } },
      }),
    );
    const context = makeContext({
      messages: {
        pii: {
          fields: ['text'],
          starterPatterns: ['email'],
        },
      },
    });

    await AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} });

    expect(context.contentParts).toContainEqual({
      type: ContentTypes.ERROR,
      [ContentTypes.ERROR]: 'An error occurred while resuming the request',
    });
    expect(JSON.stringify(context.contentParts)).not.toContain(privateValue);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(privateValue);
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/server/controllers/agents/client.js #resumeCompletion] Unhandled error',
      expect.objectContaining({ type: 'Error' }),
    );
    errorSpy.mockRestore();
  });

  it('preserves provider error detail when content protection is disabled', async () => {
    const providerMessage = 'Legacy provider detail';
    mockCreateRun.mockRejectedValue(new Error(providerMessage));
    const context = makeContext(undefined);

    await AgentClient.prototype.resumeCompletion.call(context, { resumeValue: {} });

    expect(context.contentParts).toContainEqual({
      type: ContentTypes.ERROR,
      [ContentTypes.ERROR]: `An error occurred while resuming the request: ${providerMessage}`,
    });
  });
});
