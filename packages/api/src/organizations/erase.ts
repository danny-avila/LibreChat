import { logger, runInTenant, runInAccounts } from '@librechat/data-schemas';
import type { MembershipSummary } from './types';
import { getAuthIdentity } from './identity';

/** One member record to erase, with the tenant its data lives in. */
export interface ErasableMember {
  id: string;
  tenantId: string;
  role?: string;
}

export interface AccountEraserDeps {
  listMembershipsForIdentity: (identityId: string) => Promise<MembershipSummary[]>;
  /** The full single-user erasure cascade; throws when the deletion must be retried. */
  eraseMember: (member: ErasableMember) => Promise<void>;
  deletePasskeysByUser: (userId: string) => Promise<unknown>;
  deleteTokens: (query: { userId: string }) => Promise<unknown>;
  deleteAllAccountSessions: (accountId: string) => Promise<unknown>;
  deleteUserById: (userId: string) => Promise<{ deletedCount?: number }>;
}

/**
 * Deletes a login account in organizations mode. Each membership is erased in turn, inside
 * its own tenant, with the same cascade a single-tenant user gets; the account record, its
 * passkeys, tokens and sessions go last. A failure stops before the account is removed, so
 * the person can retry: memberships already erased are gone and the retry erases the rest.
 */
export function createAccountEraser(deps: AccountEraserDeps): (accountId: string) => Promise<void> {
  return async (accountId) => {
    const memberships = await deps.listMembershipsForIdentity(accountId);
    for (const membership of memberships) {
      const member: ErasableMember = {
        id: membership._id.toString(),
        tenantId: membership.tenantId,
        role: membership.role,
      };
      await runInTenant(member.tenantId, () => deps.eraseMember(member));
    }

    await runInAccounts(async () => {
      await Promise.all([
        deps.deletePasskeysByUser(accountId),
        deps.deleteTokens({ userId: accountId }),
        deps.deleteAllAccountSessions(accountId),
      ]);
      const deleted = await deps.deleteUserById(accountId);
      if (deleted.deletedCount !== 1) {
        throw new Error('Account disappeared before its deletion could commit');
      }
    });
    logger.info(
      `[eraseAccount] Account deleted with ${memberships.length} organization membership(s). ID: ${accountId}`,
    );
  };
}

/**
 * Reads the record that owns a signed-in user's credentials: the login account behind an
 * organization member (in the accounts tenant), or the user itself.
 */
export function createCredentialOwnerLoader<U>(deps: {
  getUserById: (userId: string, projection?: string | null) => Promise<U | null>;
}): (user: { id: string }, projection: string) => Promise<U | null> {
  return (user, projection) => {
    const account = getAuthIdentity(user);
    if (account) {
      return runInAccounts(() => deps.getUserById(account._id.toString(), projection));
    }
    return deps.getUserById(user.id, projection);
  };
}
