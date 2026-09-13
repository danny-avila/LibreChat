import { FileSources } from 'librechat-data-provider';
import type { Agent, AgentAvatar, AgentModelParameters } from 'librechat-data-provider';
import type { AvatarRefreshCache, RefreshS3UrlFn, UpdateAgentFn } from './avatars';
import {
  AVATAR_REFRESH_BATCH_SIZE,
  MAX_AVATAR_REFRESH_AGENTS,
  MAX_AVATAR_REFRESH_COVERAGE_IDS,
  getAvatarRefreshCoveredIds,
  mergeAvatarRefreshCacheEntry,
  refreshListAvatars,
  resolveAvatarRefresh,
  selectAvatarRefreshAgents,
} from './avatars';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import { logger } from '@librechat/data-schemas';

describe('selectAvatarRefreshAgents', () => {
  const agent = (id: string): Agent =>
    ({
      id,
      avatar: { source: FileSources.s3, filepath: `${id}.jpg` },
    }) as Agent;

  it('keeps page order, skips covered rows, and enforces the S3 work cap', () => {
    const agents = Array.from({ length: MAX_AVATAR_REFRESH_AGENTS + 2 }, (_, i) =>
      agent(`agent${i}`),
    );
    const selected = selectAvatarRefreshAgents(agents, ['agent0', 'agent2']);

    expect(selected).toHaveLength(MAX_AVATAR_REFRESH_AGENTS);
    expect(selected[0].id).toBe('agent1');
    expect(selected[selected.length - 1]?.id).toBe(`agent${MAX_AVATAR_REFRESH_AGENTS + 1}`);
  });
});

