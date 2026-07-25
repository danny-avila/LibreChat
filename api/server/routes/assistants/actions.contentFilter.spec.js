const express = require('express');
const request = require('supertest');

const mockEncryptMetadata = jest.fn();
const mockGetOpenAIClient = jest.fn();

jest.mock('~/server/services/ActionService', () => ({
  legacyDomainEncode: jest.fn(),
  encryptMetadata: mockEncryptMetadata,
  domainParser: jest.fn(),
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
});
