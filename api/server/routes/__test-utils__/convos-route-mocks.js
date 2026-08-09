/**
 * Mirrors the real `isEnabled` rather than returning `undefined` for everything.
 * A stub that answers `undefined` to `?isArchived=true` makes the archived
 * filter unobservable, so every assertion about what the listing and the search
 * were asked for passes whichever way the route reads the flag.
 */
const isEnabledImpl = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase().trim() === 'true';
  }
  return false;
};

module.exports = {
  agents: () => ({ sleep: jest.fn() }),

  api: (overrides = {}) => ({
    isEnabled: jest.fn(isEnabledImpl),
    resolveImportMaxFileSize: jest.fn(() => 262144000),
    createAxiosInstance: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    })),
    logAxiosError: jest.fn(),
    restoreTenantContextFromReq: jest.fn((req, res, next) => next()),
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
    saveConvo: jest.fn(),
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
};
