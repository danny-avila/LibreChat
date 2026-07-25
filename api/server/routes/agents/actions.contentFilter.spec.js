const express = require('express');
const request = require('supertest');

const mockEncryptMetadata = jest.fn();
const mockDecryptMetadata = jest.fn();
const mockDomainParser = jest.fn();

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  generateCheckAccess: jest.fn(() => (_req, _res, next) => next()),
  isActionDomainAllowed: jest.fn().mockResolvedValue(true),
}));
jest.mock('~/server/services/ActionService', () => ({
  decryptMetadata: mockDecryptMetadata,
  encryptMetadata: mockEncryptMetadata,
  domainParser: mockDomainParser,
}));
jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn(),
}));
jest.mock('~/server/services/Agents/ownerContact', () => ({
  attachOwnerContacts: jest.fn(),
}));
jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
  deleteTokens: jest.fn(),
  getListAgentsByAccess: jest.fn(),
  getActions: jest.fn(),
  getAgent: jest.fn(),
  updateAgent: jest.fn(),
  updateAction: jest.fn(),
  deleteAction: jest.fn(),
}));
jest.mock('~/server/middleware', () => ({
  canAccessAgentResource: jest.fn(() => (_req, _res, next) => next()),
}));

const router = require('./actions');
const db = require('~/models');

function createApp(filters) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.config = { filters };
    req.user = { id: 'user-id', role: 'USER' };
    next();
  });
  app.use(router);
  return app;
}

describe('agent action content filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncryptMetadata.mockImplementation(async (metadata) => metadata);
    mockDecryptMetadata.mockImplementation(async (metadata) => metadata);
    mockDomainParser.mockResolvedValue('encoded');
    db.getAgent.mockResolvedValue({
      id: 'agent-id',
      actions: [],
      tools: [],
      author: 'owner-id',
    });
    db.getActions.mockResolvedValue([]);
  });

  it('blocks nested authorization metadata before encryption or persistence', async () => {
    const app = createApp({
      actionMetadata: {
        pii: {
          fields: ['authorization_url'],
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
      .post('/agent-id')
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
          auth: {
            authorization_url: 'https://auth.example.test/BLOCK-AUTH',
          },
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'content_filter_block',
        source: 'action_metadata',
        field: 'authorization_url',
      }),
    );
    expect(mockEncryptMetadata).not.toHaveBeenCalled();
  });

  it('blocks a generated agent tool name that matches only after transformation', async () => {
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
      .post('/agent-id')
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
    expect(db.updateAgent).not.toHaveBeenCalled();
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
        agent_id: 'agent-id',
        metadata: {
          domain: 'example.test',
          privacy_policy_url: 'https://example.test/BLOCK-STORED',
        },
      },
    ]);

    const response = await request(app)
      .post('/agent-id')
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
    expect(db.updateAgent).not.toHaveBeenCalled();
    expect(db.updateAction).not.toHaveBeenCalled();
  });
});
