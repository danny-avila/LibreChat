const express = require('express');
const request = require('supertest');

jest.mock('~/app/clients/tools', () => ({
  manifestToolMap: {
    azure_ai_search: {
      pluginKey: 'azure_ai_search',
      authConfig: [
        {
          authField: 'AZURE_AI_SEARCH_API_KEY',
          label: 'Azure AI Search API Key',
          sensitive: true,
        },
        {
          authField: 'AZURE_AI_SEARCH_VECTOR_FIELDS',
          label: 'Azure AI Search Vector Field',
          optional: true,
        },
      ],
    },
    test_tool_no_auth: {
      pluginKey: 'test_tool_no_auth',
    },
  },
}));

jest.mock('~/app/clients/tools/util/handleTools', () => ({
  getAuthFields: jest.fn((pluginKey) => {
    if (pluginKey === 'azure_ai_search') {
      return ['AZURE_AI_SEARCH_API_KEY', 'AZURE_AI_SEARCH_VECTOR_FIELDS'];
    }
    return [];
  }),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  toolCallLimiter: (req, res, next) => next(),
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/server/controllers/tools', () => {
  const actual = jest.requireActual('~/server/controllers/tools');
  return {
    ...actual,
    callTool: jest.fn((req, res) => res.status(200).json({})),
    verifyToolAuth: jest.fn((req, res) => res.status(200).json({})),
    getToolCalls: jest.fn((req, res) => res.status(200).json({})),
  };
});

jest.mock('~/server/controllers/PluginController', () => ({
  getAvailableTools: jest.fn((req, res) => res.status(200).json([])),
}));

const { SENSITIVE_FIELD_REDACTED } = require('librechat-data-provider');

describe('Tools Routes', () => {
  let app;
  let toolsRouter;

  beforeAll(() => {
    toolsRouter = require('../agents/tools');

    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      req.user = { id: 'test-user-id' };
      next();
    });

    app.use('/api/agents/tools', toolsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /:pluginKey/auth-values', () => {
    const { loadAuthValues } = require('~/server/services/Tools/credentials');

    it('should return auth values with sensitive fields masked', async () => {
      loadAuthValues.mockResolvedValue({
        AZURE_AI_SEARCH_API_KEY: 'secret-api-key-12345',
        AZURE_AI_SEARCH_VECTOR_FIELDS: 'vector_field_name1,vector_field_name2',
      });

      const response = await request(app).get('/api/agents/tools/azure_ai_search/auth-values');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        authValues: {
          AZURE_AI_SEARCH_API_KEY: SENSITIVE_FIELD_REDACTED,
          AZURE_AI_SEARCH_VECTOR_FIELDS: 'vector_field_name1,vector_field_name2',
        },
      });

      expect(loadAuthValues).toHaveBeenCalledWith({
        userId: 'test-user-id',
        authFields: ['AZURE_AI_SEARCH_API_KEY', 'AZURE_AI_SEARCH_VECTOR_FIELDS'],
        throwError: false,
        pluginKey: 'azure_ai_search',
        skipEnvVars: true,
      });
    });

    it('should return 404 when tool is not found', async () => {
      const response = await request(app).get('/api/agents/tools/non-existent-tool/auth-values');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Tool not found or has no auth config',
      });
    });

    it('should return 404 when tool has no auth config', async () => {
      const response = await request(app).get('/api/agents/tools/test_tool_no_auth/auth-values');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Tool not found or has no auth config',
      });
    });

    it('should not mask empty sensitive fields', async () => {
      loadAuthValues.mockResolvedValue({
        AZURE_AI_SEARCH_API_KEY: '',
        AZURE_AI_SEARCH_VECTOR_FIELDS: 'vector_field_name1,vector_field_name2',
      });

      const response = await request(app).get('/api/agents/tools/azure_ai_search/auth-values');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        authValues: {
          AZURE_AI_SEARCH_API_KEY: '',
          AZURE_AI_SEARCH_VECTOR_FIELDS: 'vector_field_name1,vector_field_name2',
        },
      });
    });

    it('should return empty object when no auth fields exist', async () => {
      const { getAuthFields } = require('~/app/clients/tools/util/handleTools');
      getAuthFields.mockReturnValue([]);

      const response = await request(app).get('/api/agents/tools/azure_ai_search/auth-values');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        authValues: {},
      });
    });
  });
});
