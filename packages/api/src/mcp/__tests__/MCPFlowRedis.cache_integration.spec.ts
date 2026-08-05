import { randomUUID } from 'crypto';
import type { Keyv } from 'keyv';
import { keyvRedisClient, keyvRedisClientReady } from '~/cache/redisClients';
import { closeRedisClients } from '~/cache/__tests__/redisClients.helper';
import { standardCache } from '~/cache/cacheFactory';
import { FlowStateManager } from '~/flow/manager';

const FLOW_TYPE = 'mcp_oauth';
const FLOW_TTL = 30_000;

describe('MCP OAuth flow state across Redis-backed instances', () => {
  let podAStore: Keyv;
  let podBStore: Keyv;
  let podA: FlowStateManager<string>;
  let podB: FlowStateManager<string>;
  const flowIds = new Set<string>();

  beforeAll(async () => {
    if (!keyvRedisClient || !keyvRedisClientReady) {
      throw new Error('MCP cross-instance flow tests require a real Redis client');
    }
    await keyvRedisClientReady;
    const namespace = `MCPFlowRedis-${process.pid}-${randomUUID()}`;
    podAStore = standardCache(namespace, FLOW_TTL);
    podBStore = standardCache(namespace, FLOW_TTL);
    podA = new FlowStateManager<string>(podAStore, {
      ttl: FLOW_TTL,
      retainedFailureTypes: [FLOW_TYPE],
      ci: true,
    });
    podB = new FlowStateManager<string>(podBStore, {
      ttl: FLOW_TTL,
      retainedFailureTypes: [FLOW_TYPE],
      ci: true,
    });
  });

  afterEach(async () => {
    await Promise.all([...flowIds].map((flowId) => podA.deleteFlow(flowId, FLOW_TYPE)));
    flowIds.clear();
  });

  afterAll(async () => {
    await closeRedisClients();
  });

  function createFlowId(): string {
    const flowId = randomUUID();
    flowIds.add(flowId);
    return flowId;
  }

  it('shares pending and completed OAuth state between pod instances', async () => {
    const flowId = createFlowId();

    await podA.initFlow(flowId, FLOW_TYPE, { authorizationUrl: 'https://oauth.example/auth' });
    await expect(podB.getFlowState(flowId, FLOW_TYPE)).resolves.toEqual(
      expect.objectContaining({ status: 'PENDING' }),
    );

    await podB.completeFlow(flowId, FLOW_TYPE, 'authorized');
    await expect(podA.getFlowState(flowId, FLOW_TYPE)).resolves.toEqual(
      expect.objectContaining({ status: 'COMPLETED', result: 'authorized' }),
    );
  });

  it('retains a terminal OAuth failure for polling on another pod', async () => {
    const flowId = createFlowId();

    await podA.initFlow(flowId, FLOW_TYPE);
    const waiter = podA.createFlow(flowId, FLOW_TYPE);
    await podB.failFlow(flowId, FLOW_TYPE, new Error('provider rejected request'));

    await expect(waiter).rejects.toThrow('provider rejected request');
    await expect(podB.getFlowState(flowId, FLOW_TYPE)).resolves.toEqual(
      expect.objectContaining({ status: 'FAILED', error: 'provider rejected request' }),
    );
  });
});
