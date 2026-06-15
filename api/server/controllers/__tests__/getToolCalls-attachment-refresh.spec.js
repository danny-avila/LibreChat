const express = require('express');
const request = require('supertest');

jest.mock('@librechat/api', () => ({
  checkAccess: jest.fn().mockResolvedValue(true),
  loadWebSearchAuth: jest.fn(),
  refreshS3Url: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
  createToolCall: jest.fn(),
  getToolCallsByConvo: jest.fn(),
  getMessage: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  processFileURL: jest.fn(),
  uploadImageBuffer: jest.fn(),
}));

jest.mock('~/server/services/Files/retention', () => ({
  getRetentionExpiry: jest.fn(),
}));

jest.mock('~/server/services/Files/Code/process', () => ({
  processCodeOutput: jest.fn(),
  runPreviewFinalize: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/app/clients/tools/util', () => ({
  loadTools: jest.fn(),
}));

const { getToolCallsByConvo } = require('~/models');
const { refreshS3Url } = require('@librechat/api');
const { FileSources } = require('librechat-data-provider');
const { getToolCalls } = require('../tools');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/agents/tools/calls', (req, res, next) => {
    req.user = { id: 'u1' };
    return getToolCalls(req, res, next);
  });
  return app;
}

describe('GET /api/agents/tools/calls — refresh expired S3 presigned URLs', () => {
  const STALE = 'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=OLD&X-Amz-Expires=120';
  const FRESH = 'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=NEW&X-Amz-Expires=120';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rewrites stale presigned URLs in toolcalls[].attachments[]', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    getToolCallsByConvo.mockResolvedValue([
      {
        conversationId: 'c1',
        messageId: 'm1',
        toolId: 'execute_code',
        attachments: [{ file_id: 'tc1', source: FileSources.s3, filepath: STALE }],
      },
    ]);

    const res = await request(buildApp()).get('/api/agents/tools/calls?conversationId=c1');

    expect(res.status).toBe(200);
    expect(res.body[0].attachments[0].filepath).toBe(FRESH);
    expect(res.body[0].attachments[0].file_id).toBe('tc1');
  });

  test('toolcalls without attachments pass through cleanly', async () => {
    getToolCallsByConvo.mockResolvedValue([
      { conversationId: 'c1', messageId: 'm1', toolId: 'web_search', result: {} },
    ]);

    const res = await request(buildApp()).get('/api/agents/tools/calls?conversationId=c1');

    expect(res.status).toBe(200);
    expect(refreshS3Url).not.toHaveBeenCalled();
  });
});
