const childProcess = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

const {
  createOneCodeProject,
  discoverOneCodeModels,
  filesystemMCPConfig,
  getOneCodeModelConfig,
  getOneCodeVerifierPresets,
  isLocalRequest,
  pickOneCodeProjectFolder,
  sanitizeProjectName,
  syncOneCodeFilesystemMCP,
  writeOneCodeModelConfig,
  writeOneCodeVerifierPolicy,
} = require('./projectPicker');

describe('OneCode project picker service', () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ONECODE_ALLOWED_WORKSPACE_ROOTS;
    delete process.env.ONECODE_WORKSPACE_ROOT;
    delete process.env.ONECODE_API_BASE_URL;
    delete global.fetch;
  });

  it('allows only local loopback requests', () => {
    expect(isLocalRequest({ ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } })).toBe(true);
    expect(isLocalRequest({ ip: '::1', socket: { remoteAddress: '::1' } })).toBe(true);
    expect(
      isLocalRequest({ ip: '::ffff:127.0.0.1', socket: { remoteAddress: '::ffff:127.0.0.1' } }),
    ).toBe(true);
    expect(isLocalRequest({ ip: '10.0.0.8', socket: { remoteAddress: '10.0.0.8' } })).toBe(false);
  });

  it('returns the folder selected by the macOS picker', async () => {
    childProcess.execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(null, { stdout: '/Users/aidi/project-a\n', stderr: '' });
    });

    await expect(pickOneCodeProjectFolder()).resolves.toEqual({
      workspace: '/Users/aidi/project-a',
    });
  });

  it('returns cancelled when the user cancels the picker', async () => {
    childProcess.execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(Object.assign(new Error('cancelled'), { code: 1 }), { stdout: '', stderr: '' });
    });

    await expect(pickOneCodeProjectFolder()).resolves.toEqual({ cancelled: true });
  });

  it('sanitizes project names for local folder creation', () => {
    expect(sanitizeProjectName('  demo app  ')).toBe('demo app');
    expect(() => sanitizeProjectName('../demo')).toThrow('invalid project name');
    expect(() => sanitizeProjectName('demo/app')).toThrow('invalid project name');
    expect(() => sanitizeProjectName('')).toThrow('project name is required');
  });

  it('creates a new project inside the selected parent folder', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'onecode-project-picker-'));
    childProcess.execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(null, { stdout: `${tmp}\n`, stderr: '' });
    });

    const result = await createOneCodeProject('demo');

    expect(result).toEqual({ workspace: path.join(tmp, 'demo') });
    await expect(fs.stat(path.join(tmp, 'demo'))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
  });

  it('builds a filesystem MCP config for the selected workspace', () => {
    expect(filesystemMCPConfig('/Users/aidi/project-a')).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/aidi/project-a'],
      title: 'OneCode Filesystem',
      description: 'Filesystem tools scoped to the active OneCode project.',
      chatMenu: true,
      startup: false,
    });
  });

  it('adds the OneCode filesystem MCP server when missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        allowed: true,
        exists: true,
        workspace: '/canonical/project-a',
      }),
    });
    const registry = {
      getServerConfig: jest.fn().mockResolvedValue(undefined),
      addServer: jest.fn().mockResolvedValue({ serverName: 'onecode-filesystem' }),
      updateServer: jest.fn(),
    };
    const manager = { disconnectUserConnection: jest.fn() };

    await expect(
      syncOneCodeFilesystemMCP('/Users/aidi/project-a', 'user-1', { registry, manager }),
    ).resolves.toEqual({ serverName: 'onecode-filesystem', status: 'created' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:19080/v1/onecode/project/status?workspace=%2FUsers%2Faidi%2Fproject-a',
      expect.any(Object),
    );
    expect(registry.addServer).toHaveBeenCalledWith(
      'onecode-filesystem',
      filesystemMCPConfig('/canonical/project-a'),
      'CACHE',
      'user-1',
    );
    expect(registry.updateServer).not.toHaveBeenCalled();
    expect(manager.disconnectUserConnection).toHaveBeenCalledWith('user-1', 'onecode-filesystem');
  });

  it('updates the OneCode filesystem MCP server when it already exists', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        allowed: true,
        exists: true,
        workspace: '/canonical/project-a',
      }),
    });
    const registry = {
      getServerConfig: jest.fn().mockResolvedValue(filesystemMCPConfig('/old/project')),
      addServer: jest.fn(),
      updateServer: jest.fn().mockResolvedValue(filesystemMCPConfig('/canonical/project-a')),
    };
    const manager = { disconnectUserConnection: jest.fn() };

    await expect(
      syncOneCodeFilesystemMCP('/Users/aidi/project-a', 'user-1', { registry, manager }),
    ).resolves.toEqual({ serverName: 'onecode-filesystem', status: 'updated' });
    expect(registry.updateServer).toHaveBeenCalledWith(
      'onecode-filesystem',
      filesystemMCPConfig('/canonical/project-a'),
      'CACHE',
      'user-1',
    );
    expect(registry.addServer).not.toHaveBeenCalled();
    expect(manager.disconnectUserConnection).toHaveBeenCalledWith('user-1', 'onecode-filesystem');
  });

  describe.each(['new', 'existing'])('MCP workspace validation (%s server)', (serverState) => {
    const confirmedStatus = {
      allowed: true,
      exists: true,
      workspace: '/canonical/project-a',
    };
    let registry;
    let manager;

    beforeEach(() => {
      registry = {
        getServerConfig: jest
          .fn()
          .mockResolvedValue(
            serverState === 'existing' ? filesystemMCPConfig('/old/project') : undefined,
          ),
        addServer: jest.fn(),
        updateServer: jest.fn(),
      };
      manager = { disconnectUserConnection: jest.fn() };
    });

    it.each([
      ['denied workspace', { ...confirmedStatus, allowed: false }],
      ['missing permission', { exists: true, workspace: '/canonical/project-a' }],
      ['non-boolean permission', { ...confirmedStatus, allowed: 'true' }],
      ['nonexistent directory', { ...confirmedStatus, exists: false }],
      ['missing directory status', { allowed: true, workspace: '/canonical/project-a' }],
      ['non-boolean directory status', { ...confirmedStatus, exists: 1 }],
      ['missing canonical workspace', { allowed: true, exists: true }],
      ['null canonical workspace', { ...confirmedStatus, workspace: null }],
      ['non-string canonical workspace', { ...confirmedStatus, workspace: 123 }],
      ['empty canonical workspace', { ...confirmedStatus, workspace: '' }],
      ['blank canonical workspace', { ...confirmedStatus, workspace: ' \t\n ' }],
      ['null response', null],
      ['incomplete response', {}],
    ])('rejects %s', async (_name, status) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => status,
      });

      await expect(
        syncOneCodeFilesystemMCP('/Users/aidi/project-a', 'user-1', { registry, manager }),
      ).rejects.toThrow('workspace could not be confirmed by OneCode');
      expect(registry.addServer).not.toHaveBeenCalled();
      expect(registry.updateServer).not.toHaveBeenCalled();
      expect(registry.getServerConfig).not.toHaveBeenCalled();
      expect(manager.disconnectUserConnection).not.toHaveBeenCalled();
    });

    it.each([
      [403, { error: { message: 'workspace denied by kernel' } }, 'workspace denied by kernel'],
      [503, confirmedStatus, 'OneCode request failed: 503'],
    ])('rejects a kernel HTTP %s response', async (status, payload, message) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => payload,
      });

      await expect(
        syncOneCodeFilesystemMCP('/Users/aidi/project-a', 'user-1', { registry, manager }),
      ).rejects.toThrow(message);
      expect(registry.addServer).not.toHaveBeenCalled();
      expect(registry.updateServer).not.toHaveBeenCalled();
      expect(registry.getServerConfig).not.toHaveBeenCalled();
      expect(manager.disconnectUserConnection).not.toHaveBeenCalled();
    });

    it('rejects when the kernel cannot be reached', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('kernel unavailable'));

      await expect(
        syncOneCodeFilesystemMCP('/Users/aidi/project-a', 'user-1', { registry, manager }),
      ).rejects.toThrow('kernel unavailable');
      expect(registry.addServer).not.toHaveBeenCalled();
      expect(registry.updateServer).not.toHaveBeenCalled();
      expect(registry.getServerConfig).not.toHaveBeenCalled();
      expect(manager.disconnectUserConnection).not.toHaveBeenCalled();
    });

    it('rejects a malformed kernel JSON response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('invalid kernel JSON');
        },
      });

      await expect(
        syncOneCodeFilesystemMCP('/Users/aidi/project-a', 'user-1', { registry, manager }),
      ).rejects.toThrow('invalid kernel JSON');
      expect(registry.addServer).not.toHaveBeenCalled();
      expect(registry.updateServer).not.toHaveBeenCalled();
      expect(registry.getServerConfig).not.toHaveBeenCalled();
      expect(manager.disconnectUserConnection).not.toHaveBeenCalled();
    });
  });

  it('checks whether a workspace is inside allowed roots', () => {
    const { requireAllowedWorkspace, workspaceInsideAllowedRoots } = require('./projectPicker');

    expect(workspaceInsideAllowedRoots('/tmp/root/project', ['/tmp/root'])).toBe(true);
    expect(workspaceInsideAllowedRoots('/tmp/other/project', ['/tmp/root'])).toBe(false);
    expect(() => requireAllowedWorkspace()).toThrow('workspace is required');
  });

  it('builds OneCode API URLs from ONECODE_API_BASE_URL', () => {
    const { oneCodeApiUrl } = require('./projectPicker');

    process.env.ONECODE_API_BASE_URL = 'http://localhost:19080/v1/';

    expect(oneCodeApiUrl('/onecode/project/status')).toBe(
      'http://localhost:19080/v1/onecode/project/status',
    );
  });

  it('fetches verifier presets from the OneCode API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ presets: [] }),
    });

    await expect(getOneCodeVerifierPresets()).resolves.toEqual({ presets: [] });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:19080/v1/onecode/verifier/presets',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer dev-local-token' }),
      }),
    );
  });

  it('forwards verifier policy writes for allowed workspaces', async () => {
    process.env.ONECODE_ALLOWED_WORKSPACE_ROOTS = '/tmp/onecode-root';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ exists: true, valid: true }),
    });

    await expect(
      writeOneCodeVerifierPolicy('/tmp/onecode-root/project', ['python-unittest'], true),
    ).resolves.toEqual({ exists: true, valid: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:19080/v1/onecode/verifier/policy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          workspace: '/tmp/onecode-root/project',
          presetIds: ['python-unittest'],
          force: true,
        }),
      }),
    );
  });

  it('fetches masked model config from the OneCode API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: true, model: 'gpt-5.5', api_key_preview: 'sk-t...cret' }),
    });

    await expect(getOneCodeModelConfig()).resolves.toEqual({
      configured: true,
      model: 'gpt-5.5',
      api_key_preview: 'sk-t...cret',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:19080/v1/onecode/model-config',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer dev-local-token' }),
      }),
    );
  });

  it('writes model config to the OneCode API without logging the secret', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: true, model: 'gpt-5.5' }),
    });

    await expect(
      writeOneCodeModelConfig({
        endpoint: 'http://localhost:6780/v1/chat/completions',
        apiKey: 'sk-test-secret',
        model: 'gpt-5.5',
        models: ['gpt-5.5'],
      }),
    ).resolves.toEqual({ configured: true, model: 'gpt-5.5' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:19080/v1/onecode/model-config',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          endpoint: 'http://localhost:6780/v1/chat/completions',
          api_key: 'sk-test-secret',
          model: 'gpt-5.5',
          models: ['gpt-5.5'],
        }),
      }),
    );
  });

  it('discovers models through the OneCode API and can save the selected config', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-5.5', 'gpt-4.1'], model: 'gpt-5.5', source: 'remote' }),
    });

    await expect(
      discoverOneCodeModels({
        endpoint: 'http://localhost:6780/v1/chat/completions',
        apiKey: 'sk-test-secret',
        model: 'gpt-5.5',
        save: true,
      }),
    ).resolves.toEqual({ models: ['gpt-5.5', 'gpt-4.1'], model: 'gpt-5.5', source: 'remote' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:19080/v1/onecode/models/discover',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          endpoint: 'http://localhost:6780/v1/chat/completions',
          api_key: 'sk-test-secret',
          model: 'gpt-5.5',
          save: true,
        }),
      }),
    );
  });
});
