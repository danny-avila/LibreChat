const archiveAllHandler = jest.fn();
const markConvoSeenHandler = jest.fn();
const markConvoUnreadHandler = jest.fn();

module.exports = {
  archiveAllHandler,
  markConvoSeenHandler,
  markConvoUnreadHandler,

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
    /* Wiring only. The handlers' own validation and error mapping are covered against the
       real implementations in `packages/api/src/conversations/read.spec.ts`; mirroring them
       here would leave the route suite asserting against a copy. */
    createMarkConvoSeenHandler: jest.fn(({ markConvoSeen }) => {
      markConvoSeenHandler.mockImplementation(async (req, res) => {
        const result = await markConvoSeen(req.user.id, req.body?.arg?.conversationId);
        return res.status(200).json(result);
      });
      return markConvoSeenHandler;
    }),
    createMarkConvoUnreadHandler: jest.fn(({ markConvoUnread }) => {
      markConvoUnreadHandler.mockImplementation(async (req, res) => {
        const result = await markConvoUnread(req.user.id, req.body?.arg?.conversationId);
        return res.status(200).json(result);
      });
      return markConvoUnreadHandler;
    }),
    deleteConvoSharedLinksWithCleanup: jest.fn(),
    deleteAllSharedLinksWithCleanup: jest.fn(),
    deleteAgentCheckpoints: jest.fn(),
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
    saveConvo: jest.fn(),
  }),

  toolCallModel: () => ({ deleteToolCalls: jest.fn() }),

  sharedModels: () => ({
    getConvosByCursor: jest.fn(),
    getConvo: jest.fn(),
    deleteConvos: jest.fn(),
    archiveAllConvos: jest.fn(),
    saveConvo: jest.fn(),
    setConvoPinned: jest.fn(),
    markConvoSeen: jest.fn(),
    markConvoUnread: jest.fn(),
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
