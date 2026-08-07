import type { ClickHouseParam, ClickHouseQueryClient } from './types';
import { createCandidateAdapter, textArmSql, vectorArmSql } from './candidates';

type Captured = { query: string; params: Record<string, ClickHouseParam> };

class StubClickHouse implements ClickHouseQueryClient {
  captured: Captured[] = [];
  rowsByQuery = new Map<string, Array<Record<string, string | number>>>();
  failing = new Set<string>();
  pingResult = true;

  async insert(): Promise<unknown> {
    return undefined;
  }

  async query(params: {
    query: string;
    query_params?: Record<string, ClickHouseParam>;
    format: 'JSONEachRow';
  }): Promise<{ json<TRow>(): Promise<TRow[]> }> {
    const arm = params.query === textArmSql ? 'text' : 'vector';
    this.captured.push({ query: params.query, params: params.query_params ?? {} });

    if (this.failing.has(arm)) {
      throw new Error(`${arm} arm unavailable`);
    }

    const rows = this.rowsByQuery.get(arm) ?? [];
    return { json: async <TRow>() => rows as unknown as TRow[] };
  }

  async ping(): Promise<{ success: boolean }> {
    return { success: this.pingResult };
  }
}

const scope = { tenantId: '__BASE__', userId: 'u1' };
const vector = new Array(1024).fill(0.01);

function hit(recordId: string, version: string, score: number) {
  return { record_id: recordId, conversation_id: 'c1', projection_version: version, score };
}

describe('candidate adapter — scoping', () => {
  it('injects tenant and user predicates into every arm query', async () => {
    const clickhouse = new StubClickHouse();
    const adapter = createCandidateAdapter(clickhouse);

    await adapter.fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      queryVector: vector,
      limit: 50,
    });

    expect(clickhouse.captured).toHaveLength(2);
    for (const call of clickhouse.captured) {
      expect(call.params.tenant_id).toBe('__BASE__');
      expect(call.params.user_id).toBe('u1');
      expect(call.query).toContain('tenant_id = {tenant_id:String}');
      expect(call.query).toContain('user_id = {user_id:String}');
    }
  });

  it('scopes both stages of the two-stage text query', () => {
    const stages = textArmSql.split('latest AS');
    expect(stages).toHaveLength(2);
    for (const stage of stages) {
      expect(stage).toContain('tenant_id = {tenant_id:String}');
      expect(stage).toContain('user_id = {user_id:String}');
    }
  });

  it('rejects an unresolved scope rather than widening it', async () => {
    const adapter = createCandidateAdapter(new StubClickHouse());

    await expect(
      adapter.fetchCandidates({
        scope: { tenantId: '', userId: 'u1' },
        kind: 'message',
        query: 'x',
        limit: 10,
      }),
    ).rejects.toThrow(/resolved tenantId and userId/);

    await expect(
      adapter.fetchCandidates({
        scope: { tenantId: '__BASE__', userId: '' },
        kind: 'message',
        query: 'x',
        limit: 10,
      }),
    ).rejects.toThrow(/resolved tenantId and userId/);
  });

  it('rejects the system tenant instead of treating it as a wildcard', async () => {
    const adapter = createCandidateAdapter(new StubClickHouse());

    await expect(
      adapter.fetchCandidates({
        scope: { tenantId: '__SYSTEM__', userId: 'u1' },
        kind: 'message',
        query: 'x',
        limit: 10,
      }),
    ).rejects.toThrow(/system tenant/);
  });

  it('never issues a query when the scope check fails', async () => {
    const clickhouse = new StubClickHouse();
    const adapter = createCandidateAdapter(clickhouse);

    await expect(
      adapter.fetchCandidates({
        scope: { tenantId: '__SYSTEM__', userId: 'u1' },
        kind: 'message',
        query: 'x',
        limit: 10,
      }),
    ).rejects.toThrow();

    expect(clickhouse.captured).toEqual([]);
  });
});

