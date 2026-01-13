import { FileSources } from 'librechat-data-provider';
import type { Agent, AgentAvatar, AgentModelParameters } from 'librechat-data-provider';
import type { RefreshS3UrlFn, UpdateAgentFn } from './avatars';
import {
  MAX_AVATAR_REFRESH_AGENTS,
  AVATAR_REFRESH_BATCH_SIZE,
  refreshListAvatars,
} from './avatars';

describe('refreshListAvatars', () => {
  let mockRefreshS3Url: jest.MockedFunction<RefreshS3UrlFn>;
  let mockUpdateAgent: jest.MockedFunction<UpdateAgentFn>;
  const userId = 'user123';

  beforeEach(() => {
    mockRefreshS3Url = jest.fn();
    mockUpdateAgent = jest.fn();
  });

  const createAgent = (overrides: Partial<Agent> = {}): Agent => ({
    _id: 'obj1',
    id: 'agent1',
    name: 'Test Agent',
    author: userId,
    description: 'Test',
    created_at: Date.now(),
    avatar: {
      source: FileSources.s3,
      filepath: 'old-path.jpg',
    },
    instructions: null,
    provider: 'openai',
    model: 'gpt-4',
    model_parameters: {} as AgentModelParameters,
    ...overrides,
  });

  it('should return empty stats for empty agents array', async () => {
    const stats = await refreshListAvatars({
      agents: [],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.updated).toBe(0);
    expect(mockRefreshS3Url).not.toHaveBeenCalled();
    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });

  it('should skip non-S3 avatars', async () => {
    const agent = createAgent({
      avatar: { source: 'local', filepath: 'local-path.jpg' } as AgentAvatar,
    });

    const stats = await refreshListAvatars({
      agents: [agent],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.not_s3).toBe(1);
    expect(stats.updated).toBe(0);
    expect(mockRefreshS3Url).not.toHaveBeenCalled();
  });

  it('should skip agents without id', async () => {
    const agent = createAgent({ id: '' });

    const stats = await refreshListAvatars({
      agents: [agent],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.no_id).toBe(1);
    expect(mockRefreshS3Url).not.toHaveBeenCalled();
  });

  it('should refresh avatars for agents owned by other users (VIEW access)', async () => {
    const agent = createAgent({ author: 'otherUser' });
    mockRefreshS3Url.mockResolvedValue('new-path.jpg');
    mockUpdateAgent.mockResolvedValue({});

    const stats = await refreshListAvatars({
      agents: [agent],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.updated).toBe(1);
    expect(mockRefreshS3Url).toHaveBeenCalled();
    expect(mockUpdateAgent).toHaveBeenCalled();
  });

  it('should refresh and persist S3 avatars', async () => {
    const agent = createAgent();
    mockRefreshS3Url.mockResolvedValue('new-path.jpg');
    mockUpdateAgent.mockResolvedValue({});

    const stats = await refreshListAvatars({
      agents: [agent],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.updated).toBe(1);
    expect(mockRefreshS3Url).toHaveBeenCalledWith(agent.avatar);
    expect(mockUpdateAgent).toHaveBeenCalledWith(
      { id: 'agent1' },
      { avatar: { filepath: 'new-path.jpg', source: FileSources.s3 } },
      { updatingUserId: userId, skipVersioning: true },
    );
  });

  it('should not update if S3 URL unchanged', async () => {
    const agent = createAgent();
    mockRefreshS3Url.mockResolvedValue('old-path.jpg');

    const stats = await refreshListAvatars({
      agents: [agent],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.no_change).toBe(1);
    expect(stats.updated).toBe(0);
    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });

  it('should handle S3 refresh errors gracefully', async () => {
    const agent = createAgent();
    mockRefreshS3Url.mockRejectedValue(new Error('S3 error'));

    const stats = await refreshListAvatars({
      agents: [agent],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.s3_error).toBe(1);
    expect(stats.updated).toBe(0);
  });

  it('should handle database persist errors gracefully', async () => {
    const agent = createAgent();
    mockRefreshS3Url.mockResolvedValue('new-path.jpg');
    mockUpdateAgent.mockRejectedValue(new Error('DB error'));

    const stats = await refreshListAvatars({
      agents: [agent],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.persist_error).toBe(1);
    expect(stats.updated).toBe(0);
  });

  it('should process agents in batches', async () => {
    const agents = Array.from({ length: 25 }, (_, i) =>
      createAgent({
        _id: `obj${i}`,
        id: `agent${i}`,
        avatar: { source: FileSources.s3, filepath: `path${i}.jpg` },
      }),
    );

    mockRefreshS3Url.mockImplementation((avatar) =>
      Promise.resolve(avatar.filepath.replace('.jpg', '-new.jpg')),
    );
    mockUpdateAgent.mockResolvedValue({});

    const stats = await refreshListAvatars({
      agents,
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.updated).toBe(25);
    expect(mockRefreshS3Url).toHaveBeenCalledTimes(25);
    expect(mockUpdateAgent).toHaveBeenCalledTimes(25);
  });

  it('should track mixed statistics correctly', async () => {
    const agents = [
      createAgent({ id: 'agent1' }),
      createAgent({ id: 'agent2', author: 'otherUser' }),
      createAgent({
        id: 'agent3',
        avatar: { source: 'local', filepath: 'local.jpg' } as AgentAvatar,
      }),
      createAgent({ id: '' }), // no id
    ];

    mockRefreshS3Url.mockResolvedValue('new-path.jpg');
    mockUpdateAgent.mockResolvedValue({});

    const stats = await refreshListAvatars({
      agents,
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.updated).toBe(2); // agent1 and agent2 (other user's agent now refreshed)
    expect(stats.not_s3).toBe(1); // agent3
    expect(stats.no_id).toBe(1); // agent with empty id
  });
});

describe('Constants', () => {
  it('should export MAX_AVATAR_REFRESH_AGENTS as 1000', () => {
    expect(MAX_AVATAR_REFRESH_AGENTS).toBe(1000);
  });

  it('should export AVATAR_REFRESH_BATCH_SIZE as 20', () => {
    expect(AVATAR_REFRESH_BATCH_SIZE).toBe(20);
  });
});
