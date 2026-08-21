import type { MCPConnection } from '~/mcp/connection';
import type * as t from '~/mcp/types';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { UserConnectionManager } from '~/mcp/UserConnectionManager';
import { resolveServerInstructions } from '~/mcp/utils';

jest.mock('~/mcp/registry/db/ServerConfigsDB', () => ({
  ServerConfigsDB: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue({}),
    add: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockMongoose = {} as typeof import('mongoose');
const INSTRUCTIONS = 'Prefer $select on list operations. Never invent addresses.';
const FIXED_TIME = 1699564800000;

/** A YAML server whose startup inspection was skipped (OAuth), leaving the
 * enabled declaration without fetched text. */
const oauthYamlEntry: t.ParsedServerConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/mcp',
  requiresOAuth: true,
  serverInstructions: true,
  source: 'yaml',
  updatedAt: FIXED_TIME,
};

describe('MCPServersRegistry.setResolvedInstructions', () => {
  let registry: MCPServersRegistry;

  beforeEach(async () => {
    (MCPServersRegistry as unknown as { instance: undefined }).instance = undefined;
    MCPServersRegistry.createInstance(mockMongoose);
    registry = MCPServersRegistry.getInstance();
    await registry.reset();
  });

  it('backfills a YAML-tier server and preserves its updatedAt', async () => {
    const { config: stored } = await registry['cacheConfigsRepo'].add(
      'oauth_server',
      oauthYamlEntry,
    );

    const updated = await registry.setResolvedInstructions('oauth_server', INSTRUCTIONS);

    expect(updated).toBe(true);
    const config = await registry.getServerConfig('oauth_server');
    expect(config?.resolvedInstructions).toBe(INSTRUCTIONS);
    expect(config?.serverInstructions).toBe(true);
    expect(config?.updatedAt).toBe(stored.updatedAt);
    expect(resolveServerInstructions(config!)).toBe(INSTRUCTIONS);
  });

  it('invalidates the read-through cache so a primed read sees the backfill', async () => {
    await registry['cacheConfigsRepo'].add('oauth_server', oauthYamlEntry);

    const before = await registry.getServerConfig('oauth_server');
    expect(before?.resolvedInstructions).toBeUndefined();

    await registry.setResolvedInstructions('oauth_server', INSTRUCTIONS);

    const after = await registry.getServerConfig('oauth_server');
    expect(after?.resolvedInstructions).toBe(INSTRUCTIONS);
  });

  it('is a no-op when the stored instructions already match', async () => {
    await registry['cacheConfigsRepo'].add('oauth_server', oauthYamlEntry);

    await registry.setResolvedInstructions('oauth_server', INSTRUCTIONS);
    const updated = await registry.setResolvedInstructions('oauth_server', INSTRUCTIONS);

    expect(updated).toBe(false);
  });

  it('returns false for an unknown server without a user', async () => {
    const updated = await registry.setResolvedInstructions('missing_server', INSTRUCTIONS);
    expect(updated).toBe(false);
  });

  it('leaves DB-tier user servers untouched (identity-preserving DB write is a follow-up)', async () => {
    const dbRepo = registry['dbConfigsRepo'] as unknown as {
      get: jest.Mock;
      update: jest.Mock;
    };
    dbRepo.get.mockResolvedValue({ ...oauthYamlEntry, source: 'user' });

    const updated = await registry.setResolvedInstructions('db_server', INSTRUCTIONS, 'user-1');

    expect(updated).toBe(false);
    expect(dbRepo.update).not.toHaveBeenCalled();
  });

  it('patch on the cache repo merges fields without bumping updatedAt', async () => {
    const repo = registry['cacheConfigsRepo'];
    await repo.add('oauth_server', oauthYamlEntry);
    const stored = await repo.get('oauth_server');

    const patched = await repo.patch!('oauth_server', { resolvedInstructions: INSTRUCTIONS });

    expect(patched).toBe(true);
    const after = await repo.get('oauth_server');
    expect(after?.resolvedInstructions).toBe(INSTRUCTIONS);
    expect(after?.updatedAt).toBe(stored?.updatedAt);
    expect(await repo.patch!('unknown_server', { resolvedInstructions: INSTRUCTIONS })).toBe(false);
  });
});

describe('UserConnectionManager.backfillResolvedInstructions', () => {
  class TestConnectionManager extends UserConnectionManager {}

  let manager: TestConnectionManager;
  let setResolvedInstructions: jest.Mock;

  const connectionWith = (instructions?: string): MCPConnection =>
    ({
      client: { getInstructions: () => instructions },
    }) as unknown as MCPConnection;

  const backfill = (
    config: t.ParsedServerConfig | undefined,
    connection: MCPConnection,
  ): Promise<void> =>
    manager['backfillResolvedInstructions']('oauth_server', config, connection, 'user-1');

  beforeEach(() => {
    manager = new TestConnectionManager();
    setResolvedInstructions = jest.fn().mockResolvedValue(true);
    jest.spyOn(MCPServersRegistry, 'getInstance').mockReturnValue({
      setResolvedInstructions,
    } as unknown as MCPServersRegistry);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists instructions delivered by the live connection', async () => {
    await backfill({ ...oauthYamlEntry }, connectionWith(INSTRUCTIONS));

    expect(setResolvedInstructions).toHaveBeenCalledWith('oauth_server', INSTRUCTIONS, 'user-1');
  });

  it('skips servers that do not enable serverInstructions', async () => {
    await backfill(
      { ...oauthYamlEntry, serverInstructions: undefined },
      connectionWith(INSTRUCTIONS),
    );
    expect(setResolvedInstructions).not.toHaveBeenCalled();
  });

  it('skips servers whose declaration is already a literal string', async () => {
    await backfill(
      { ...oauthYamlEntry, serverInstructions: 'operator-provided text' },
      connectionWith(INSTRUCTIONS),
    );
    expect(setResolvedInstructions).not.toHaveBeenCalled();
  });

  it('skips servers whose instructions were already resolved', async () => {
    await backfill(
      { ...oauthYamlEntry, resolvedInstructions: INSTRUCTIONS },
      connectionWith('newer text'),
    );
    expect(setResolvedInstructions).not.toHaveBeenCalled();
  });

  it('skips connections that advertise no instructions', async () => {
    await backfill({ ...oauthYamlEntry }, connectionWith(undefined));
    expect(setResolvedInstructions).not.toHaveBeenCalled();
  });

  it('never propagates a persistence failure into connection creation', async () => {
    setResolvedInstructions.mockRejectedValue(new Error('cache down'));
    await expect(
      backfill({ ...oauthYamlEntry }, connectionWith(INSTRUCTIONS)),
    ).resolves.toBeUndefined();
  });
});
