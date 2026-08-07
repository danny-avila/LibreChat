import type {
  ClickHouseParam,
  ClickHouseQueryClient,
  HistoryArm,
  HistoryCandidate,
  HistoryCandidateRequest,
  HistoryCandidateResult,
  HistoryDegradation,
} from './types';

export const EMBEDDING_DIMENSIONS = 1024;

/** PLAN Search-purpose policy: 50 candidates per arm, hard cap 200 across fusion. */
export const DEFAULT_ARM_LIMIT = 50;
export const MAX_ARM_LIMIT = 200;

const BOTH_ARMS: readonly HistoryArm[] = ['text', 'vector'];

/**
 * Latest-version projection.
 *
 * ClickHouse collapses ReplacingMergeTree duplicates only at unscheduled merge
 * time, so a serving query must never assume one row per key — an un-merged part
 * can still hold a superseded, content-bearing version of a deleted record. Two
 * details make this correct without `FINAL`:
 *
 *  - Aggregation is a single `argMax` over a TUPLE of every projected column,
 *    not one `argMax` per column. Column-wise `argMax(nullable_col, version)`
 *    skips NULL values and returns an *older* non-null one, which would resurrect
 *    a cleared `expires_at`. Verified against ClickHouse 26.8 in `sql.spec.ts`.
 *  - The deletion / temporary / expiry filters are applied to the aggregated
 *    latest version, never to raw rows (PLAN [R21]).
 */
const LATEST_COLUMNS = `
    max(projection_version) AS version,
    argMax(
      (conversation_id, title, body, is_deleted, is_temporary, expires_at, has_embedding, embedding),
      projection_version
    ) AS latest`;

const LIVE_PREDICATE = `
    latest.4 = 0
    AND latest.5 = 0
    AND (latest.6 IS NULL OR latest.6 > now64(3))`;

/**
 * Text arm. Two stages, because a single-stage aggregation over text-matched
 * rows would compute `argMax` across a subset: a record whose *older* version
 * matches the query but whose latest version does not would be admitted with the
 * older version's fields. Stage 1 collects candidate keys from any version;
 * stage 2 aggregates ALL versions of those keys and re-applies the predicate to
 * the latest one.
 *
 * `tenant_id` and `user_id` equality predicates appear in BOTH stages. ClickHouse
 * has no row-level security; these predicates are the only scoping this tier has,
 * and they double as the primary-key prefix.
 */
export const textArmSql = `
WITH matched AS (
  SELECT DISTINCT record_id
  FROM chat_search.documents
  WHERE tenant_id = {tenant_id:String}
    AND user_id = {user_id:String}
    AND kind = {kind:String}
    AND (positionCaseInsensitiveUTF8(title, {query:String}) > 0
      OR positionCaseInsensitiveUTF8(body, {query:String}) > 0)
),
latest AS (
  SELECT
    record_id,${LATEST_COLUMNS}
  FROM chat_search.documents
  WHERE tenant_id = {tenant_id:String}
    AND user_id = {user_id:String}
    AND kind = {kind:String}
    AND record_id IN (SELECT record_id FROM matched)
  GROUP BY record_id
)
SELECT
  record_id,
  latest.1 AS conversation_id,
  toString(version) AS projection_version,
  toFloat64(
    2 * (positionCaseInsensitiveUTF8(latest.2, {query:String}) > 0)
    + (positionCaseInsensitiveUTF8(latest.3, {query:String}) > 0)
    + 0.1 * least(countSubstringsCaseInsensitiveUTF8(latest.3, {query:String}), 10)
  ) AS score
FROM latest
WHERE${LIVE_PREDICATE}
  AND (positionCaseInsensitiveUTF8(latest.2, {query:String}) > 0
    OR positionCaseInsensitiveUTF8(latest.3, {query:String}) > 0)
ORDER BY score DESC, record_id ASC
LIMIT {limit:UInt32}
`;

/**
 * Vector arm: exact scoped scan, mirroring the PostgreSQL side until
 * filtered-recall gates pass. The tenant+user ORDER BY prefix bounds the scan to
 * one user's corpus.
 *
 * `has_embedding` is written by the consumer only when the vector's
 * embedding-input hash matched the document's, so a stale vector never reaches
 * ClickHouse and cannot be ranked against newer text.
 */
export const vectorArmSql = `
WITH latest AS (
  SELECT
    record_id,${LATEST_COLUMNS}
  FROM chat_search.documents
  WHERE tenant_id = {tenant_id:String}
    AND user_id = {user_id:String}
    AND kind = {kind:String}
  GROUP BY record_id
)
SELECT
  record_id,
  latest.1 AS conversation_id,
  toString(version) AS projection_version,
  toFloat64(1 - cosineDistance(latest.8, {query_vector:Array(Float32)})) AS score
FROM latest
WHERE${LIVE_PREDICATE}
  AND latest.7 = 1
ORDER BY score DESC, record_id ASC
LIMIT {limit:UInt32}
`;

