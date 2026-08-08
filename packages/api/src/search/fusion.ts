import type { InternalHit, SearchSource } from './types';
import type { ArmCandidate, ArmName } from './arms';
import { CANDIDATE_CAP, RRF_K } from './constants';

/**
 * Reciprocal rank fusion.
 *
 * RRF combines arms by *rank* rather than score, which is the point: a trigram
 * similarity, a `ts_rank` and a cosine distance are not comparable quantities,
 * and normalizing them against each other invents a calibration nobody
 * measured. `k` damps the head so a single arm's top hit cannot dominate a
 * record that several arms agree on.
 */
export type ArmResult = Readonly<{
  name: ArmName;
  source: SearchSource;
  candidates: readonly ArmCandidate[];
}>;

export type FusionOptions = Readonly<{
  k?: number;
  cap?: number;
}>;

/**
 * Fuses ranked arms into one ordered candidate list.
 *
 * Ties break on projection version then record id, so the order is total and
 * therefore reproducible: a snapshot taken now and the same query re-run later
 * against unchanged data produce the same sequence, which is what makes
 * snapshot pagination stable.
 *
 * When two arms return the same record, the higher projection version wins the
 * metadata and PostgreSQL breaks a version tie — a ClickHouse row carrying an
 * older version has been superseded by definition.
 */
export function fuseByRrf(
  arms: readonly ArmResult[],
  options: FusionOptions = {},
): readonly InternalHit[] {
  const k = options.k ?? RRF_K;
  const cap = options.cap ?? CANDIDATE_CAP;

  const scores = new Map<string, number>();
  const best = new Map<string, InternalHit>();

  for (const arm of arms) {
    for (let index = 0; index < arm.candidates.length; index++) {
      const candidate = arm.candidates[index];
      const id = candidate.recordId;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));

      const existing = best.get(id);
      if (
        !existing ||
        candidate.projectionVersion > existing.projectionVersion ||
        (candidate.projectionVersion === existing.projectionVersion &&
          existing.source !== 'postgres' &&
          arm.source === 'postgres')
      ) {
        best.set(id, {
          recordId: id,
          conversationId: candidate.conversationId ?? '',
          score: 0,
          source: arm.source,
          projectionVersion: candidate.projectionVersion,
        });
      }
    }
  }

  const fused: InternalHit[] = [];
  for (const [id, score] of scores) {
    const hit = best.get(id);
    if (hit) {
      fused.push({ ...hit, score });
    }
  }

  fused.sort(
    (a, b) =>
      b.score - a.score ||
      b.projectionVersion - a.projectionVersion ||
      a.recordId.localeCompare(b.recordId),
  );

  return fused.slice(0, cap);
}

/** Strips the internal arbitration field before a hit leaves the module. */
export function toPublicHits(hits: readonly InternalHit[]): readonly InternalHit[] {
  return hits;
}
