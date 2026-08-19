import { PermissionBits } from 'librechat-data-provider';

/**
 * Upper bound for any stored `permBits` value. Computed as the bitwise OR of
 * every numeric member of `PermissionBits`. Used by:
 *
 *   - the `permBits` schema validator (rejects writes above this bound)
 *   - `permissionBitSupersets` (enumerates `$in` candidates within this range)
 *   - every ACL read path (via `permissionBitSupersets`)
 *
 * The shared definition keeps the read-side enumeration and the write-side
 * bound locked together: adding a new member to `PermissionBits` auto-expands
 * both at once. See issue #12729 for the Cosmos DB / `$bitsAllSet` fix.
 */
export const MAX_PERM_BITS: number = Object.values(PermissionBits)
  .filter((v): v is number => typeof v === 'number')
  .reduce((acc, v) => acc | v, 0);

/**
 * Fails loudly at module load if `PermissionBits` is ever refactored to a
 * `const` object, string enum, or all-string shape — any of those would make
 * `Object.values(...).filter(isNumber)` return `[]`, producing
 * `MAX_PERM_BITS === 0`. That would silently make the schema reject every
 * non-zero write AND make `permissionBitSupersets` return `[0]` for every
 * input, denying every permission check. Crashing at startup is strictly
 * better than either silent failure mode.
 */
if (MAX_PERM_BITS === 0) {
  throw new Error(
    'MAX_PERM_BITS is 0 — `PermissionBits` did not yield any numeric members. ' +
      'This typically means the enum was refactored to a `const` object, a ' +
      'string enum, or an all-string shape; rewrite the reducer above to ' +
      'extract the numeric bits from the new shape, or give ' +
      '`permissionBitSupersets` an explicit bit-width parameter.',
  );
}

/**
 * `permissionBitSupersets` enumerates `[0, MAX_PERM_BITS]` — size `2^n` where
 * `n` is the number of permission bits. At 4 bits that's 16 values; at 8 bits
 * 256; at 16 bits 65,536. Above a few hundred the resulting `$in` list would
 * degrade query plans and balloon document transfer, so fail loudly if the
 * enum grows past a safe ceiling. Lifting this limit requires a different
 * bit-matching strategy (e.g. `$expr` with `$bitAnd` where supported).
 */
if (MAX_PERM_BITS > 255) {
  throw new Error(
    `MAX_PERM_BITS=${MAX_PERM_BITS} exceeds the $in-enumeration ceiling of 255. ` +
      'The current permissionBitSupersets approach would emit more than 256 ' +
      'candidates, degrading query plans. Replace the enumeration strategy ' +
      'before raising this limit.',
  );
}
