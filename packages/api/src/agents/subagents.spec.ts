import { ResourceType, PermissionBits } from 'librechat-data-provider';
import { createSubagentLoader, buildRemoteAgentSubagentAccessCheck } from './subagents';
import type { SubagentConfigLike } from './subagents';
import type { Agent } from 'librechat-data-provider';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger } = require('@librechat/data-schemas');

const MAX_DEPTH = 5;
const MAX_NODES = 10;

const makeConfig = (
  id: string,
  subagentIds: string[] = [],
  enabled = subagentIds.length > 0,
): SubagentConfigLike =>
  ({
    id,
    subagents: { enabled, agent_ids: subagentIds },
  }) as SubagentConfigLike;

/** Build a loader wired to an in-memory agent map, mirroring how the JWT path
 *  and the /v1 controllers supply `loadAgentById`. */
function makeLoader(
  primaryConfig: SubagentConfigLike,
  agentMap: Record<string, SubagentConfigLike>,
  opts: {
    checkSubagentAccess?: (agent: Agent) => Promise<boolean>;
    getAgent?: (filter: { id: string }) => Promise<Agent | null>;
    skippedAgentIds?: Set<string>;
    logPrefix?: string;
  } = {},
) {
  const subagentGraphIds = new Set<string>([primaryConfig.id as string]);
  const loadAgentById = jest.fn(async (id: string) => agentMap[id] ?? null);
  const assertSubagentGraphRoom = (id: string): void => {
    if (subagentGraphIds.size >= MAX_NODES) {
      throw new Error(`Subagent graph exceeds the maximum of ${MAX_NODES} agents at ${id}.`);
    }
    subagentGraphIds.add(id);
  };
  const loader = createSubagentLoader({
    primaryConfig,
    skippedAgentIds: opts.skippedAgentIds ?? new Set<string>(),
    edgeAgentIds: new Set<string>(),
    pureSubagentIds: new Set<string>(),
    subagentGraphIds,
    loadedSubagentConfigIds: new Set<string>(),
    maxResolvedDepthByConfigId: new Map<string, number>(),
    loadAgentById,
    assertSubagentGraphRoom,
    maxSubagentDepth: MAX_DEPTH,
    logPrefix: opts.logPrefix,
    getAgent: opts.getAgent,
    checkSubagentAccess: opts.checkSubagentAccess,
  });
  return { loader, loadAgentById };
}

/** A straight chain d0 -> d1 -> ... -> d(MAX_DEPTH+1), deeper than the limit. */
const makeDeepChain = (): Record<string, SubagentConfigLike> => {
  const map: Record<string, SubagentConfigLike> = {};
  for (let i = 0; i <= MAX_DEPTH + 1; i++) {
    map[`d${i}`] = makeConfig(`d${i}`, i < MAX_DEPTH + 1 ? [`d${i + 1}`] : []);
  }
  return map;
};

