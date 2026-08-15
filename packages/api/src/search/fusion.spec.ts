import type { InternalHit } from './types';
import type { ArmResult } from './fusion';
import { fuseByRrf, toPublicHits } from './fusion';

const PUBLIC_FIELDS = ['recordId', 'conversationId', 'score', 'source'];

const internalHit = (recordId: string, projectionVersion: number): InternalHit => ({
  recordId,
  conversationId: `convo-${recordId}`,
  score: 0.5,
  source: 'postgres',
  projectionVersion,
});

describe('toPublicHits', () => {
  it('omits the arbitration field from every hit it returns', () => {
    const hits = toPublicHits([internalHit('a', 7), internalHit('b', 1)]);

    expect(hits).toHaveLength(2);
    for (const hit of hits) {
      expect(Object.keys(hit).sort()).toEqual([...PUBLIC_FIELDS].sort());
      expect(Object.prototype.hasOwnProperty.call(hit, 'projectionVersion')).toBe(false);
    }
  });

  it('carries the public fields through unchanged', () => {
    expect(toPublicHits([internalHit('a', 7)])).toEqual([
      { recordId: 'a', conversationId: 'convo-a', score: 0.5, source: 'postgres' },
    ]);
  });

  it('leaves fused output free of the arbitration field', () => {
    const arms: ArmResult[] = [
      {
        name: 'exact',
        source: 'postgres',
        candidates: [{ recordId: 'a', conversationId: 'convo-a', score: 1, projectionVersion: 3 }],
      },
      {
        name: 'fts',
        source: 'clickhouse',
        candidates: [{ recordId: 'b', conversationId: 'convo-b', score: 1, projectionVersion: 9 }],
      },
    ];

    const fused = fuseByRrf(arms);
    expect(fused.every((hit) => hit.projectionVersion > 0)).toBe(true);

    for (const hit of toPublicHits(fused)) {
      expect(Object.keys(hit)).not.toContain('projectionVersion');
    }
  });

  it('returns an empty list for an empty input', () => {
    expect(toPublicHits([])).toEqual([]);
  });
});
