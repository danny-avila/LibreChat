import mongoose from 'mongoose';
import {
  runAsSystem,
  runInTenant,
  runInAccounts,
  OrganizationStatus,
} from '@librechat/data-schemas';
import {
  SystemRoles,
  OrganizationErrorCode,
  OrganizationInviteKind,
  organizationsConfigSchema,
  OrganizationMemberStatus,
} from 'librechat-data-provider';
import type { RecordAuditEntryInput } from '@librechat/data-schemas';
import type { TOrganizationsConfig } from 'librechat-data-provider';
import { createOrganizationsHarness } from './helpers/harness';
import { createRegistrationPlanner } from '../registration';
import { createOrganizationService } from '../service';
import { createInviteService } from '../invites';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const harness = createOrganizationsHarness();
const sendEmail = jest.fn(async () => undefined);
const recordAuditEntry = jest.fn<Promise<null>, [RecordAuditEntryInput]>(async () => null);
let config: TOrganizationsConfig;
let emailConfigured = true;

function services() {
  const invites = createInviteService({
    db: harness.methods,
    getConfig: () => config,
    sendEmail,
    isEmailConfigured: () => emailConfigured,
    clientDomain: 'https://chat.example.com/',
    appName: 'SassyChat',
    recordAuditEntry,
    getOrganizationStatus: async (tenantId) =>
      (await harness.methods.findOrganization(tenantId))?.status ?? null,
  });
  const organizations = createOrganizationService({
    db: harness.methods,
    getConfig: () => config,
    redeemPendingInvite: (account, inviteId) => invites.redeemPendingInvite(account, inviteId),
  });
  return { invites, organizations };
}

function tokenOf(url: string): string {
  return decodeURIComponent(url.split('/invite/')[1]);
}

/** Acme, with Alice as its admin. */
async function setup() {
  const { invites, organizations } = services();
  const alice = await harness.createAccount('alice@example.com', { name: 'Alice' });
  const { organization, member } = await organizations.createOrganizationWithAdmin(alice, 'Acme');
  const admin = {
    id: member._id.toString(),
    role: SystemRoles.ADMIN,
    tenantId: organization.tenantId,
    name: 'Alice',
  };
  const inviteAs = (actor: typeof admin, request: Parameters<typeof invites.createInvite>[1]) =>
    runInTenant(organization.tenantId, () => invites.createInvite(actor, request));
  return { invites, organizations, organization, admin, inviteAs };
}

async function created<T>(promise: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const result = await promise;
  if (!result.ok) {
    throw new Error(`Expected success, got ${JSON.stringify(result)}`);
  }
  return result.value;
}

beforeAll(() => harness.start());
afterAll(() => harness.stop());
beforeEach(async () => {
  jest.clearAllMocks();
  emailConfigured = true;
  config = organizationsConfigSchema.parse({ enabled: true });
  await harness.reset();
  await runAsSystem(async () => {
    await Promise.all([
      mongoose.models.Role.deleteMany({}),
      mongoose.models.SystemGrant.deleteMany({}),
      mongoose.models.ResourceLock.deleteMany({}),
    ]);
  });
});

