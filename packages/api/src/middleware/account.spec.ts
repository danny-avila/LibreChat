import { getTenantId, getUserId, ACCOUNTS_TENANT_ID } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { AuthUserRecord } from '~/organizations/types';
import type { ServerRequest } from '~/types/http';
import { withAccountCredentials } from '~/organizations/identity';
import { actAsAccount } from './account';

type Captured = { user?: Record<string, unknown>; tenantId?: string; userId?: string };

function run(req: ServerRequest): Captured {
  let captured: Captured = {};
  actAsAccount(req, {} as Response, () => {
    captured = {
      user: req.user as unknown as Record<string, unknown>,
      tenantId: getTenantId(),
      userId: getUserId(),
    };
  });
  return captured;
}

describe('actAsAccount', () => {
  it('acts on the login account behind a member, in the accounts tenant', () => {
    const account: AuthUserRecord = {
      _id: 'account-1',
      email: 'alice@example.com',
      provider: 'local',
      tenantId: ACCOUNTS_TENANT_ID,
      twoFactorEnabled: true,
    };
    const member: AuthUserRecord = {
      _id: 'member-1',
      email: 'alice@example.com',
      provider: 'organization',
      tenantId: 'org_a',
      identityId: 'account-1',
      role: 'ADMIN',
    };
    const loaded = withAccountCredentials(member, account);
    const req = { headers: {}, user: loaded } as unknown as ServerRequest & {
      organizationMember?: unknown;
    };

    const captured = run(req);

    expect(captured.user).toMatchObject({
      id: 'account-1',
      email: 'alice@example.com',
      provider: 'local',
      twoFactorEnabled: true,
      tenantId: ACCOUNTS_TENANT_ID,
    });
    expect(captured.user).not.toHaveProperty('role');
    expect(captured.tenantId).toBe(ACCOUNTS_TENANT_ID);
    expect(captured.userId).toBe('account-1');
    expect(req.organizationMember).toBe(loaded);
  });

  it('passes any other user through unchanged', () => {
    const user = { id: 'user-1', tenantId: 'tenant-a' };
    const req = { headers: {}, user } as unknown as ServerRequest;
    const next = jest.fn();

    actAsAccount(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBe(user);
  });
});
