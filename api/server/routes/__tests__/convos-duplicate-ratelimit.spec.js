const express = require('express');
const request = require('supertest');

process.env.FORK_USER_MAX = '2';
process.env.FORK_USER_WINDOW = '1';
process.env.FORK_IP_MAX = '100';
process.env.FORK_IP_WINDOW = '1';

jest.mock('@librechat/agents', () => ({ sleep: jest.fn() }));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(),
  limiterCache: jest.fn(() => undefined),
  createAxiosInstance: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  })),
  logAxiosError: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
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
}));

jest.mock('librechat-data-provider', () => ({
  CacheKeys: { GEN_TITLE: 'GEN_TITLE' },
  EModelEndpoint: {
    azureAssistants: 'azureAssistants',
    assistants: 'assistants',
  },
  ViolationTypes: { FILE_UPLOAD_LIMIT: 'file_upload_limit' },
}));

jest.mock('~/cache/logViolation', () => jest.fn().mockResolvedValue(undefined));
jest.mock('~/cache/getLogStores', () => jest.fn());

jest.mock('~/models/Conversation', () => ({
  getConvosByCursor: jest.fn(),
  getConvo: jest.fn(),
  deleteConvos: jest.fn(),
  saveConvo: jest.fn(),
}));

jest.mock('~/models/ToolCall', () => ({ deleteToolCalls: jest.fn() }));
jest.mock('~/models', () => ({
  deleteAllSharedLinks: jest.fn(),
  deleteConvoSharedLink: jest.fn(),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());

jest.mock('~/server/middleware', () => {
  const { createForkLimiters } = jest.requireActual('~/server/middleware/limiters/forkLimiters');
  return {
    createImportLimiters: jest.fn(() => ({
      importIpLimiter: (req, res, next) => next(),
      importUserLimiter: (req, res, next) => next(),
    })),
    createForkLimiters,
    configMiddleware: (req, res, next) => next(),
    validateConvoAccess: (req, res, next) => next(),
  };
});

jest.mock('~/server/utils/import/fork', () => ({
  forkConversation: jest.fn(),
  duplicateConversation: jest.fn(),
}));

jest.mock('~/server/utils/import', () => ({ importConversations: jest.fn() }));

jest.mock('~/server/routes/files/multer', () => ({
  storage: {},
  importFileFilter: jest.fn(),
}));

jest.mock('multer', () =>
  jest.fn(() => ({
    single: jest.fn(() => (req, res, next) => {
      req.file = { path: '/tmp/test-file.json' };
      next();
    }),
  })),
);

jest.mock('~/server/services/Endpoints/azureAssistants', () => ({
  initializeClient: jest.fn(),
}));

jest.mock('~/server/services/Endpoints/assistants', () => ({
  initializeClient: jest.fn(),
}));

describe('POST /api/convos/duplicate - Rate Limiting', () => {
  let app;
  const { duplicateConversation } = require('~/server/utils/import/fork');

  beforeAll(() => {
    const convosRouter = require('../convos');
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'rate-limit-test-user' };
      next();
    });
    app.use('/api/convos', convosRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    duplicateConversation.mockResolvedValue({
      conversation: { conversationId: 'duplicated-conv' },
    });
  });

  it('should have rate limiting middleware on the /duplicate route', () => {
    const convosRouter = require('../convos');
    const duplicateLayer = convosRouter.stack.find(
      (layer) => layer.route?.path === '/duplicate' && layer.route?.methods?.post,
    );

    expect(duplicateLayer).toBeDefined();
    expect(duplicateLayer.route.stack.length).toBeGreaterThanOrEqual(3);
  });

  it('should return 429 after exceeding the user rate limit', async () => {
    const userMax = parseInt(process.env.FORK_USER_MAX, 10);

    for (let i = 0; i < userMax; i++) {
      const res = await request(app)
        .post('/api/convos/duplicate')
        .send({ conversationId: 'conv-123', title: 'Test' });
      expect(res.status).toBe(201);
    }

    const res = await request(app)
      .post('/api/convos/duplicate')
      .send({ conversationId: 'conv-123', title: 'Test' });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/too many/i);
  });
});