describe('candidate adapter — arms', () => {
  it('returns IDs, scores and versions from both arms', async () => {
    const clickhouse = new StubClickHouse();
    clickhouse.rowsByQuery.set('text', [hit('m1', '5', 2.5)]);
    clickhouse.rowsByQuery.set('vector', [hit('m2', '9', 0.87)]);

    const result = await createCandidateAdapter(clickhouse).fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      queryVector: vector,
      limit: 50,
    });

    expect(result.candidates).toEqual([
      {
        recordId: 'm1',
        conversationId: 'c1',
        score: 2.5,
        arm: 'text',
        projectionVersion: BigInt(5),
      },
      {
        recordId: 'm2',
        conversationId: 'c1',
        score: 0.87,
        arm: 'vector',
        projectionVersion: BigInt(9),
      },
    ]);
    expect(result.degradations).toEqual([]);
  });

  it('skips the vector arm and degrades when no query vector is supplied', async () => {
    const clickhouse = new StubClickHouse();
    clickhouse.rowsByQuery.set('text', [hit('m1', '1', 1)]);

    const result = await createCandidateAdapter(clickhouse).fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      limit: 50,
    });

    expect(clickhouse.captured.map((c) => c.query)).toEqual([textArmSql]);
    expect(result.degradations).toEqual(['embedding-unavailable']);
    expect(result.candidates).toHaveLength(1);
  });

  it('treats a wrong-dimension query vector as no vector at all', async () => {
    const clickhouse = new StubClickHouse();

    const result = await createCandidateAdapter(clickhouse).fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      queryVector: [0.1, 0.2, 0.3],
      limit: 50,
    });

    expect(clickhouse.captured.map((c) => c.query)).toEqual([textArmSql]);
    expect(result.degradations).toEqual(['embedding-unavailable']);
  });

  it('runs only the requested arms', async () => {
    const clickhouse = new StubClickHouse();

    await createCandidateAdapter(clickhouse).fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      queryVector: vector,
      arms: ['vector'],
      limit: 50,
    });

    expect(clickhouse.captured.map((c) => c.query)).toEqual([vectorArmSql]);
  });

  it('caps the per-arm limit at the configured arm limit', async () => {
    const clickhouse = new StubClickHouse();

    await createCandidateAdapter(clickhouse, { armLimit: 25 }).fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      limit: 500,
      arms: ['text'],
    });

    expect(clickhouse.captured[0].params.limit).toBe(25);
  });

  it('caps the arm limit at the hard 200 ceiling', async () => {
    const clickhouse = new StubClickHouse();

    await createCandidateAdapter(clickhouse, { armLimit: 5000 }).fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      limit: 5000,
      arms: ['text'],
    });

    expect(clickhouse.captured[0].params.limit).toBe(200);
  });
});

describe('candidate adapter — degradation', () => {
  it('degrades instead of throwing when one arm fails', async () => {
    const clickhouse = new StubClickHouse();
    clickhouse.failing.add('text');
    clickhouse.rowsByQuery.set('vector', [hit('m2', '1', 0.5)]);

    const result = await createCandidateAdapter(clickhouse).fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      queryVector: vector,
      limit: 50,
    });

    expect(result.degradations).toEqual(['clickhouse-unavailable']);
    expect(result.candidates.map((c) => c.recordId)).toEqual(['m2']);
  });

  it('reports compound failures once, not per arm', async () => {
    const clickhouse = new StubClickHouse();
    clickhouse.failing.add('text');
    clickhouse.failing.add('vector');

    const result = await createCandidateAdapter(clickhouse).fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      queryVector: vector,
      limit: 50,
    });

    expect(result.candidates).toEqual([]);
    expect(result.degradations).toEqual(['clickhouse-unavailable']);
  });

  it('surfaces both degradation kinds together', async () => {
    const clickhouse = new StubClickHouse();
    clickhouse.failing.add('text');

    const result = await createCandidateAdapter(clickhouse).fetchCandidates({
      scope,
      kind: 'message',
      query: 'hello',
      limit: 50,
    });

    expect([...result.degradations].sort()).toEqual([
      'clickhouse-unavailable',
      'embedding-unavailable',
    ]);
  });

  it('reports readiness from the ClickHouse ping', async () => {
    const clickhouse = new StubClickHouse();
    const adapter = createCandidateAdapter(clickhouse);

    expect(await adapter.isReady()).toBe(true);

    clickhouse.pingResult = false;
    expect(await adapter.isReady()).toBe(false);
  });
});
