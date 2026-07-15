import {
  buildOneCodeMetadata,
  clearStoredOneCodeWorkspace,
  createOneCodeProjectFolder,
  getOneCodeRunEvidence,
  getOneCodeModelConfig,
  getOneCodeProjectStatus,
  getOneCodeVerifierPolicy,
  discoverOneCodeModels,
  getStoredOneCodeRecentProjects,
  getStoredOneCodeWorkspace,
  getWorkspaceBasename,
  isOneCodeEndpoint,
  latestRunActionLabel,
  pickOneCodeProjectFolder,
  projectStatusBadges,
  rememberOneCodeWorkspace,
  setStoredOneCodeWorkspace,
  syncOneCodeFilesystemMCP,
  writeOneCodeModelConfig,
} from './project';

describe('OneCode project workspace persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores the active workspace and promotes it to recent projects', () => {
    const recents = setStoredOneCodeWorkspace('  /tmp/project-a  ');

    expect(getStoredOneCodeWorkspace()).toBe('/tmp/project-a');
    expect(recents).toEqual(['/tmp/project-a']);
    expect(getStoredOneCodeRecentProjects()).toEqual(['/tmp/project-a']);
  });

  it('deduplicates recent workspaces with newest first', () => {
    let recents = rememberOneCodeWorkspace('/tmp/a', []);
    recents = rememberOneCodeWorkspace('/tmp/b', recents);
    recents = rememberOneCodeWorkspace('/tmp/a', recents);

    expect(recents).toEqual(['/tmp/a', '/tmp/b']);
  });

  it('clears only the active workspace', () => {
    setStoredOneCodeWorkspace('/tmp/project-a');
    clearStoredOneCodeWorkspace();

    expect(getStoredOneCodeWorkspace()).toBe('');
    expect(getStoredOneCodeRecentProjects()).toEqual(['/tmp/project-a']);
  });

  it('builds request metadata only when a workspace is selected', () => {
    expect(buildOneCodeMetadata(' /tmp/project-a ')).toEqual({ workspace: '/tmp/project-a' });
    expect(buildOneCodeMetadata('   ')).toBeUndefined();
  });

  it('recognizes only the OneCode custom endpoint for workspace injection', () => {
    expect(isOneCodeEndpoint('OneCode')).toBe(true);
    expect(isOneCodeEndpoint('openAI')).toBe(false);
    expect(isOneCodeEndpoint(null)).toBe(false);
  });

  it('calls the local shell project picker API', async () => {
    const picker = jest.fn().mockResolvedValue({ workspace: '/tmp/project-a' });

    await expect(pickOneCodeProjectFolder(picker)).resolves.toEqual({
      workspace: '/tmp/project-a',
    });
    expect(picker).toHaveBeenCalledWith();
  });

  it('creates a local shell project through the project API', async () => {
    const creator = jest.fn().mockResolvedValue({ workspace: '/tmp/demo' });

    await expect(createOneCodeProjectFolder('demo', creator)).resolves.toEqual({
      workspace: '/tmp/demo',
    });
    expect(creator).toHaveBeenCalledWith('demo');
  });

  it('extracts a readable project name from the workspace path', () => {
    expect(getWorkspaceBasename('/Users/aidi/project-a')).toBe('project-a');
    expect(getWorkspaceBasename('/Users/aidi/project-a/')).toBe('project-a');
    expect(getWorkspaceBasename('')).toBe('未选择');
  });

  it('syncs filesystem MCP through the local OneCode API', async () => {
    const syncer = jest
      .fn()
      .mockResolvedValue({ serverName: 'onecode-filesystem', status: 'created' });

    await expect(syncOneCodeFilesystemMCP('/tmp/project-a', syncer)).resolves.toEqual({
      serverName: 'onecode-filesystem',
      status: 'created',
    });
    expect(syncer).toHaveBeenCalledWith('/tmp/project-a');
  });

  it('fetches OneCode project status through the data service', async () => {
    const getter = jest
      .fn()
      .mockResolvedValue({ workspace: '/tmp/project-a', exists: true, allowed: true });

    await expect(getOneCodeProjectStatus('/tmp/project-a', getter)).resolves.toEqual({
      workspace: '/tmp/project-a',
      exists: true,
      allowed: true,
    });
    expect(getter).toHaveBeenCalledWith('/tmp/project-a');
  });

  it('derives compact project status labels', () => {
    expect(
      projectStatusBadges({
        workspace: '/tmp/project-a',
        exists: true,
        allowed: true,
        git: { present: true },
        verifier_policy: { present: false },
      }),
    ).toEqual([
      { kind: 'ok', label: '已允许' },
      { kind: 'ok', label: 'Git' },
      { kind: 'warn', label: '缺少验证策略' },
    ]);
  });

  it('labels resumable latest runs', () => {
    expect(latestRunActionLabel({ run_id: 'abc', status: 'halted', next_action: 'resume' })).toBe(
      '继续最新运行',
    );
    expect(latestRunActionLabel({ run_id: 'abc', status: 'completed' })).toBe('查看最新运行');
  });

  it('fetches verifier policy only for selected workspaces', async () => {
    const getter = jest.fn().mockResolvedValue({ exists: true, valid: true });

    await expect(getOneCodeVerifierPolicy('/tmp/project-a', getter)).resolves.toEqual({
      exists: true,
      valid: true,
    });
    await expect(getOneCodeVerifierPolicy('', getter)).resolves.toBeUndefined();
    expect(getter).toHaveBeenCalledTimes(1);
  });

  it('fetches run evidence only when workspace and run id are present', async () => {
    const getter = jest.fn().mockResolvedValue({ summary: { run_id: 'run-1' }, checkpoints: [] });

    await expect(getOneCodeRunEvidence('/tmp/project-a', 'run-1', getter)).resolves.toEqual({
      summary: { run_id: 'run-1' },
      checkpoints: [],
    });
    await expect(getOneCodeRunEvidence('/tmp/project-a', '', getter)).resolves.toBeUndefined();
    expect(getter).toHaveBeenCalledTimes(1);
  });

  it('normalizes model config reads and never requires an api key in the response', async () => {
    const getter = jest.fn().mockResolvedValue({
      configured: true,
      endpoint: ' http://localhost:6780/v1/chat/completions ',
      model: ' gpt-5.5 ',
      api_key_preview: 'sk-t...cret',
      models: [' gpt-5.5 ', '', 'gpt-4.1'],
    });

    await expect(getOneCodeModelConfig(getter)).resolves.toEqual({
      configured: true,
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      api_key_preview: 'sk-t...cret',
      models: ['gpt-5.5', 'gpt-4.1'],
    });
  });

  it('writes model config through the data service with normalized values', async () => {
    const writer = jest.fn().mockResolvedValue({ configured: true, model: 'gpt-5.5' });

    await expect(
      writeOneCodeModelConfig(
        {
          endpoint: ' http://localhost:6780/v1/chat/completions ',
          apiKey: ' sk-test-secret ',
          model: ' gpt-5.5 ',
          models: [' gpt-5.5 ', 'gpt-4.1'],
        },
        writer,
      ),
    ).resolves.toEqual({ configured: true, endpoint: '', model: 'gpt-5.5', models: [] });
    expect(writer).toHaveBeenCalledWith({
      endpoint: 'http://localhost:6780/v1/chat/completions',
      apiKey: 'sk-test-secret',
      model: 'gpt-5.5',
      models: ['gpt-5.5', 'gpt-4.1'],
    });
  });

  it('discovers model choices through the data service', async () => {
    const discoverer = jest.fn().mockResolvedValue({
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      models: ['gpt-5.5'],
      source: 'remote',
    });

    await expect(
      discoverOneCodeModels(
        {
          endpoint: 'http://localhost:6780/v1/chat/completions',
          apiKey: 'sk-test-secret',
          save: true,
        },
        discoverer,
      ),
    ).resolves.toEqual({
      configured: false,
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      models: ['gpt-5.5'],
      source: 'remote',
    });
    expect(discoverer).toHaveBeenCalledWith({
      endpoint: 'http://localhost:6780/v1/chat/completions',
      apiKey: 'sk-test-secret',
      model: '',
      save: true,
    });
  });
});