export interface HistoryCandidateAdapter {
  /**
   * Candidate IDs and scores from the ClickHouse text and vector arms.
   *
   * Additive only (PLAN locked decision 6): PostgreSQL always searches the full
   * corpus and wins dedup ties. Results are NOT safe to return to a user until
   * the caller has applied `applyFailClosedAntiJoin` — see `guard.ts`.
   */
  fetchCandidates(request: HistoryCandidateRequest): Promise<HistoryCandidateResult>;
  isReady(): Promise<boolean>;
}

export type CandidateAdapterOptions = Readonly<{
  /** Per-arm candidate cap. Defaults to 50, hard-capped at 200. */
  armLimit?: number;
  onError?: (arm: HistoryArm, error: unknown) => void;
}>;

export function createCandidateAdapter(
  clickhouse: ClickHouseQueryClient,
  options: CandidateAdapterOptions = {},
): HistoryCandidateAdapter {
  const armLimit = Math.min(options.armLimit ?? DEFAULT_ARM_LIMIT, MAX_ARM_LIMIT);

  async function fetchCandidates(
    request: HistoryCandidateRequest,
  ): Promise<HistoryCandidateResult> {
    assertScoped(request);

    const arms = request.arms ?? BOTH_ARMS;
    const limit = Math.min(request.limit > 0 ? request.limit : armLimit, armLimit);
    const degradations: HistoryDegradation[] = [];
    const wantsVector = arms.includes('vector');
    const hasVector = isUsableVector(request.queryVector);

    if (wantsVector && !hasVector) {
      degradations.push('embedding-unavailable');
    }

    const pending: Promise<readonly HistoryCandidate[]>[] = [];
    if (arms.includes('text') && request.query.length > 0) {
      pending.push(
        runArm('text', clickhouse, textArmSql, {
          tenant_id: request.scope.tenantId,
          user_id: request.scope.userId,
          kind: request.kind,
          query: request.query,
          limit,
        }).catch((error) => {
          options.onError?.('text', error);
          degradations.push('clickhouse-unavailable');
          return [];
        }),
      );
    }

    if (wantsVector && hasVector) {
      pending.push(
        runArm('vector', clickhouse, vectorArmSql, {
          tenant_id: request.scope.tenantId,
          user_id: request.scope.userId,
          kind: request.kind,
          query_vector: request.queryVector as readonly number[],
          limit,
        }).catch((error) => {
          options.onError?.('vector', error);
          degradations.push('clickhouse-unavailable');
          return [];
        }),
      );
    }

    const settled = await Promise.all(pending);
    const candidates: HistoryCandidate[] = [];
    for (let i = 0; i < settled.length; i++) {
      for (let j = 0; j < settled[i].length; j++) {
        candidates.push(settled[i][j]);
      }
    }

    return { candidates, degradations: dedupeDegradations(degradations) };
  }

  async function isReady(): Promise<boolean> {
    if (typeof clickhouse.ping !== 'function') {
      return true;
    }
    try {
      const result = await clickhouse.ping();
      return result.success === true;
    } catch {
      return false;
    }
  }

  return { fetchCandidates, isReady };
}

type ArmQueryRow = {
  record_id: string;
  conversation_id: string;
  projection_version: string;
  score: number;
};

async function runArm(
  arm: HistoryArm,
  clickhouse: ClickHouseQueryClient,
  query: string,
  params: Record<string, ClickHouseParam>,
): Promise<readonly HistoryCandidate[]> {
  const result = await clickhouse.query({ query, query_params: params, format: 'JSONEachRow' });
  const rows = await result.json<ArmQueryRow>();

  const candidates: HistoryCandidate[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    candidates[i] = {
      recordId: rows[i].record_id,
      conversationId: rows[i].conversation_id,
      score: Number(rows[i].score),
      arm,
      projectionVersion: BigInt(rows[i].projection_version),
    };
  }
  return candidates;
}

/**
 * ClickHouse has no row-level security. A query without both scope predicates is
 * a cross-tenant read, so an empty tenant or user is a programming error and must
 * fail loudly rather than widen scope. `__SYSTEM__` is a query-time wildcard in
 * this codebase (PLAN [R9]) and is rejected outright — this tier never
 * special-cases it into a skipped predicate.
 */
function assertScoped(request: HistoryCandidateRequest): void {
  const { tenantId, userId } = request.scope;
  if (!tenantId || !userId) {
    throw new Error('history candidates require a resolved tenantId and userId');
  }
  if (tenantId === '__SYSTEM__') {
    throw new Error('history candidates cannot be fetched under the system tenant');
  }
}

function isUsableVector(vector: readonly number[] | undefined): boolean {
  return vector !== undefined && vector.length === EMBEDDING_DIMENSIONS;
}

function dedupeDegradations(
  degradations: readonly HistoryDegradation[],
): readonly HistoryDegradation[] {
  return degradations.length > 1 ? Array.from(new Set(degradations)) : degradations;
}
