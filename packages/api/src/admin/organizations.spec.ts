import mongoose from 'mongoose';
import { runInTenant, OrganizationStatus } from '@librechat/data-schemas';
import { AdminErrorCode, OrganizationErrorCode, SystemRoles } from 'librechat-data-provider';
import type { IUser, RecordAuditEntryInput } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { createOrganizationsHarness } from '~/organizations/__tests__/helpers/harness';
import { createAdminOrganizationsHandlers } from './organizations';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const harness = createOrganizationsHarness();
const evictOrganizationStatus = jest.fn();
const startOrganizationDeletion = jest.fn();
const recordAuditEntry = jest.fn<Promise<null>, [RecordAuditEntryInput]>(async () => null);

function handlers() {
  return createAdminOrganizationsHandlers({
    db: harness.methods,
    evictOrganizationStatus,
    startOrganizationDeletion,
    recordAuditEntry,
  });
}

function createResponse() {
  const res = { statusCode: 200, body: undefined as unknown } as Response & {
    body: Record<string, unknown>;
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: Record<string, unknown>) => {
    res.body = body;
    return res;
  });
  return res;
}

let operator: IUser;

function request(parts: { params?: object; query?: object; body?: object } = {}) {
  return {
    user: { id: operator._id.toString(), _id: operator._id, name: 'Olive' },
    params: parts.params ?? {},
    query: parts.query ?? {},
    body: parts.body,
  } as unknown as ServerRequest;
}

async function call(
  handler: keyof ReturnType<typeof handlers>,
  parts?: Parameters<typeof request>[0],
) {
  const res = createResponse();
  await handlers()[handler](request(parts), res);
  return res;
}

beforeAll(() => harness.start());
afterAll(() => harness.stop());
beforeEach(async () => {
  jest.clearAllMocks();
  await harness.reset();
  operator = await harness.createAccount('operator@example.com', { name: 'Olive' });
  await harness.methods.claimPlatformOperator(operator._id);
});

/** Acme (two visible members) and Beta, which the operator has also visited. */
async function twoOrganizations() {
  const owner = await harness.createAccount('owner@example.com', { name: 'Owen' });
  const member = await harness.createAccount('member@example.com');
  const acme = await harness.createOrganizationWithMember(owner, SystemRoles.ADMIN);
  await harness.methods.createMembership({
    tenantId: acme.tenantId,
    account: member,
    role: SystemRoles.USER,
  });
  const beta = await harness.createOrganizationWithMember(member, SystemRoles.ADMIN);
  await harness.methods.ensureOperatorMembership({ tenantId: acme.tenantId, account: operator });
  return { owner, member, acme, beta };
}

describe('listing organizations', () => {
  it('lists newest first with counts that never include the operator, a page at a time', async () => {
    const { acme, beta } = await twoOrganizations();

    const first = await call('listOrganizations', { query: { limit: '1' } });
    expect(first.body.organizations).toEqual([
      expect.objectContaining({ id: beta.tenantId, memberCount: 1, adminCount: 1 }),
    ]);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await call('listOrganizations', {
      query: { limit: '1', after: first.body.nextCursor },
    });
    expect(second.body.organizations).toEqual([
      expect.objectContaining({
        id: acme.tenantId,
        status: OrganizationStatus.ACTIVE,
        memberCount: 2,
        adminCount: 1,
        createdBy: expect.objectContaining({ email: 'owner@example.com' }),
      }),
    ]);
    expect(second.body.nextCursor).toBeUndefined();
  });

  it('searches by name and filters by status', async () => {
    const { acme } = await twoOrganizations();
    await harness.methods.renameOrganization(acme.tenantId, 'Acme Rockets');
    await harness.methods.setOrganizationStatus(acme.tenantId, OrganizationStatus.SUSPENDED);

    const byName = await call('listOrganizations', { query: { search: 'rocket' } });
    expect((byName.body.organizations as Array<{ id: string }>).map((o) => o.id)).toEqual([
      acme.tenantId,
    ]);
    const suspended = await call('listOrganizations', { query: { status: 'suspended' } });
    expect(suspended.body.organizations).toHaveLength(1);
  });

  it('describes one organization with its admins and pending invites', async () => {
    const { acme } = await twoOrganizations();

    const res = await call('getOrganization', { params: { tenantId: acme.tenantId } });

    expect(res.body.organization).toMatchObject({
      id: acme.tenantId,
      admins: [expect.objectContaining({ email: 'owner@example.com' })],
      pendingInviteCount: 0,
    });
    const missing = await call('getOrganization', { params: { tenantId: 'org_missing' } });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toMatchObject({ error_code: AdminErrorCode.ORGANIZATION_NOT_FOUND });
  });
});

