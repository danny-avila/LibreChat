const express = require('express');
const request = require('supertest');

const picker = require('~/server/services/OneCode/projectPicker');
const mockRequireJwtAuth = jest.fn((_req, _res, next) => next());

jest.mock('~/server/services/OneCode/projectPicker', () => ({
  createOneCodeProject: jest.fn(),
  discoverOneCodeModels: jest.fn(),
  getOneCodeModelConfig: jest.fn(),
  getOneCodeProjectStatus: jest.fn(),
  getOneCodeRunEvidence: jest.fn(),
  getOneCodeVerifierPresets: jest.fn(),
  isLocalRequest: jest.fn(() => true),
  pickOneCodeProjectFolder: jest.fn(),
  syncOneCodeFilesystemMCP: jest.fn(),
  writeOneCodeModelConfig: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (...args) => mockRequireJwtAuth(...args),
}));

describe('OneCode local project routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    picker.isLocalRequest.mockReturnValue(true);
    app = express();
    app.use(express.json());
    app.use('/api/onecode', require('./onecode'));
  });

  it('opens a local folder picker for existing projects', async () => {
    picker.pickOneCodeProjectFolder.mockResolvedValue({ workspace: '/Users/aidi/project-a' });

    const response = await request(app).post('/api/onecode/projects/pick');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ workspace: '/Users/aidi/project-a' });
  });

  it('creates a new project after selecting a parent folder', async () => {
    picker.createOneCodeProject.mockResolvedValue({ workspace: '/Users/aidi/projects/demo' });

    const response = await request(app).post('/api/onecode/projects/create').send({ name: 'demo' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ workspace: '/Users/aidi/projects/demo' });
    expect(picker.createOneCodeProject).toHaveBeenCalledWith('demo');
  });

  it('rejects non-local requests', async () => {
    picker.isLocalRequest.mockReturnValue(false);

    const response = await request(app).post('/api/onecode/projects/pick');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'OneCode project picker is local-only' });
    expect(picker.pickOneCodeProjectFolder).not.toHaveBeenCalled();
  });

  it('rejects a missing JWT before checking local request access', async () => {
    mockRequireJwtAuth.mockImplementationOnce((_req, res) =>
      res.status(401).json({ error: 'Unauthorized' }),
    );

    const response = await request(app).post('/api/onecode/projects/pick');

    expect(response.status).toBe(401);
    expect(picker.isLocalRequest).not.toHaveBeenCalled();
    expect(picker.pickOneCodeProjectFolder).not.toHaveBeenCalled();
  });

  it('syncs the OneCode filesystem MCP server for the active workspace', async () => {
    picker.syncOneCodeFilesystemMCP.mockResolvedValue({
      serverName: 'onecode-filesystem',
      status: 'updated',
    });

    const response = await request(app)
      .post('/api/onecode/projects/mcp/sync')
      .send({ workspace: '/Users/aidi/project-a' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ serverName: 'onecode-filesystem', status: 'updated' });
    expect(picker.syncOneCodeFilesystemMCP).toHaveBeenCalledWith(
      '/Users/aidi/project-a',
      undefined,
    );
  });

  it('forwards verifier presets requests', async () => {
    picker.getOneCodeVerifierPresets.mockResolvedValue({ presets: [] });

    const response = await request(app).get('/api/onecode/verifier/presets');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ presets: [] });
    expect(picker.getOneCodeVerifierPresets).toHaveBeenCalledWith();
  });

  it('forwards masked OneCode model config requests', async () => {
    picker.getOneCodeModelConfig.mockResolvedValue({
      configured: true,
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      api_key_preview: 'sk-t...cret',
      models: ['gpt-5.5'],
    });

    const response = await request(app).get('/api/onecode/model-config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      configured: true,
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      api_key_preview: 'sk-t...cret',
      models: ['gpt-5.5'],
    });
    expect(picker.getOneCodeModelConfig).toHaveBeenCalledWith();
  });

  it('rejects a project status request without a workspace', async () => {
    const response = await request(app).get('/api/onecode/projects/status');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'workspace is required' });
    expect(picker.getOneCodeProjectStatus).not.toHaveBeenCalled();
  });

  it('forwards OneCode model config writes', async () => {
    picker.writeOneCodeModelConfig.mockResolvedValue({
      configured: true,
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      models: ['gpt-5.5', 'gpt-4.1'],
    });

    const response = await request(app)
      .post('/api/onecode/model-config')
      .send({
        endpoint: 'http://localhost:6780/v1/chat/completions',
        apiKey: 'sk-test-secret',
        model: 'gpt-5.5',
        models: ['gpt-5.5', 'gpt-4.1'],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      configured: true,
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      models: ['gpt-5.5', 'gpt-4.1'],
    });
    expect(picker.writeOneCodeModelConfig).toHaveBeenCalledWith({
      endpoint: 'http://localhost:6780/v1/chat/completions',
      apiKey: 'sk-test-secret',
      model: 'gpt-5.5',
      models: ['gpt-5.5', 'gpt-4.1'],
    });
  });

  it('forwards OneCode model discovery requests', async () => {
    picker.discoverOneCodeModels.mockResolvedValue({
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      models: ['gpt-5.5', 'gpt-4.1'],
      source: 'remote',
    });

    const response = await request(app).post('/api/onecode/models/discover').send({
      endpoint: 'http://localhost:6780/v1/chat/completions',
      apiKey: 'sk-test-secret',
      save: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      models: ['gpt-5.5', 'gpt-4.1'],
      source: 'remote',
    });
    expect(picker.discoverOneCodeModels).toHaveBeenCalledWith({
      endpoint: 'http://localhost:6780/v1/chat/completions',
      apiKey: 'sk-test-secret',
      save: true,
    });
  });

  it('forwards run evidence requests', async () => {
    picker.getOneCodeRunEvidence.mockResolvedValue({ summary: { run_id: 'run-1' } });

    const response = await request(app).get(
      '/api/onecode/runs/run-1/evidence?workspace=/tmp/project',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ summary: { run_id: 'run-1' } });
    expect(picker.getOneCodeRunEvidence).toHaveBeenCalledWith('/tmp/project', 'run-1');
  });
});
