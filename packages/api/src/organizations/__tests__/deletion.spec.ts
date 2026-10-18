import mongoose, { Types } from 'mongoose';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import {
  runAsSystem,
  runInTenant,
  OrganizationStatus,
  SystemCapabilities,
} from '@librechat/data-schemas';
import type { RecordAuditEntryInput } from '@librechat/data-schemas';
import type { ErasableMember } from '../erase';
import { createOrganizationsHarness } from './helpers/harness';
import { createOrganizationDeleter } from '../deletion';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const harness = createOrganizationsHarness();
const recordAuditEntry = jest.fn<Promise<null>, [RecordAuditEntryInput]>(async () => null);
const forgetOrganization = jest.fn();

/** Stands in for the account erasure cascade: removes the member record it was given. */
const eraseByDeleting = jest.fn(async (member: ErasableMember) => {
  await runInTenant(member.tenantId, () => harness.methods.deleteUserById(member.id));
});

function deleter(eraseMember: (member: ErasableMember) => Promise<void> = eraseByDeleting) {
  return createOrganizationDeleter({
    db: harness.methods,
    eraseMember,
    forgetOrganization,
    recordAuditEntry,
  });
}

/** Every stored record naming `tenantId`, in any collection but the append-only audit log. */
async function recordsIn(tenantId: string): Promise<Record<string, number>> {
  const db = mongoose.connection.db!;
  const found: Record<string, number> = {};
  for (const { name } of await db.listCollections().toArray()) {
    if (name === 'auditlogs') {
      continue;
    }
    const count = await db.collection(name).countDocuments({ tenantId });
    if (count > 0) {
      found[name] = count;
    }
  }
  return found;
}

beforeAll(() => harness.start());
afterAll(() => harness.stop());
beforeEach(async () => {
  jest.clearAllMocks();
  await harness.reset();
});

/** Acme, full of data and about to be deleted, and Beta, which must survive untouched. */
async function organizations() {
  const owner = await harness.createAccount('owner@example.com');
  const member = await harness.createAccount('member@example.com');
  const acme = await harness.createOrganizationWithMember(owner, SystemRoles.ADMIN);
  await harness.methods.createMembership({
    tenantId: acme.tenantId,
    account: member,
    role: SystemRoles.USER,
  });
  const beta = await harness.createOrganizationWithMember(member, SystemRoles.ADMIN);

  for (const { tenantId, member: inOrg } of [acme, beta]) {
    await runInTenant(tenantId, async () => {
      await mongoose.models.Conversation.create({
        conversationId: new Types.ObjectId().toString(),
        user: inOrg._id.toString(),
        endpoint: 'openAI',
        title: `In ${tenantId}`,
      });
      await harness.methods.getRoleByName(SystemRoles.ADMIN);
      await harness.methods.createSession(inOrg._id.toString());
    });
    await harness.methods.grantCapability({
      principalType: PrincipalType.ROLE,
      principalId: SystemRoles.ADMIN,
      capability: SystemCapabilities.MANAGE_USERS,
      tenantId,
      grantedBy: new Types.ObjectId(),
    });
  }
  await harness.methods.setOrganizationStatus(acme.tenantId, OrganizationStatus.DELETING);
  return { acme, beta };
}

describe('createOrganizationDeleter', () => {
  it('erases every record of the organization and leaves every other one untouched', async () => {
    const { acme, beta } = await organizations();
    const betaBefore = await recordsIn(beta.tenantId);
    expect(Object.keys(await recordsIn(acme.tenantId)).length).toBeGreaterThan(3);

    await deleter().deleteOrganization(acme.tenantId, { id: 'operator-1', name: 'Olive' });

    expect(eraseByDeleting).toHaveBeenCalledTimes(2);
    await expect(recordsIn(acme.tenantId)).resolves.toEqual({});
    await expect(recordsIn(beta.tenantId)).resolves.toEqual(betaBefore);
    await expect(harness.methods.findOrganization(acme.tenantId)).resolves.toBeNull();
    expect(forgetOrganization).toHaveBeenCalledWith(acme.tenantId);
    expect(recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'organization.deleted',
        tenantId: undefined,
        actor: expect.objectContaining({ id: 'operator-1' }),
        metadata: expect.objectContaining({ organization: acme.tenantId }),
      }),
    );
  });

  it('stays deleting when a member cannot be erased, and finishes on the next run', async () => {
    const { acme } = await organizations();
    const failing = jest.fn(async () => {
      throw new Error('storage unavailable');
    });

    await expect(deleter(failing).deleteOrganization(acme.tenantId)).rejects.toThrow(
      'could not be erased',
    );
    await expect(harness.methods.findOrganization(acme.tenantId)).resolves.toMatchObject({
      status: OrganizationStatus.DELETING,
    });

    await deleter().resumePendingDeletions();

    await expect(recordsIn(acme.tenantId)).resolves.toEqual({});
  });

  it('never deletes an organization that was not marked for deletion', async () => {
    const { beta } = await organizations();
    const before = await recordsIn(beta.tenantId);

    await deleter().deleteOrganization(beta.tenantId);

    expect(eraseByDeleting).not.toHaveBeenCalled();
    await expect(recordsIn(beta.tenantId)).resolves.toEqual(before);
  });

  it('lets only one run work on an organization at a time', async () => {
    const { acme } = await organizations();
    await runAsSystem(() =>
      harness.methods.acquireResourceLock({
        key: `organization-delete:${acme.tenantId}`,
        ownerId: 'another-run',
        ttlMs: 60_000,
      }),
    );

    await deleter().deleteOrganization(acme.tenantId);

    expect(eraseByDeleting).not.toHaveBeenCalled();
    await expect(harness.methods.findOrganization(acme.tenantId)).resolves.not.toBeNull();
  });
});