describe('changing organizations', () => {
  it('renames with a validated name, and audits it', async () => {
    const { acme } = await twoOrganizations();

    const invalid = await call('renameOrganization', {
      params: { tenantId: acme.tenantId },
      body: { name: 'x' },
    });
    expect(invalid.body).toEqual({ code: OrganizationErrorCode.ORG_NAME_INVALID });

    const renamed = await call('renameOrganization', {
      params: { tenantId: acme.tenantId },
      body: { name: 'Acme Corp' },
    });
    expect(renamed.body.organization).toMatchObject({ name: 'Acme Corp' });
    expect(recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'organization.renamed',
        actor: expect.objectContaining({ id: operator._id.toString() }),
      }),
    );
  });

  it('suspends an organization: everyone signed out, the status forgotten, then restored', async () => {
    const { acme, owner } = await twoOrganizations();
    const ownerMember = await harness.methods.findMembership(owner._id, acme.tenantId);
    await runInTenant(acme.tenantId, () =>
      harness.methods.createSession(ownerMember!._id.toString()),
    );

    const suspended = await call('suspendOrganization', { params: { tenantId: acme.tenantId } });

    expect(suspended.body.organization).toMatchObject({ status: OrganizationStatus.SUSPENDED });
    await expect(harness.methods.findOrganization(acme.tenantId)).resolves.toMatchObject({
      status: OrganizationStatus.SUSPENDED,
    });
    await expect(
      runInTenant(acme.tenantId, async () => mongoose.models.Session.countDocuments({})),
    ).resolves.toBe(0);
    expect(evictOrganizationStatus).toHaveBeenCalledWith(acme.tenantId);

    const reactivated = await call('reactivateOrganization', {
      params: { tenantId: acme.tenantId },
    });
    expect(reactivated.body.organization).toMatchObject({ status: OrganizationStatus.ACTIVE });
    expect(recordAuditEntry.mock.calls.map(([entry]) => entry.action)).toEqual([
      'organization.suspended',
      'organization.reactivated',
    ]);
  });

  it('deletes only after the exact name is typed, then hands it to the deletion job', async () => {
    const { acme } = await twoOrganizations();
    const organization = await harness.methods.findOrganization(acme.tenantId);

    const mismatch = await call('deleteOrganization', {
      params: { tenantId: acme.tenantId },
      body: { confirmName: 'acme' },
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.body).toMatchObject({ error_code: AdminErrorCode.CONFIRMATION_MISMATCH });
    expect(startOrganizationDeletion).not.toHaveBeenCalled();

    const accepted = await call('deleteOrganization', {
      params: { tenantId: acme.tenantId },
      body: { confirmName: organization!.name },
    });
    expect(accepted.statusCode).toBe(202);
    await expect(harness.methods.findOrganization(acme.tenantId)).resolves.toMatchObject({
      status: OrganizationStatus.DELETING,
    });
    expect(startOrganizationDeletion).toHaveBeenCalledWith(
      acme.tenantId,
      expect.objectContaining({ id: operator._id.toString() }),
    );

    /* A deleting organization can no longer be suspended or reactivated. */
    const late = await call('suspendOrganization', { params: { tenantId: acme.tenantId } });
    expect(late.statusCode).toBe(409);
  });
});

describe('accounts', () => {
  it('lists login accounts and shows the memberships each was given', async () => {
    const { member, acme, beta } = await twoOrganizations();

    const list = await call('listAccounts', { query: { search: 'operator' } });
    expect(list.body.accounts).toEqual([
      expect.objectContaining({ email: 'operator@example.com', isPlatformOperator: true }),
    ]);

    const memberDetail = await call('getAccount', {
      params: { accountId: member._id.toString() },
    });
    const organizations = (
      memberDetail.body.account as { memberships: Array<{ organization: { id: string } }> }
    ).memberships.map((membership) => membership.organization.id);
    expect(organizations.sort()).toEqual([acme.tenantId, beta.tenantId].sort());

    /* The operator's visit to Acme is not a membership it was given. */
    const operatorDetail = await call('getAccount', {
      params: { accountId: operator._id.toString() },
    });
    expect(operatorDetail.body.account).toMatchObject({ memberships: [] });

    const missing = await call('getAccount', { params: { accountId: 'nope' } });
    expect(missing.statusCode).toBe(404);
  });
});
