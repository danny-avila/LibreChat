import calculateSlot from 'cluster-key-slot';
import type { CatalogCache, CatalogStoreDeps } from './store';
import { createMCPCatalogStore } from './store';

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const PREFIX = 'librechat';

interface EvalCall {
  script: string;
  keys: string[];
}

function createDeps(prefix?: string): { deps: CatalogStoreDeps; evalCalls: EvalCall[] } {
  const evalCalls: EvalCall[] = [];
  const cache: CatalogCache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
  };
  const deps: CatalogStoreDeps = {
    getCache: () => cache,
    cacheConfig: prefix ? { REDIS_KEY_PREFIX: prefix, GLOBAL_PREFIX_SEPARATOR: '::' } : {},
    ioredisClient: {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    },
    keyvRedisClient: {
      eval: jest.fn(async (script: string, options: { keys: string[]; arguments: string[] }) => {
        const denied = prefix ? options.keys.find((key) => !key.startsWith(`${prefix}::`)) : null;
        if (denied) {
          throw new Error(`NOPERM No permissions to access a key: ${denied}`);
        }
        evalCalls.push({ script, keys: options.keys });
        return 1;
      }),
    },
  };
  return { deps, evalCalls };
}

const guardedWrites = (evalCalls: EvalCall[]): EvalCall[] =>
  evalCalls.filter(({ keys }) => keys.length > 1);

const expectSameSlot = ({ keys }: EvalCall): void => {
  expect(calculateSlot(keys[0])).toBe(calculateSlot(keys[1]));
};

describe('createMCPCatalogStore write-fence keys', () => {
  it('prefixes the global fence key with REDIS_KEY_PREFIX', async () => {
    const { deps, evalCalls } = createDeps(PREFIX);
    const store = createMCPCatalogStore(deps);

    await expect(store.setCachedTools({})).resolves.toBe(true);

    const [globalWrite] = guardedWrites(evalCalls);
    expect(globalWrite.keys[0]).toMatch(/^librechat::tools:global:write-fence:\{/);
    expectSameSlot(globalWrite);
  });

  it('prefixes the per-user fence key with REDIS_KEY_PREFIX', async () => {
    const { deps, evalCalls } = createDeps(PREFIX);
    const store = createMCPCatalogStore(deps);

    await expect(
      store.getMCPToolsCacheGeneration({ userId: 'user-1', serverName: 'server-1' }),
    ).resolves.toEqual(expect.any(String));

    const [generationWrite] = guardedWrites(evalCalls);
    expect(generationWrite.keys[0]).toMatch(/^librechat::tools:mcp:write-fence:\{/);
    expectSameSlot(generationWrite);
  });

  it('leaves fence keys unprefixed when REDIS_KEY_PREFIX is unset', async () => {
    const { deps, evalCalls } = createDeps();
    const store = createMCPCatalogStore(deps);

    await expect(store.setCachedTools({})).resolves.toBe(true);
    await expect(
      store.getMCPToolsCacheGeneration({ userId: 'user-1', serverName: 'server-1' }),
    ).resolves.toEqual(expect.any(String));

    const [globalWrite, generationWrite] = guardedWrites(evalCalls);
    expect(globalWrite.keys[0]).toMatch(/^tools:global:write-fence:\{/);
    expect(generationWrite.keys[0]).toMatch(/^tools:mcp:write-fence:\{/);
    expectSameSlot(globalWrite);
    expectSameSlot(generationWrite);
  });
});
