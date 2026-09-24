import { SystemRoles } from 'librechat-data-provider';

const SYSTEM_ROLE_NAMES = new Set<string>(Object.values(SystemRoles));

/**
 * Matches `isSystemRoleName` in packages/api/src/admin/roles.ts, which uppercases the
 * name before the check, so `admin` is refused exactly like `ADMIN`.
 */
export const isSystemRole = (name: string): boolean => SYSTEM_ROLE_NAMES.has(name.toUpperCase());

/** `addRoleMember`/`removeRoleMember` answer 403 for every system role except ADMIN. */
export const acceptsManualMembers = (name: string): boolean =>
  !isSystemRole(name) || name.toUpperCase() === SystemRoles.ADMIN;

export const SYSTEM_ROLE_REASON =
  'ADMIN and USER are system roles. The API answers 403 to a rename or a delete on them, so those controls stay disabled here.';

/**
 * Startup re-seeding only ever touches ADMIN and USER (`updateInterfacePermissions` loops
 * over those two roles), and only for a permission type set under `interface:`.
 */
export const RESEED_WARNING =
  'This is a system role. Any permission type you also set under `interface:` in librechat.yaml is written back over these two roles on every server start, so an edit here to such a type does not survive a restart. Custom roles are never re-seeded.';

export const OPENID_SYNC_WARNING =
  'If OPENID_ROLE_SYNC_ENABLED is on, every OpenID login re-evaluates the user’s role from the configured claim and overwrites what you set here: a matching entry in OPENID_ROLE_SYNC_ROLE_PRIORITY wins, otherwise OPENID_ROLE_SYNC_FALLBACK_ROLE is applied, and the role only stays put when the claim is missing or unresolved. A user who is already ADMIN is skipped — generic role sync never touches, and never grants, ADMIN. Manual membership sticks for password logins, and for OpenID users only when their claim maps to the same role.';

/** What a move from one role to another costs in requests, before any of them is sent. */
export type RoleChangePlan =
  | { kind: 'noop'; role: string }
  | { kind: 'assign'; role: string }
  | { kind: 'revoke'; from: string; to: string }
  | { kind: 'blocked'; reason: string };

export const UNKNOWN_ROLE_REASON =
  'The search endpoint returns no role, so the role this user holds today is unknown here — and the API reaches USER only by removing the role they hold. Open them from the balances table, which carries the role, or assign a role instead.';

/**
 * `user.role` is a single field: `addRoleMember` writes the target over whatever the user
 * holds, and `removeRoleMember` writes USER back, so USER is reachable only as a removal
 * from the current role. A `current` of `''` means the caller does not know it.
 */
export const planRoleChange = (current: string, target: string): RoleChangePlan => {
  if (!target) {
    return { kind: 'blocked', reason: 'Pick the role this user should hold.' };
  }
  if (current === target) {
    return { kind: 'noop', role: target };
  }
  if (acceptsManualMembers(target)) {
    return { kind: 'assign', role: target };
  }
  if (target.toUpperCase() !== SystemRoles.USER) {
    return {
      kind: 'blocked',
      reason: `The API answers 403 to a membership write on ${target}, so it cannot be assigned from here.`,
    };
  }
  if (!current) {
    return { kind: 'blocked', reason: UNKNOWN_ROLE_REASON };
  }
  return { kind: 'revoke', from: current, to: SystemRoles.USER };
};
