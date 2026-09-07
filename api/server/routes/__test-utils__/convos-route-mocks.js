const archiveAllHandler = jest.fn();
const generationJobManager = {
  getJob: jest.fn().mockResolvedValue(null),
  abortJob: jest.fn().mockResolvedValue({ success: true }),
  getCleanupBlockingJobIdsForUser: jest.fn().mockResolvedValue([]),
  getCleanupBlockingJobIdsForConversations: jest.fn().mockResolvedValue([]),
  getRetainedCheckpointScopesForUser: jest.fn().mockResolvedValue([]),
  acknowledgeCheckpointScopesForUser: jest.fn().mockResolvedValue(),
};
const subagentActivityHandlerInputs = [];
const moderatedTexts = [];
const moderateText = jest.fn((req, _res, next) => {
  moderatedTexts.push(req.body?.text);
  next();
});
const messageIpLimiter = jest.fn((_req, _res, next) => next());
const messageUserLimiter = jest.fn((_req, _res, next) => next());
const checkpointRows = [];
const deleteAgentCheckpoints = jest.fn(async (threadIds = []) => {
  for (let index = checkpointRows.length - 1; index >= 0; index -= 1) {
    if (threadIds.includes(checkpointRows[index].threadId)) {
      checkpointRows.splice(index, 1);
    }
  }
});
const deleteAgentCheckpointScopes = jest.fn(async (scopes = []) => {
  for (let index = checkpointRows.length - 1; index >= 0; index -= 1) {
    const row = checkpointRows[index];
    const matches = scopes.some(
      (scope) =>
        row.threadId === scope.threadId &&
        (row.checkpointNamespace === scope.checkpointNamespace ||
          row.checkpointNamespace.startsWith(`${scope.checkpointNamespace}|`)),
    );
    if (matches) {
      checkpointRows.splice(index, 1);
    }
  }
});

function resetCheckpointRows(rows = []) {
  checkpointRows.splice(0, checkpointRows.length, ...rows);
}

