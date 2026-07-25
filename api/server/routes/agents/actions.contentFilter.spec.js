const express = require('express');
const request = require('supertest');

const mockEncryptMetadata = jest.fn();

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  generateCheckAccess: jest.fn(() => (_req, _res, next) => next()),
}));
jest.mock('~/server/services/ActionService', () => ({
  encryptMetadata: mockEncryptMetadata,
  domainParser: jest.fn(),
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
});
