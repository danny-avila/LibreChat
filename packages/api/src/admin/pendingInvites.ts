import { SystemRoles } from 'librechat-data-provider';
import type { IToken, IUser } from '@librechat/data-schemas';

export type UserMembershipStatus = 'active' | 'pending';

export function getInviteRoleFromMetadata(
  metadata: Map<string, unknown> | Record<string, unknown> | undefined,
): typeof SystemRoles.ADMIN | typeof SystemRoles.USER {
  let role: unknown;
  if (metadata instanceof Map) {
    role = metadata.get('role');
  } else if (metadata && typeof metadata === 'object') {
    role = metadata.role;
  }
  return role === SystemRoles.ADMIN ? SystemRoles.ADMIN : SystemRoles.USER;
}

export function inviteDisplayName(email: string): string {
  const local = email.split('@')[0]?.trim();
  return local || email;
}

export function filterPendingInvitesForRegisteredEmails(
  invites: IToken[],
  registeredEmails: ReadonlySet<string>,
): IToken[] {
  const seen = new Set<string>();
  const pending: IToken[] = [];

  for (const invite of invites) {
    const email = invite.email?.trim().toLowerCase();
    if (!email || registeredEmails.has(email) || seen.has(email)) {
      continue;
    }
    seen.add(email);
    pending.push(invite);
  }

  return pending;
}

export function collectRegisteredEmails(users: IUser[]): Set<string> {
  const emails = new Set<string>();
  for (const user of users) {
    const email = user.email?.trim().toLowerCase();
    if (email) {
      emails.add(email);
    }
  }
  return emails;
}

export function filterInvitesBySearch(invites: IToken[], search?: string): IToken[] {
  if (!search) {
    return invites;
  }
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'i');
  return invites.filter((invite) => {
    const email = invite.email ?? '';
    return pattern.test(email) || pattern.test(inviteDisplayName(email));
  });
}

export function adjustPaginationForPending(
  limit: number,
  offset: number,
  pendingCount: number,
): { userLimit: number; userOffset: number } {
  if (pendingCount <= 0) {
    return { userLimit: limit, userOffset: offset };
  }
  if (offset === 0) {
    return { userLimit: Math.max(0, limit - pendingCount), userOffset: 0 };
  }
  return { userLimit: limit, userOffset: Math.max(0, offset - pendingCount) };
}
