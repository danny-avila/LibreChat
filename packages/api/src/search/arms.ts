import type { SearchClient } from './types';
import type { ScopedQuery } from './scope';
import { ARM_LIMIT, MIN_QUERY_LENGTH } from './constants';
import { assertScopedQuery } from './scope';

/**
 * The four PostgreSQL candidate arms.
 *
 * Every arm is built from a `ScopedQuery` and appends only its own match
 * predicate. Scope, expiry, temporary state and deletion arrive already fused
 * into that value, so an arm has nothing to remember and no way to opt out — the
 * builders take no tenant or user argument at all, and `assertScopedQuery`
 * re-checks the predicate before any SQL is emitted.
 *
 * Arms return candidate IDs and scores only. Stored search text never leaves
 * this module; the caller hydrates from the primary store.
 */
export type ArmName = 'exact' | 'trigram' | 'fts' | 'vector';

export type ArmCandidate = Readonly<{
  recordId: string;
  conversationId: string | null;
  score: number;
  projectionVersion: number;
}>;

export type ArmQuery = Readonly<{
  text: string;
  values: readonly unknown[];
}>;

type Row = {
  record_id: string;
  conversation_id: string | null;
  score: string | number;
  projection_version: string;
};

function toCandidates(rows: readonly Row[]): readonly ArmCandidate[] {
  return rows.map((row) => ({
    recordId: row.record_id,
    conversationId: row.conversation_id,
    score: Number(row.score),
    projectionVersion: Number(row.projection_version),
  }));
}

/**
 * Exact/phrase containment — the known-item and identifier path.
 *
 * Case-insensitive substring rather than equality: a user searching a filename,
 * an error string or an id expects to find the message containing it, not only a
 * message equal to it. Title matches outrank body matches.
 */
export function buildExactArm(scoped: ScopedQuery, query: string, limit = ARM_LIMIT): ArmQuery {
  const s = assertScopedQuery(scoped);
  const q = s.nextIndex;
  return {
    text: `SELECT d.record_id, d.conversation_id, d.projection_version,
                  CASE WHEN d.title ILIKE '%' || $${q} || '%' THEN 2.0 ELSE 1.0 END AS score
             FROM chat_search.documents d
            WHERE ${s.text}
              AND (d.title ILIKE '%' || $${q} || '%' OR d.body ILIKE '%' || $${q} || '%')
            ORDER BY score DESC, d.source_updated_at DESC NULLS LAST, d.record_id DESC
            LIMIT $${q + 1}`,
    values: [...s.values, query, limit],
  };
}

/** Fuzzy/typo tolerance over the GIN trigram indexes. */
export function buildTrigramArm(scoped: ScopedQuery, query: string, limit = ARM_LIMIT): ArmQuery {
  const s = assertScopedQuery(scoped);
  const q = s.nextIndex;
  return {
    text: `SELECT d.record_id, d.conversation_id, d.projection_version,
                  GREATEST(similarity(d.title, $${q}), similarity(d.body, $${q})) AS score
             FROM chat_search.documents d
            WHERE ${s.text}
              AND (d.title % $${q} OR d.body % $${q})
            ORDER BY score DESC, d.record_id DESC
            LIMIT $${q + 1}`,
    values: [...s.values, query, limit],
  };
}

/**
 * Full-text over the generated tsvector.
 *
 * `websearch_to_tsquery` rather than `plainto_tsquery` so quoted phrases and
 * `or`/`-` behave the way a user typing into a search box expects, and so a
 * malformed query degrades to no matches instead of raising.
 */
export function buildFtsArm(scoped: ScopedQuery, query: string, limit = ARM_LIMIT): ArmQuery {
  const s = assertScopedQuery(scoped);
  const q = s.nextIndex;
  return {
    text: `SELECT d.record_id, d.conversation_id, d.projection_version,
                  ts_rank(d.search_vector, websearch_to_tsquery('simple', $${q})) AS score
             FROM chat_search.documents d
            WHERE ${s.text}
              AND d.search_vector @@ websearch_to_tsquery('simple', $${q})
            ORDER BY score DESC, d.record_id DESC
            LIMIT $${q + 1}`,
    values: [...s.values, query, limit],
  };
}

/**
 * Vector similarity, joined to embeddings **only on a matching
 * embedding-input hash**.
 *
 * That join condition is the read half of the write-side compare-and-set: a
 * vector produced from text that has since been edited is excluded from serving
 * rather than left to rank the record by content it no longer has. The join is
 * also scoped on all four key columns, so the embeddings table cannot widen what
 * the documents predicate narrowed.
 */
export function buildVectorArm(
  scoped: ScopedQuery,
  embedding: readonly number[],
  space: string,
  limit = ARM_LIMIT,
): ArmQuery {
  const s = assertScopedQuery(scoped);
  const v = s.nextIndex;
  return {
    text: `SELECT d.record_id, d.conversation_id, d.projection_version,
                  1 - (e.embedding <=> $${v}::vector) AS score
             FROM chat_search.documents d
             JOIN chat_search.embeddings e
               ON e.tenant_id = d.tenant_id
              AND e.user_id = d.user_id
              AND e.kind = d.kind
              AND e.record_id = d.record_id
              AND e.embedding_input_hash = d.embedding_input_hash
              AND e.space = $${v + 1}
            WHERE ${s.text}
            ORDER BY e.embedding <=> $${v}::vector, d.record_id DESC
            LIMIT $${v + 2}`,
    values: [...s.values, `[${embedding.join(',')}]`, space, limit],
  };
}

async function run(client: SearchClient, query: ArmQuery): Promise<readonly ArmCandidate[]> {
  const { rows } = await client.query<Row>(query.text, [...query.values]);
  return toCandidates(rows);
}

export type LexicalArms = Readonly<Record<'exact' | 'trigram' | 'fts', readonly ArmCandidate[]>>;

/**
 * Runs the three lexical arms. They serve immediately and unconditionally: the
 * vector arm may be unavailable or still warming, and lexical results must never
 * wait on it.
 */
export async function runLexicalArms(
  client: SearchClient,
  scoped: ScopedQuery,
  query: string,
  limit = ARM_LIMIT,
): Promise<LexicalArms> {
  const [exact, trigram, fts] = await Promise.all([
    run(client, buildExactArm(scoped, query, limit)),
    run(client, buildTrigramArm(scoped, query, limit)),
    run(client, buildFtsArm(scoped, query, limit)),
  ]);
  return { exact, trigram, fts };
}

export function runVectorArm(
  client: SearchClient,
  scoped: ScopedQuery,
  embedding: readonly number[],
  space: string,
  limit = ARM_LIMIT,
): Promise<readonly ArmCandidate[]> {
  return run(client, buildVectorArm(scoped, embedding, space, limit));
}

/**
 * The vector arm does not engage below this length. Short fragments produce
 * near-meaningless embeddings, and every engagement costs a gateway round trip
 * on a debounced keystroke.
 */
export function shouldRunVectorArm(query: string): boolean {
  return query.length >= MIN_QUERY_LENGTH;
}