describe('email invites', () => {
  it('sends a link that previews the organization and joins the invited address', async () => {
    const { invites, organization, admin, inviteAs } = await setup();

    const invite = await created(
      inviteAs(admin, { kind: OrganizationInviteKind.EMAIL, email: ' Bob@Example.com ' }),
    );

    expect(invite.url).toMatch(/^https:\/\/chat\.example\.com\/invite\/[a-f0-9]{64}$/);
    expect(invite.emailSent).toBe(true);
    expect(invite.invite).toMatchObject({ email: 'bob@example.com', role: SystemRoles.USER });
    expect(invite.invite).not.toHaveProperty('tokenHash');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'bob@example.com',
        template: 'organizationInvite.handlebars',
        payload: expect.objectContaining({
          organizationName: 'Acme',
          inviterName: 'Alice',
          inviteLink: invite.url,
          expiresIn: '7 days',
        }),
      }),
    );

    await expect(invites.previewInvite(tokenOf(invite.url))).resolves.toEqual({
      ok: true,
      value: {
        organization: { id: organization.tenantId, name: 'Acme' },
        kind: OrganizationInviteKind.EMAIL,
        inviterName: 'Alice',
        email: 'bob@example.com',
      },
    });

    const bob = await harness.createAccount('bob@example.com');
    const accepted = await created(invites.acceptInvite(bob, tokenOf(invite.url)));
    expect(accepted).toMatchObject({ tenantId: organization.tenantId, outcome: 'created' });
    expect(accepted.member).toMatchObject({ role: SystemRoles.USER, email: 'bob@example.com' });

    /* Spent: the link no longer opens. */
    await expect(invites.previewInvite(tokenOf(invite.url))).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.INVITE_EXHAUSTED },
    });
  });

  it('refuses an account whose address the invite does not name', async () => {
    const { invites, admin, inviteAs } = await setup();
    const invite = await created(
      inviteAs(admin, { kind: OrganizationInviteKind.EMAIL, email: 'bob@example.com' }),
    );
    const mallory = await harness.createAccount('mallory@example.com');

    await expect(invites.acceptInvite(mallory, tokenOf(invite.url))).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.INVITE_EMAIL_MISMATCH },
    });
  });

  it('returns the link instead of sending when email is not configured', async () => {
    emailConfigured = false;
    const { admin, inviteAs } = await setup();

    const invite = await created(
      inviteAs(admin, { kind: OrganizationInviteKind.EMAIL, email: 'bob@example.com' }),
    );

    expect(invite.emailSent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('lists the invites addressed to an account and accepts one by id', async () => {
    const { invites, organization, admin, inviteAs } = await setup();
    await created(
      inviteAs(admin, { kind: OrganizationInviteKind.EMAIL, email: 'bob@example.com' }),
    );
    const bob = await harness.createAccount('bob@example.com');

    const pending = await invites.listPendingInvites(bob);

    expect(pending).toEqual([
      expect.objectContaining({
        organization: { id: organization.tenantId, name: 'Acme' },
        inviterName: 'Alice',
        role: SystemRoles.USER,
      }),
    ]);
    const mallory = await harness.createAccount('mallory@example.com');
    await expect(invites.acceptPendingInvite(mallory, pending[0].id)).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.INVITE_NOT_FOUND },
    });
    await expect(invites.acceptPendingInvite(bob, pending[0].id)).resolves.toMatchObject({
      ok: true,
      value: { tenantId: organization.tenantId },
    });
    await expect(invites.listPendingInvites(bob)).resolves.toEqual([]);
  });
});

