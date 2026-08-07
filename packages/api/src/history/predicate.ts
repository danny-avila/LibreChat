/**
 * ClickHouse scope rendering — the per-store half of PLAN "Multi-tenancy and
 * scope safety".
 *
 * This file renders a resolved `Scope` into ClickHouse `{name:Type}` parameter
 * predicates and nothing else. It performs NO identity resolution, normalization
 * or validation of its own: that half is shared and lives in
 * `packages/data-schemas/src/config/tenantContext.ts` (track 4), imported here
 * through `./scope` until it lands. Splitting it this way is deliberate — the
 * safety-critical decision "is this scope legitimate" must have exactly one
 * implementation across both stores, while SQL dialect cannot be shared at all.
 *
 * What this file DOES own is the record `kind`, which is a chat-search concept
 * and a ClickHouse column rather than a property of the principal.
 *
 * ClickHouse has no row-level security. The predicate below is the entire fence.
 */
import type { ClickHouseParam, HistoryKind } from './types';
import type { Scope } from './scope';
import { assertScope, UnscopedQueryError } from './scope';

const VALID_KINDS: readonly HistoryKind[] = ['message', 'conversation', 'shared-link'];

/**
 * Every kind this tier serves is USER-scoped, not merely tenant-scoped.
 * Messages and conversations are content-bearing — leaking them exposes raw
 * text rather than metadata. Shared links are scoped to the OWNER because this
 * is the owner's management view; public share consumption is a separate route
 * that never reaches this module and must not be conflated with it.
 */
export const SCOPE_PREDICATE_SQL =
  'tenant_id = {tenant_id:String}\n    AND user_id = {user_id:String}\n    AND kind = {kind:String}';

export type ScopePredicate = Readonly<{
  predicateSql: string;
  params: Readonly<Record<string, ClickHouseParam>>;
  tenantId: string;
  userId: string;
  kind: HistoryKind;
}>;

/**
 * Renders the one predicate every arm shares. Throws rather than widening when
 * the scope is unresolved, forged, or the kind is unknown, so a query builder
 * cannot reach ClickHouse without it.
 */
export function renderScopePredicate(scope: Scope, kind: HistoryKind): ScopePredicate {
  const resolved = assertScope(scope);

  if (!VALID_KINDS.includes(kind)) {
    throw new UnscopedQueryError('kind is missing or not a searchable record kind');
  }

  return {
    predicateSql: SCOPE_PREDICATE_SQL,
    params: { tenant_id: resolved.tenantId, user_id: resolved.userId, kind },
    tenantId: resolved.tenantId,
    userId: resolved.userId,
    kind,
  };
}
