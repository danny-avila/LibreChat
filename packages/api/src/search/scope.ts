import { assertScope } from '@librechat/data-schemas';
import type { Scope } from '@librechat/data-schemas';
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
 * renders it in its own dialect. This module renders the PostgreSQL half — for
 * now the transaction-local GUCs the RLS policies read.
 *
 * Applying scope transaction-locally is what keeps it off the pooled connection
 * after release: `set_config(..., true)` is reverted when the transaction ends,
 * so a later request on the same physical connection starts with no scope at all
 * and forced RLS returns nothing rather than someone else's rows.
 */
export function scopeGucStatement(scope: Scope): { text: string; values: readonly string[] } {
  const validated = assertScope(scope);
  return {
    text: 'SELECT set_config($1, $2, true), set_config($3, $4, true)',
    values: [TENANT_GUC, validated.tenantId, USER_GUC, validated.userId],
  };
}