describe('link invites', () => {
  it('admits distinct accounts up to the use limit', async () => {
    const { invites, admin, inviteAs } = await setup();
    const invite = await created(
      inviteAs(admin, { kind: OrganizationInviteKind.LINK, maxUses: 2 }),
    );
    const token = tokenOf(invite.url);
    const [bob, carol, dave] = await Promise.all(
      ['bob', 'carol', 'dave'].map((name) => harness.createAccount(`${name}@example.com`)),
    );

    await expect(invites.acceptInvite(bob, token)).resolves.toMatchObject({ ok: true });
    /* A repeat by an existing member spends nothing. */
    await expect(invites.acceptInvite(bob, token)).resolves.toMatchObject({
      ok: true,
      value: { outcome: 'existing' },
    });
    await expect(invites.acceptInvite(carol, token)).resolves.toMatchObject({ ok: true });
    await expect(invites.acceptInvite(dave, token)).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.INVITE_EXHAUSTED },
    });
  });

  it('records invites sent and revoked, and members who join, on the organization chain', async () => {
    const { invites, organization, admin, inviteAs } = await setup();
    const link = await created(inviteAs(admin, { kind: OrganizationInviteKind.LINK }));
    const bob = await harness.createAccount('bob@example.com', { name: 'Bob' });
    const joined = await created(invites.acceptInvite(bob, tokenOf(link.url)));
    await invites.acceptInvite(bob, tokenOf(link.url));
    await runInTenant(organization.tenantId, () => invites.revokeInvite(admin, link.invite.id));

    const entries = recordAuditEntry.mock.calls.map(([entry]) => entry);
    expect(entries.map((entry) => entry.action)).toEqual([
      'organization.invite_created',
      'organization.member_joined',
      'organization.invite_revoked',
    ]);
    expect(entries.every((entry) => entry.tenantId === organization.tenantId)).toBe(true);
    expect(entries[0]).toMatchObject({
      actor: { type: 'user', id: admin.id, name: 'Alice' },
      target: { type: 'invite', id: link.invite.id },
      metadata: { kind: OrganizationInviteKind.LINK, role: SystemRoles.USER },
    });
    expect(entries[1]).toMatchObject({
      actor: { id: joined.member._id.toString(), name: 'Bob' },
      target: { type: 'user', id: joined.member._id.toString() },
      metadata: { inviteId: link.invite.id, rejoined: false },
    });
    /* The invite token never reaches the audit log. */
    expect(JSON.stringify(entries)).not.toContain(tokenOf(link.url));
  });

  it('keeps working when the audit log cannot be written', async () => {
    recordAuditEntry.mockRejectedValueOnce(new Error('audit store down'));
    const { admin, inviteAs } = await setup();

    await expect(inviteAs(admin, { kind: OrganizationInviteKind.LINK })).resolves.toMatchObject({
      ok: true,
    });
  });

  it('lets nobody join a suspended organization', async () => {
    const { invites, organization, admin, inviteAs } = await setup();
    const link = await created(inviteAs(admin, { kind: OrganizationInviteKind.LINK }));
    const bob = await harness.createAccount('bob@example.com');
    await harness.methods.setOrganizationStatus(
      organization.tenantId,
      OrganizationStatus.SUSPENDED,
    );

    const refused = { ok: false, error: { code: OrganizationErrorCode.ORGANIZATION_SUSPENDED } };
    await expect(invites.previewInvite(tokenOf(link.url))).resolves.toMatchObject(refused);
    await expect(invites.acceptInvite(bob, tokenOf(link.url))).resolves.toMatchObject(refused);
    await expect(
      harness.methods.findMembership(bob._id, organization.tenantId),
    ).resolves.toBeNull();
  });

  it('can be revoked, expires, and can be disabled deployment-wide', async () => {
    const { invites, organization, admin, inviteAs } = await setup();
    const invite = await created(inviteAs(admin, { kind: OrganizationInviteKind.LINK }));
    const bob = await harness.createAccount('bob@example.com');

    await runInTenant(organization.tenantId, () => invites.revokeInvite(admin, invite.invite.id));
    await expect(invites.acceptInvite(bob, tokenOf(invite.url))).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.INVITE_NOT_FOUND },
    });

    config = organizationsConfigSchema.parse({ enabled: true, invites: { linkExpiryHours: 1 } });
    const shortLived = await created(inviteAs(admin, { kind: OrganizationInviteKind.LINK }));
    await runAsSystem(async () => {
      await mongoose.models.OrganizationInvite.updateOne(
        { _id: shortLived.invite.id },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
    });
    await expect(invites.acceptInvite(bob, tokenOf(shortLived.url))).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.INVITE_EXPIRED },
    });

    config = organizationsConfigSchema.parse({
      enabled: true,
      invites: { allowLinkInvites: false },
    });
    await expect(inviteAs(admin, { kind: OrganizationInviteKind.LINK })).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.LINK_INVITES_DISABLED },
    });
  });

  it('requires a verified email to accept', async () => {
    const { invites, admin, inviteAs } = await setup();
    const invite = await created(inviteAs(admin, { kind: OrganizationInviteKind.LINK }));
    const carol = await harness.createAccount('carol@example.com', { emailVerified: false });

    await expect(invites.acceptInvite(carol, tokenOf(invite.url))).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.EMAIL_NOT_VERIFIED },
    });
  });
});