describe('createSubagentLoader', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves a nested subagent chain A -> B -> C (BFS)', async () => {
    const A = makeConfig('A', ['B']);
    const map: Record<string, SubagentConfigLike> = {
      B: makeConfig('B', ['C']),
      C: makeConfig('C', []),
    };
    const { loader, loadAgentById } = makeLoader(A, map);

    await loader.resolveSubagentTrees([A]);

    expect(loadAgentById).toHaveBeenCalledWith('B');
    expect(loadAgentById).toHaveBeenCalledWith('C');
    expect(A.subagentAgentConfigs?.map((c) => c.id)).toEqual(['B']);
    expect(map.B.subagentAgentConfigs?.map((c) => c.id)).toEqual(['C']);
    expect(map.C.subagentAgentConfigs).toEqual([]);
  });

  it('throws and logs with the [initializeClient] tag when depth exceeds MAX_SUBAGENT_DEPTH', async () => {
    const map = makeDeepChain();
    const { loader } = makeLoader(map.d0, map);

    await expect(loader.resolveSubagentTrees([map.d0])).rejects.toThrow(
      `maximum depth of ${MAX_DEPTH}`,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '[initializeClient] Subagent graph depth limit exceeded',
      expect.objectContaining({ maxSubagentDepth: MAX_DEPTH, depth: MAX_DEPTH }),
    );
  });

  it('honors a custom logPrefix for the /v1 callers', async () => {
    const map = makeDeepChain();
    // Identical to the depth test above, only the injected logPrefix differs.
    const { loader } = makeLoader(map.d0, map, { logPrefix: '[openai]' });

    await expect(loader.resolveSubagentTrees([map.d0])).rejects.toThrow(
      `maximum depth of ${MAX_DEPTH}`,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '[openai] Subagent graph depth limit exceeded',
      expect.objectContaining({ maxSubagentDepth: MAX_DEPTH, depth: MAX_DEPTH }),
    );
  });

  it('cycle guard: a mutual A <-> B cycle is depth-bounded and never RELOADS the primary', async () => {
    // A lists B; B lists A (the primary). The primary-reuse guard reuses the
    // primary object instead of reloading it, but the pair still climbs the
    // depth counter — MAX_SUBAGENT_DEPTH is the intended cycle terminator
    // (faithful to the original closures). Assert the two real guarantees:
    //   1. the cycle terminates (rejects) rather than infinite-looping, and
    //   2. the primary ('A') is never fetched via loadAgentById (reused).
    const A = makeConfig('A', ['B']);
    const map: Record<string, SubagentConfigLike> = {
      B: makeConfig('B', ['A']),
    };
    const { loader, loadAgentById } = makeLoader(A, map);

    await expect(loader.resolveSubagentTrees([A])).rejects.toThrow(
      `maximum depth of ${MAX_DEPTH}`,
    );
    // The primary is reused, never reloaded — the unique job of the cycle guard.
    expect(loadAgentById).not.toHaveBeenCalledWith('A');
    // First-level resolution still reused the primary OBJECT for B's subagent.
    expect(map.B.subagentAgentConfigs?.[0]).toBe(A);
  });

  it('ALWAYS assigns subagentAgentConfigs = [] when the feature is disabled (parity contract)', async () => {
    const A = makeConfig('A', [], /* enabled */ false);
    const { loader, loadAgentById } = makeLoader(A, {});

    await loader.resolveSubagentTrees([A]);

    // The original closure always left the field defined — downstream relies on it.
    expect(A.subagentAgentConfigs).toEqual([]);
    expect(loadAgentById).not.toHaveBeenCalled();
  });

  it('allow-all path (JWT): loads every subagent with no load-time ACL', async () => {
    const A = makeConfig('A', ['B', 'C']);
    const map: Record<string, SubagentConfigLike> = {
      B: makeConfig('B', []),
      C: makeConfig('C', []),
    };
    // No checkSubagentAccess / getAgent — the JWT path.
    const { loader } = makeLoader(A, map);

    await loader.resolveSubagentTrees([A]);

    expect(A.subagentAgentConfigs?.map((c) => c.id).sort()).toEqual(['B', 'C']);
  });

  it('/v1 ACL: SKIPS a subagent the caller lacks VIEW on (the security property #13898 exists for)', async () => {
    const A = makeConfig('A', ['B', 'FORBIDDEN']);
    const map: Record<string, SubagentConfigLike> = {
      B: makeConfig('B', []),
      FORBIDDEN: makeConfig('FORBIDDEN', []),
    };
    const rawAgents: Record<string, Agent> = {
      B: { id: 'B', _id: 'mongo-B' } as unknown as Agent,
      FORBIDDEN: { id: 'FORBIDDEN', _id: 'mongo-FORBIDDEN' } as unknown as Agent,
    };
    const skippedAgentIds = new Set<string>();
    const { loader } = makeLoader(A, map, {
      getAgent: async ({ id }) => rawAgents[id] ?? null,
      // deny only FORBIDDEN
      checkSubagentAccess: async (agent) => agent._id !== 'mongo-FORBIDDEN',
      skippedAgentIds,
    });

    await loader.resolveSubagentTrees([A]);

    expect(A.subagentAgentConfigs?.map((c) => c.id)).toEqual(['B']);
    expect(skippedAgentIds.has('FORBIDDEN')).toBe(true);
  });

  it('/v1 ACL: enforces VIEW at DEPTH 2 — denies a GRANDCHILD subagent (A -> B -> FORBIDDEN)', async () => {
    // Gate-2 #202: prove the ACL fires at every BFS depth, not just depth 0.
    // A's child B is allowed; B's child FORBIDDEN is denied. A future refactor
    // of resolveSubagentTrees that short-circuited deep nodes would break this.
    const A = makeConfig('A', ['B']);
    const map: Record<string, SubagentConfigLike> = {
      B: makeConfig('B', ['FORBIDDEN']),
      FORBIDDEN: makeConfig('FORBIDDEN', []),
    };
    const rawAgents: Record<string, Agent> = {
      B: { id: 'B', _id: 'mongo-B' } as unknown as Agent,
      FORBIDDEN: { id: 'FORBIDDEN', _id: 'mongo-FORBIDDEN' } as unknown as Agent,
    };
    const skippedAgentIds = new Set<string>();
    const { loader } = makeLoader(A, map, {
      getAgent: async ({ id }) => rawAgents[id] ?? null,
      // deny only the grandchild
      checkSubagentAccess: async (agent) => agent._id !== 'mongo-FORBIDDEN',
      skippedAgentIds,
    });

    await loader.resolveSubagentTrees([A]);

    // B (depth 1) loads; FORBIDDEN (depth 2, B's child) is ACL-denied.
    expect(A.subagentAgentConfigs?.map((c) => c.id)).toEqual(['B']);
    expect(map.B.subagentAgentConfigs).toEqual([]);
    expect(skippedAgentIds.has('FORBIDDEN')).toBe(true);
  });

  it('/v1 ACL: skips an orphaned subagent reference (getAgent returns null)', async () => {
    const A = makeConfig('A', ['GONE']);
    const skippedAgentIds = new Set<string>();
    const { loader, loadAgentById } = makeLoader(A, {}, {
      getAgent: async () => null,
      checkSubagentAccess: async () => true,
      skippedAgentIds,
    });

    await loader.resolveSubagentTrees([A]);

    expect(A.subagentAgentConfigs).toEqual([]);
    expect(skippedAgentIds.has('GONE')).toBe(true);
    expect(loadAgentById).not.toHaveBeenCalled();
  });
});

describe('buildRemoteAgentSubagentAccessCheck', () => {
  it('returns false when the request has no authenticated user', async () => {
    const check = buildRemoteAgentSubagentAccessCheck(
      { user: undefined },
      jest.fn().mockResolvedValue(true),
    );
    expect(await check({ id: 'X', _id: 'mongo-X' } as unknown as Agent)).toBe(false);
  });

  it('delegates to checkPermission with REMOTE_AGENT + VIEW for the agent _id', async () => {
    const checkPermission = jest.fn().mockResolvedValue(true);
    const check = buildRemoteAgentSubagentAccessCheck(
      { user: { id: 'u1', role: 'USER' } },
      checkPermission,
    );
    const result = await check({ id: 'X', _id: 'mongo-X' } as unknown as Agent);
    expect(result).toBe(true);
    expect(checkPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        resourceType: ResourceType.REMOTE_AGENT,
        resourceId: 'mongo-X',
        requiredPermission: PermissionBits.VIEW,
      }),
    );
  });
});
