const express = require('express');
const request = require('supertest');

const mockEncryptMetadata = jest.fn();
const mockDecryptMetadata = jest.fn();
const mockDomainParser = jest.fn();
const mockGetOpenAIClient = jest.fn();
const mockAssistantUpdate = jest.fn();

jest.mock('~/server/services/ActionService', () => ({
  legacyDomainEncode: jest.fn(),
  decryptMetadata: mockDecryptMetadata,
  encryptMetadata: mockEncryptMetadata,
  domainParser: mockDomainParser,
}));
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isActionDomainAllowed: jest.fn().mockResolvedValue(true),
}));
jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: mockGetOpenAIClient,
}));
jest.mock('~/models', () => ({
  getAssistant: jest.fn(),
  getActions: jest.fn(),
  updateAssistantDoc: jest.fn(),
  updateAction: jest.fn(),
  deleteAction: jest.fn(),
}));

const router = require('./actions');
const db = require('~/models');

function createApp(filters) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.config = { filters };
    req.user = { id: 'user-id' };
    next();
  });
  app.use(router);
  return app;
}

describe('assistant action content filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncryptMetadata.mockImplementation(async (metadata) => metadata);
    mockDecryptMetadata.mockImplementation(async (metadata) => metadata);
    mockDomainParser.mockResolvedValue('encoded');
    mockGetOpenAIClient.mockResolvedValue({
      openai: {
        beta: {
          assistants: {
            retrieve: jest.fn().mockResolvedValue({ tools: [] }),
            update: mockAssistantUpdate,
          },
        },
      },
    });
    db.getAssistant.mockResolvedValue({ actions: [], user: 'owner-id' });
  });

  it('blocks submitted function definitions before encryption or external work', async () => {
    const app = createApp({
      agentInstructions: {
        pii: {
          fields: ['description'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'submitted-content',
              label: 'submitted content',
              regex: 'BLOCK-[A-Z]+',
            },
          ],
        },
      },
    });

    const response = await request(app)
      .post('/assistant-id')
      .send({
        functions: [
          {
            type: 'function',
            function: {
              name: 'lookup',
              description: 'BLOCK-ACTION',
              parameters: { type: 'object' },
            },
          },
        ],
        metadata: {
          domain: 'example.test',
          raw_spec: 'openapi: 3.0.0',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_block',
        source: 'agent_instruction',
        field: 'description',
      }),
    );
    expect(mockEncryptMetadata).not.toHaveBeenCalled();
    expect(mockGetOpenAIClient).not.toHaveBeenCalled();
  });

  it('blocks a submitted raw specification before encryption or external work', async () => {
    const app = createApp({
      toolArguments: {
        pii: {
          fields: ['arguments'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'submitted-content',
              label: 'submitted content',
              regex: 'BLOCK-[A-Z]+',
            },
          ],
        },
      },
    });

    const response = await request(app)
      .post('/assistant-id')
      .send({
        functions: [
          {
            type: 'function',
            function: {
              name: 'lookup',
              description: 'Lookup',
              parameters: { type: 'object' },
            },
          },
        ],
        metadata: {
          domain: 'example.test',
          raw_spec: 'openapi: 3.0.0\ninfo:\n  title: BLOCK-SPEC',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_block',
        source: 'tool_argument',
        field: 'arguments',
      }),
    );
    expect(mockEncryptMetadata).not.toHaveBeenCalled();
    expect(mockGetOpenAIClient).not.toHaveBeenCalled();
  });

  it('blocks submitted action credentials through the action metadata policy', async () => {
    const app = createApp({
      actionMetadata: {
        pii: {
          fields: ['oauth_client_secret'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'submitted-content',
              label: 'submitted content',
              regex: 'BLOCK-[A-Z]+',
            },
          ],
        },
      },
    });

    const response = await request(app)
      .post('/assistant-id')
      .send({
        functions: [
          {
            type: 'function',
            function: {
              name: 'lookup',
              description: 'Lookup',
              parameters: { type: 'object' },
            },
          },
        ],
        metadata: {
          domain: 'example.test',
          oauth_client_secret: 'BLOCK-SECRET',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_block',
        source: 'action_metadata',
        field: 'oauth_client_secret',
      }),
    );
    expect(mockEncryptMetadata).not.toHaveBeenCalled();
    expect(mockGetOpenAIClient).not.toHaveBeenCalled();
  });

  it('blocks a generated provider tool name that matches only after transformation', async () => {
    const app = createApp({
      toolArguments: {
        pii: {
          fields: ['name'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'generated-name',
              label: 'generated name',
              regex: 'lookup_action_encoded',
            },
          ],
        },
      },
    });

    const response = await request(app)
      .post('/assistant-id')
      .send({
        functions: [
          {
            type: 'function',
            function: {
              name: 'lookup',
              description: 'Lookup',
              parameters: { type: 'object' },
            },
          },
        ],
        metadata: {
          domain: 'example.test',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_block',
        source: 'tool_argument',
        field: 'name',
      }),
    );
    expect(mockAssistantUpdate).not.toHaveBeenCalled();
    expect(db.updateAction).not.toHaveBeenCalled();
  });

  it('rechecks stored metadata merged by a partial action update', async () => {
    const app = createApp({
      actionMetadata: {
        pii: {
          fields: ['privacy_policy_url'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'stored-metadata',
              label: 'stored metadata',
              regex: 'BLOCK-STORED',
            },
          ],
        },
      },
    });
    db.getActions.mockResolvedValue([
      {
        action_id: 'action-1',
        assistant_id: 'assistant-id',
        metadata: {
          domain: 'example.test',
          privacy_policy_url: 'https://example.test/BLOCK-STORED',
        },
      },
    ]);

    const response = await request(app)
      .post('/assistant-id')
      .send({
        action_id: 'action-1',
        functions: [
          {
            type: 'function',
            function: {
              name: 'lookup',
              description: 'Lookup',
              parameters: { type: 'object' },
            },
          },
        ],
        metadata: {
          domain: 'example.test',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_block',
        source: 'action_metadata',
        field: 'privacy_policy_url',
      }),
    );
    expect(mockAssistantUpdate).not.toHaveBeenCalled();
    expect(db.updateAction).not.toHaveBeenCalled();
  });
});
