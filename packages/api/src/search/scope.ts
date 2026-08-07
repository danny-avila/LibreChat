import { assertScope } from '@librechat/data-schemas';
import type { Scope } from '@librechat/data-schemas';
import type { SearchKind } from './types';
import { TENANT_GUC, USER_GUC } from './constants';

export type { Scope };
export {
  createScope,
  resolveScope,
  assertScope,
  UnscopedAccessError,
} from '@librechat/data-schemas';

/**
 * PostgreSQL rendering of the shared `Scope`.
 *
 * The scope value itself is resolved once, in `data-schemas`, and every tier
 * renders it in its own dialect. This module renders the PostgreSQL half: `$n`
 * predicates for the arms and the transaction-local GUCs the RLS policies read.
 *
 * PG arms carry explicit scope predicates even though forced RLS backs them.
 * RLS is the net, not the fence: it protects against a missed predicate, but a
 * predicate the planner can see is what keeps the scoped B-tree indexes usable
 * and what makes the arm's intent auditable. Both, always.
 *
 * No arm hand-writes `tenant_id = ...`. Arms receive a `ScopedQuery` and append
 * their own match predicate to it, so an arm that forgets scope cannot be
 * written — there is nothing to forget, and nothing to construct without going
 * through `scopedQuery`.
 */
const VALID_KINDS: readonly SearchKind[] = ['message', 'conversation', 'shared-link'];

export type ScopedQuery = Readonly<{
  /**
   * Scope *and* visibility as one inseparable predicate over the aliased
   * `chat_search.documents` row.
   */
  text: string;
  values: readonly unknown[];
  /** First free positional parameter index for the arm's own predicates. */
  nextIndex: number;
  scope: Scope;
  kind: SearchKind;
}>;

const ALIAS_PATTERN = /^[a-z_][a-z0-9_]*$/;

/**
 * Builds the one predicate every PostgreSQL arm shares.
 *
 * Expiry, temporary state and deletion are folded in here rather than left to
 * each arm because TTL deletions run no application code at all — nothing emits
 * a tombstone when retention expires, so query-time filtering is what makes
 * expired content stop matching immediately instead of waiting for the hourly
 * sweep. An arm that filters scope but forgets expiry is the same bug class as
 * one that forgets scope, so neither is separable from the other here.
 *
 * `now` is a parameter rather than an inline `now()` so every arm in one request
 * sees a single consistent instant and a test can pin the clock.
 */
export function scopedQuery(
  scope: Scope,
  kind: SearchKind,
  options: { alias?: string; now?: Date } = {},
): ScopedQuery {
  const validated = assertScope(scope);
  if (!VALID_KINDS.includes(kind)) {
    throw new Error(`[chatSearch] not a searchable record kind: ${String(kind)}`);
  }
  const alias = options.alias ?? 'd';
  if (!ALIAS_PATTERN.test(alias)) {
    throw new Error(`[chatSearch] unsafe table alias: ${alias}`);
  }

  return Object.freeze({
    text:
      `${alias}.tenant_id = $1 AND ${alias}.user_id = $2 AND ${alias}.kind = $3 ` +
      `AND ${alias}.deleted_at IS NULL AND ${alias}.is_temporary = false ` +
      `AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > $4)`,
    values: Object.freeze([validated.tenantId, validated.userId, kind, options.now ?? new Date()]),
    nextIndex: 5,
    scope: validated,
    kind,
  });
}

/**
 * Gate every arm builder calls before emitting SQL, mirroring the ClickHouse
 * tier's `assertScopeFilter`. A predicate that lost its tenant or user clause —
 * by a bad refactor, not by forgery — fails here rather than at a customer.
 */
export function assertScopedQuery(query: ScopedQuery | null | undefined): ScopedQuery {
  if (!query) {
    throw new Error('[chatSearch] no ScopedQuery supplied — build one with scopedQuery()');
  }
  assertScope(query.scope);
  if (!/\btenant_id = \$1\b/.test(query.text)) {
    throw new Error('[chatSearch] ScopedQuery is missing its tenant predicate');
  }
  if (!/\buser_id = \$2\b/.test(query.text)) {
    throw new Error('[chatSearch] ScopedQuery is missing its user predicate');
  }
  if (!/\bdeleted_at IS NULL\b/.test(query.text)) {
    throw new Error('[chatSearch] ScopedQuery is missing its deletion filter');
  }
  if (!/\bexpires_at\b/.test(query.text)) {
    throw new Error('[chatSearch] ScopedQuery is missing its expiry filter');
  }
  return query;
}

/**
 * Applies scope transaction-locally so the RLS policies see it for the life of
 * the transaction and nothing leaks onto the pooled connection after release.
 */
export function scopeGucStatement(scope: Scope): { text: string; values: readonly string[] } {
  const validated = assertScope(scope);
  return {
    text: 'SELECT set_config($1, $2, true), set_config($3, $4, true)',
    values: [TENANT_GUC, validated.tenantId, USER_GUC, validated.userId],
  };
}
