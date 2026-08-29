import type { LogArgument } from './types';

export const OPENID_REFRESH_OWNERSHIP_LOST = 'OPENID_REFRESH_OWNERSHIP_LOST';

export function toOpenIDLogArgument(error: unknown): LogArgument {
  return error instanceof Error ? error : String(error);
}

/**
 * Marks the one failure mode that proves another worker owns this refresh: the coordination
 * record is no longer pending under our owner id. Callers that compensate a published side
 * effect must distinguish it from a transient coordination read failure, where ownership is
 * merely unknown and the side effect is still the caller's only usable credential.
 */
export function createOpenIDRefreshOwnershipError(message: string): Error {
  return Object.assign(new Error(message), { code: OPENID_REFRESH_OWNERSHIP_LOST });
}

export function isOpenIDRefreshOwnershipError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === OPENID_REFRESH_OWNERSHIP_LOST
  );
}