describe('invite management', () => {
  it('keeps admin-only roles to admins and checks the role exists', async () => {
    const { admin, inviteAs } = await setup();
    const member = { ...admin, role: SystemRoles.USER };

    await expect(
      inviteAs(member, { kind: OrganizationInviteKind.LINK, role: SystemRoles.ADMIN }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.ROLE_NOT_ASSIGNABLE },
    });
    await expect(
      inviteAs(admin, { kind: OrganizationInviteKind.LINK, role: 'NOPE' }),
    ).resolves.toMatchObject({ ok: false, error: { code: OrganizationErrorCode.ROLE_NOT_FOUND } });
    await expect(
      inviteAs(admin, { kind: OrganizationInviteKind.EMAIL, email: 'not-an-email' }),
    ).resolves.toMatchObject({ ok: false, error: { code: OrganizationErrorCode.INVITE_INVALID } });
  });

  it('resends with a fresh link that voids the previous one', async () => {
    const { invites, organization, admin, inviteAs } = await setup();
    const invite = await created(
      inviteAs(admin, { kind: OrganizationInviteKind.EMAIL, email: 'bob@example.com' }),
    );

    const resent = await created(
      runInTenant(organization.tenantId, () => invites.resendInvite(admin, invite.invite.id)),
    );

    expect(resent.url).not.toBe(invite.url);
    await expect(invites.previewInvite(tokenOf(invite.url))).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.INVITE_NOT_FOUND },
    });
    await expect(invites.previewInvite(tokenOf(resent.url))).resolves.toMatchObject({ ok: true });
  });

  it('lists only the current organization invites, with their inviter', async () => {
    const { invites, organizations, organization, admin, inviteAs } = await setup();
    await created(inviteAs(admin, { kind: OrganizationInviteKind.LINK }));
    const carol = await harness.createAccount('carol@example.com');
    const beta = await organizations.createOrganizationWithAdmin(carol, 'Beta');
    await runInTenant(beta.organization.tenantId, () =>
      invites.createInvite(
        {
          id: beta.member._id.toString(),
          role: SystemRoles.ADMIN,
          tenantId: beta.organization.tenantId,
        },
        { kind: OrganizationInviteKind.LINK },
      ),
    );

    const listed = await runInTenant(organization.tenantId, () => invites.listInvites());

    expect(listed).toEqual([
      expect.objectContaining({
        kind: OrganizationInviteKind.LINK,
        invitedBy: { id: admin.id, name: 'Alice' },
      }),
    ]);
  });

  it('reactivates a deactivated member who accepts a new invite, keeping the record', async () => {
    const { invites, organizations, organization, admin, inviteAs } = await setup();
    const bob = await harness.createAccount('bob@example.com');
    const first = await created(inviteAs(admin, { kind: OrganizationInviteKind.LINK }));
    const joined = await created(invites.acceptInvite(bob, tokenOf(first.url)));
    await runInTenant(organization.tenantId, () =>
      organizations.deactivateMember(admin, joined.member._id.toString()),
    );

    const again = await created(invites.acceptInvite(bob, tokenOf(first.url)));

    expect(again.outcome).toBe('reactivated');
    expect(again.member._id.toString()).toBe(joined.member._id.toString());
    expect(again.member.status).toBe(OrganizationMemberStatus.ACTIVE);
  });
});

describe('registration', () => {
  const planner = (invites: ReturnType<typeof services>['invites']) =>
    createRegistrationPlanner({
      invites,
      countAccounts: () => runInAccounts(() => harness.methods.countUsers()),
      claimPlatformOperator: harness.methods.claimPlatformOperator,
    });

  it('requires an organization name without an invite', async () => {
    const plan = planner(services().invites);

    await expect(plan({}, 'new@example.com')).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.ORG_NAME_INVALID },
    });
    await expect(
      plan({ organization: { name: ' Acme ' } }, 'new@example.com'),
    ).resolves.toMatchObject({
      ok: true,
      value: { accountFields: { pendingOrganization: { name: 'Acme' } } },
    });
  });

  it('makes the first account ever registered the platform operator, and no later one', async () => {
    const plan = planner(services().invites);
    const first = await created(plan({ organization: { name: 'Acme' } }, 'first@example.com'));
    const owner = await harness.createAccount('first@example.com');
    await first.onAccountCreated?.(owner);

    const second = await created(plan({ organization: { name: 'Beta' } }, 'next@example.com'));
    const next = await harness.createAccount('next@example.com');
    await second.onAccountCreated?.(next);

    await expect(harness.methods.findPlatformOperator()).resolves.toMatchObject({
      _id: owner._id,
    });
  });

  it('verifies and joins at once with an email invite, after verification with a link', async () => {
    const { invites, organization, admin, inviteAs } = await setup();
    const plan = planner(invites);
    const emailInvite = await created(
      inviteAs(admin, { kind: OrganizationInviteKind.EMAIL, email: 'bob@example.com' }),
    );
    const linkInvite = await created(inviteAs(admin, { kind: OrganizationInviteKind.LINK }));

    await expect(
      plan({ organizationInvite: tokenOf(emailInvite.url) }, 'mallory@example.com'),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.INVITE_EMAIL_MISMATCH },
    });

    const byEmail = await created(
      plan({ organizationInvite: tokenOf(emailInvite.url) }, 'bob@example.com'),
    );
    expect(byEmail.accountFields).toEqual({ emailVerified: true });
    const bob = await harness.createAccount('bob@example.com');
    await byEmail.onAccountCreated?.(bob);
    await expect(
      harness.methods.findMembership(bob._id, organization.tenantId),
    ).resolves.not.toBeNull();

    const byLink = await created(plan({ organizationInvite: tokenOf(linkInvite.url) }, 'c@x.io'));
    expect(byLink.accountFields).toEqual({ pendingInviteId: linkInvite.invite.id });
    /* A link invite is redeemed after verification; at creation only the operator check runs. */
    await byLink.onAccountCreated?.(await harness.createAccount('c@x.io'));
    await expect(harness.methods.findPlatformOperator()).resolves.toBeNull();
  });
});