describe('refreshListAvatars', () => {
  let mockRefreshS3Url: jest.MockedFunction<RefreshS3UrlFn>;
  let mockUpdateAgent: jest.MockedFunction<UpdateAgentFn>;
  const userId = 'user123';

  beforeEach(() => {
    mockRefreshS3Url = jest.fn();
    mockUpdateAgent = jest.fn();
    jest.clearAllMocks();
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
    expect(stats.urlCache).toEqual({});
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
    expect(stats.urlCache).toEqual({});
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
    expect(stats.urlCache).toEqual({ agent1: 'new-path.jpg' });
    expect(mockRefreshS3Url).toHaveBeenCalledWith(agent.avatar);
    expect(mockUpdateAgent).toHaveBeenCalledWith({
      id: 'agent1',
      avatar: { filepath: 'new-path.jpg', source: FileSources.s3 },
    });
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
    expect(stats.urlCache).toEqual({});
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
    expect(stats.urlCache).toEqual({});
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
    expect(stats.urlCache).toEqual({ agent1: 'new-path.jpg' });
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
    expect(Object.keys(stats.urlCache)).toHaveLength(25);
    expect(mockRefreshS3Url).toHaveBeenCalledTimes(25);
    expect(mockUpdateAgent).toHaveBeenCalledTimes(25);
  });

  it('should not populate urlCache when refreshS3Url resolves with falsy', async () => {
    const agent = createAgent();
    mockRefreshS3Url.mockResolvedValue(undefined);

    const stats = await refreshListAvatars({
      agents: [agent],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(stats.no_change).toBe(1);
    expect(stats.urlCache).toEqual({});
    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });

  it('should redact urlCache from log output', async () => {
    const agent = createAgent();
    mockRefreshS3Url.mockResolvedValue('new-path.jpg');
    mockUpdateAgent.mockResolvedValue({});

    await refreshListAvatars({
      agents: [agent],
      userId,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    const loggerInfo = logger.info as jest.Mock;
    const summaryCall = loggerInfo.mock.calls.find(([msg]) =>
      msg.includes('Avatar refresh summary'),
    );
    expect(summaryCall).toBeDefined();
    const loggedPayload = summaryCall[1];
    expect(loggedPayload).toHaveProperty('urlCacheSize', 1);
    expect(loggedPayload).not.toHaveProperty('urlCache');
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
    expect(stats.urlCache).toEqual({ agent1: 'new-path.jpg', agent2: 'new-path.jpg' });
  });
  it('expires coverage per agent instead of renewing earlier pages', async () => {
    const cacheSet = jest.fn();
    const cache = { set: cacheSet } as unknown as AvatarRefreshCache;
    const firstAgent = createAgent({
      id: 'agent1',
      avatar: { source: FileSources.s3, filepath: 'one.jpg' },
    });
    const secondAgent = createAgent({
      id: 'agent2',
      avatar: { source: FileSources.s3, filepath: 'two.jpg' },
    });
    const now = jest.spyOn(Date, 'now');
    mockRefreshS3Url
      .mockResolvedValueOnce('one-new.jpg')
      .mockResolvedValueOnce('two-new.jpg')
      .mockResolvedValueOnce('one-newer.jpg');
    mockUpdateAgent.mockResolvedValue({});

    now.mockReturnValue(0);
    const firstEntry = await resolveAvatarRefresh({
      agents: [firstAgent],
      userId,
      cachedRefreshEntry: null,
      cache,
      refreshKey: 'avatars:user123',
      cacheTtl: 30 * 60 * 1000,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    now.mockReturnValue(29 * 60 * 1000);
    const secondEntry = await resolveAvatarRefresh({
      agents: [secondAgent],
      userId,
      cachedRefreshEntry: firstEntry,
      cache,
      refreshKey: 'avatars:user123',
      cacheTtl: 30 * 60 * 1000,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(secondEntry?.coveredIds.agent1).toBe(30 * 60 * 1000);
    expect(secondEntry?.coveredIds.agent2).toBe(59 * 60 * 1000);
    expect(cacheSet.mock.calls[1]?.[2]).toBe(30 * 60 * 1000);

    now.mockReturnValue(30 * 60 * 1000 + 1);
    const afterExpiry = await resolveAvatarRefresh({
      agents: [firstAgent],
      userId,
      cachedRefreshEntry: secondEntry,
      cache,
      refreshKey: 'avatars:user123',
      cacheTtl: 30 * 60 * 1000,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(mockRefreshS3Url).toHaveBeenCalledTimes(3);
    expect(afterExpiry?.coveredIds.agent1).toBe(60 * 60 * 1000 + 1);
  });

  it('bounds retained coverage while keeping the newest ids covered', async () => {
    const retainedIds = Array.from(
      { length: MAX_AVATAR_REFRESH_COVERAGE_IDS },
      (_, index) => `agent${index}`,
    );
    const firstEntry = mergeAvatarRefreshCacheEntry(
      null,
      { urlCache: {}, coveredIds: retainedIds },
      30 * 60 * 1000,
      0,
    );
    const boundedEntry = mergeAvatarRefreshCacheEntry(
      firstEntry,
      { urlCache: {}, coveredIds: ['agent1000'] },
      30 * 60 * 1000,
      1,
    );

    expect(Object.keys(boundedEntry.coveredIds)).toHaveLength(MAX_AVATAR_REFRESH_COVERAGE_IDS);
    expect(getAvatarRefreshCoveredIds(boundedEntry, 1)).not.toContain('agent0');
    expect(getAvatarRefreshCoveredIds(boundedEntry, 1)).toContain('agent1000');

    const cache = { set: jest.fn() } as unknown as AvatarRefreshCache;
    const now = jest.spyOn(Date, 'now').mockReturnValue(1);
    await resolveAvatarRefresh({
      agents: [createAgent({ id: 'agent1000' })],
      userId,
      cachedRefreshEntry: boundedEntry,
      cache,
      refreshKey: 'avatars:user123',
      cacheTtl: 30 * 60 * 1000,
      refreshS3Url: mockRefreshS3Url,
      updateAgent: mockUpdateAgent,
    });

    expect(mockRefreshS3Url).not.toHaveBeenCalled();
    now.mockRestore();
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