module.exports = {
  archiveAllHandler,
  generationJobManager,
  subagentActivityHandlerInputs,
  moderateText,
  moderatedTexts,
  messageIpLimiter,
  messageUserLimiter,
  checkpointRows,
  resetCheckpointRows,

  agents: () => ({ sleep: jest.fn() }),

  api: (overrides = {}) => ({
    /** Mirrors the real helper so query-flag parsing (`isArchived`, `pinned`) is exercised. */
    isEnabled: jest.fn((value) => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        return value.toLowerCase().trim() === 'true';
      }
      return false;
    }),
    /** Mirrors the real helper so the route's page-size clamping is exercised. */
    normalizeLimit: jest.fn((value, { fallback = 25, max = 100 } = {}) => {
      const raw = Array.isArray(value) ? value[0] : value;
      const limit = parseInt(typeof raw === 'string' ? raw : '', 10);
      if (!Number.isFinite(limit)) {
        return fallback;
      }
      return Math.min(Math.max(limit, 1), max);
    }),
    resolveImportMaxFileSize: jest.fn(() => 262144000),
    createAxiosInstance: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    })),
    logAxiosError: jest.fn(),
    restoreTenantContextFromReq: jest.fn((req, res, next) => next()),
    createArchiveAllHandler: jest.fn(({ archiveAllConvos }) => {
      archiveAllHandler.mockImplementation(async (req, res) => {
        const result = await archiveAllConvos(req.user.id);
        return res.status(200).json(result);
      });
      return archiveAllHandler;
    }),
    createSubagentThreadViewHandler: jest.fn(() => (_req, res) => res.status(200).json({})),
    createSubagentControlHandler: jest.fn(() => (_req, res) => res.status(200).json({})),
    isValidSubagentControlRequest: jest.fn((body) => {
      if (body == null || typeof body !== 'object') return false;
      const commonKeys = ['taskId', 'invocationId', 'action'];
      let allowedKeys = [...commonKeys, 'message'];
      if (body.action === 'cancel_message') allowedKeys = [...commonKeys, 'controlId'];
      if (body.action === 'cancel') allowedKeys = commonKeys;
      if (Object.keys(body).some((key) => !allowedKeys.includes(key))) return false;
      if (typeof body.taskId !== 'string' || body.taskId.length === 0 || body.taskId.length > 256) {
        return false;
      }
      if (
        typeof body.invocationId !== 'string' ||
        body.invocationId.length === 0 ||
        body.invocationId.length > 128
      ) {
        return false;
      }
      if (body.action === 'cancel') return true;
      if (body.action === 'cancel_message') {
        return typeof body.controlId === 'string' && body.controlId.length > 0;
      }
      return (
        ['steer', 'queue', 'interrupt'].includes(body.action) &&
        typeof body.message === 'string' &&
        body.message.trim() !== '' &&
        body.message.length <= 4 * 1024
      );
    }),
    exemptAgentTriggerFromIpLimiter: jest.fn(() => false),
    createParentSubagentIndexHandler: jest.fn(
      () => (_req, res) => res.status(200).json({ threads: [] }),
    ),
    GenerationJobManager: generationJobManager,
    getOwnedAgentCheckpointScope: jest.fn((job, userId, tenantId) => {
      const metadata = job?.metadata;
      if (
        metadata?.userId !== userId ||
        (metadata.tenantId ?? undefined) !== (tenantId ?? undefined) ||
        metadata.generationProtocolVersion !== 2 ||
        typeof metadata.conversationId !== 'string' ||
        metadata.conversationId.length === 0 ||
        typeof metadata.checkpointNamespace !== 'string' ||
        !/^lcg:v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          metadata.checkpointNamespace,
        )
      ) {
        return undefined;
      }
      return {
        threadId: metadata.conversationId,
        checkpointNamespace: metadata.checkpointNamespace,
      };
    }),
    isStopConfirmed: jest.fn(
      (result) => result?.success === true || result?.failureReason === 'already_settled',
    ),
    createSubagentActivityStreamHandler: jest.fn((deps, stream) => {
      subagentActivityHandlerInputs.push({ deps, stream });
      return (_req, res) => res.status(200).end();
    }),
    deleteConvoSharedLinksWithCleanup: jest.fn(),
    deleteAllSharedLinksWithCleanup: jest.fn(),
    deleteAgentCheckpoints,
    deleteAgentCheckpointScopes,
    isConversationImportError: jest.fn((error) => error?.name === 'ConversationImportError'),
    ...overrides,
  }),

  dataSchemas: () => ({
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    createModels: jest.fn(() => ({
      User: {},
      Conversation: {},
      Message: {},
      SharedLink: {},
    })),
  }),

  dataProvider: (overrides = {}) => ({
    CacheKeys: { GEN_TITLE: 'GEN_TITLE' },
    EModelEndpoint: {
      azureAssistants: 'azureAssistants',
      assistants: 'assistants',
    },
    ...overrides,
  }),

  conversationModel: () => ({
    getConvosByCursor: jest.fn(),
    getConvo: jest.fn(),
    deleteConvos: jest.fn(),
    deleteMessages: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    saveConvo: jest.fn(),
  }),

  toolCallModel: () => ({ deleteToolCalls: jest.fn() }),

  sharedModels: () => ({
    getConvosByCursor: jest.fn(),
    getConvo: jest.fn(),
    deleteConvos: jest.fn(),
    deleteMessages: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    archiveAllConvos: jest.fn(),
    saveConvo: jest.fn(),
    setConvoPinned: jest.fn(),
    deleteAllSharedLinks: jest.fn(),
    deleteConvoSharedLink: jest.fn(),
    deleteToolCalls: jest.fn(),
  }),

  requireJwtAuth: () => (req, res, next) => next(),

  middlewarePassthrough: () => ({
    createImportLimiters: jest.fn(() => ({
      importIpLimiter: (req, res, next) => next(),
      importUserLimiter: (req, res, next) => next(),
    })),
    createForkLimiters: jest.fn(() => ({
      forkIpLimiter: (req, res, next) => next(),
      forkUserLimiter: (req, res, next) => next(),
    })),
    configMiddleware: (req, res, next) => next(),
    moderateText,
    messageIpLimiter,
    messageUserLimiter,
    validateConvoAccess: (req, res, next) => next(),
  }),

  forkUtils: () => ({
    forkConversation: jest.fn(),
    duplicateConversation: jest.fn(),
  }),

  importUtils: () => ({ importConversations: jest.fn() }),

  logStores: () => jest.fn(),

  multerSetup: () => ({
    storage: {},
    importFileFilter: jest.fn(),
  }),

  multerLib: () =>
    jest.fn(() => ({
      single: jest.fn(() => (req, res, next) => {
        req.file = { path: '/tmp/test-file.json' };
        next();
      }),
    })),

  assistantEndpoint: () => ({ initializeClient: jest.fn() }),

  subagentThreadStore: () => ({
    subscribeActivity: jest.fn(),
    cancelAndDrainForOwner: jest.fn().mockResolvedValue(undefined),
    withOwnerDeletionFence: jest.fn().mockImplementation(async (_userId, _tenantId, deletion) => {
      return deletion();
    }),
    planCancellationForConversations: jest
      .fn()
      .mockImplementation(async (userId, conversationIds, tenantId) => ({
        userId,
        tenantId,
        conversationIds: [...conversationIds],
        scopes: [],
        leases: [],
      })),
    cancelPlan: jest.fn().mockResolvedValue(0),
    cancelForOwner: jest.fn(),
  }),
};
