import { SystemRoles } from 'librechat-data-provider';
import type { IToken, IUser } from '@librechat/data-schemas';
import {
  adjustPaginationForPending,
  collectRegisteredEmails,
  filterInvitesBySearch,
  filterPendingInvitesForRegisteredEmails,
  getInviteRoleFromMetadata,
  inviteDisplayName,
} from './pendingInvites';

function makeInvite(email: string, role?: string): IToken {
  return {
    email,
    metadata: role ? new Map([['role', role]]) : undefined,
  } as IToken;
}

describe('pendingInvites helpers', () => {
  it('derives invite role from metadata', () => {
    expect(getInviteRoleFromMetadata(new Map([['role', SystemRoles.ADMIN]]))).toBe(
      SystemRoles.ADMIN,
    );
    expect(getInviteRoleFromMetadata({ role: SystemRoles.USER })).toBe(SystemRoles.USER);
    expect(getInviteRoleFromMetadata(undefined)).toBe(SystemRoles.USER);
  });

  it('builds a display name from email local part', () => {
    expect(inviteDisplayName('jane.doe@example.com')).toBe('jane.doe');
  });

  it('filters invites for registered emails and duplicate invites', () => {
    const invites = [
      makeInvite('pending@example.com'),
      makeInvite('pending@example.com'),
      makeInvite('active@example.com'),
    ];
    const registered = collectRegisteredEmails([{ email: 'active@example.com' } as IUser]);

    const pending = filterPendingInvitesForRegisteredEmails(invites, registered);
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe('pending@example.com');
  });

  it('filters invites by search term', () => {
    const invites = [makeInvite('alice@example.com'), makeInvite('bob@example.com')];
    expect(filterInvitesBySearch(invites, 'bob')).toHaveLength(1);
    expect(filterInvitesBySearch(invites, 'alice@')).toHaveLength(1);
  });

  it('adjusts pagination to reserve space for pending rows on the first page', () => {
    expect(adjustPaginationForPending(20, 0, 3)).toEqual({ userLimit: 17, userOffset: 0 });
    expect(adjustPaginationForPending(20, 10, 3)).toEqual({ userLimit: 20, userOffset: 7 });
    expect(adjustPaginationForPending(20, 0, 0)).toEqual({ userLimit: 20, userOffset: 0 });
  });
});
