import type { TPrincipal } from 'librechat-data-provider';

/**
 * Key a principal by its stable local `id` when present, falling back to
 * `idOnTheSource` for principals not yet synced locally (e.g. Entra groups/users
 * that only carry an external oid).
 *
 * Keying by `idOnTheSource` alone is unsafe: the same user can be represented with a
 * different `idOnTheSource` across sources. `getResourcePermissions` returns
 * `userInfo.idOnTheSource || _id` (the external oid for OpenID/Entra users), while the
 * people-picker returns the local `_id`. That mismatch places the same principal in
 * both the `updated` and `removed` sets — and because the server applies grants before
 * revocations, the resource owner's own grant is silently revoked when they share.
 */
export const principalKey = (share: TPrincipal): string =>
  `${share.type}-${share.id ?? share.idOnTheSource}`;

/**
 * Diff the currently-persisted shares (`currentShares`) against the working list
 * (`allShares`) to derive which principals to grant/update and which to revoke.
 */
export function computeShareChanges(
  currentShares: TPrincipal[],
  allShares: TPrincipal[],
): { updated: TPrincipal[]; removed: TPrincipal[] } {
  const originalSharesMap = new Map(currentShares.map((share) => [principalKey(share), share]));
  const allSharesMap = new Map(allShares.map((share) => [principalKey(share), share]));

  // Diff over the de-duplicated map values so a principal that appears more than once
  // in the input (possible while the add/dedupe path still keys on idOnTheSource) is
  // never emitted multiple times.
  const updated = [...allSharesMap.values()].filter((share) => {
    const original = originalSharesMap.get(principalKey(share));
    return !original || original.accessRoleId !== share.accessRoleId;
  });

  const removed = [...originalSharesMap.values()].filter(
    (share) => !allSharesMap.has(principalKey(share)),
  );

  return { updated, removed };
}
