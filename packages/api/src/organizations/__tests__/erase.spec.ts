import mongoose from 'mongoose';
import { getTenantId, runAsSystem, runInAccounts } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import { createAccountEraser, createCredentialOwnerLoader } from '../erase';
import { createOrganizationsHarness } from './helpers/harness';
import { createAuthUserLoader } from '../identity';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const harness = createOrganizationsHarness();

beforeAll(() => harness.start());
afterAll(() => harness.stop());
beforeEach(() => harness.reset());

function eraserWith(eraseMember: (member: { id: string; tenantId: string }) => Promise<void>) {
  const { methods } = harness;
  return createAccountEraser({
    listMembershipsForIdentity: methods.listMembershipsForIdentity,
    eraseMember,
    deletePasskeysByUser: methods.deletePasskeysByUser,
    deleteTokens: methods.deleteTokens,
    deleteAllAccountSessions: methods.deleteAllAccountSessions,
    deleteUserById: methods.deleteUserById,
  });
}

const countUsers = () => runAsSystem(async () => mongoose.models.User.countDocuments({}));

describe('createAccountEraser', () => {
  it('erases each membership inside its own tenant, then the account', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    const beta = await harness.createOrganizationWithMember(alice);
    const bob = await harness.createAccount('bob@example.com');
    await harness.createOrganizationWithMember(bob);
    const erasedIn: Array<[string, string | undefined]> = [];

    await eraserWith(async (member) => {
      erasedIn.push([member.id, getTenantId()]);
      await harness.methods.deleteUserById(member.id);
    })(alice._id.toString());

    expect(erasedIn.sort()).toEqual(
      [
        [acme.member._id.toString(), acme.tenantId],
        [beta.member._id.toString(), beta.tenantId],
      ].sort(),
    );
    /* Bob's account and membership remain. */
    await expect(countUsers()).resolves.toBe(2);
    await expect(
      runInAccounts(() => harness.methods.getUserById(alice._id.toString())),
    ).resolves.toBeNull();
  });

  it('keeps the account when a membership cannot be erased, so the deletion can be retried', async () => {
    const alice = await harness.createAccount('alice@example.com');
    await harness.createOrganizationWithMember(alice);
    await harness.createOrganizationWithMember(alice);
    let calls = 0;

    await expect(
      eraserWith(async (member) => {
        calls += 1;
        if (calls === 2) {
          throw new Error('cascade failed');
        }
        await harness.methods.deleteUserById(member.id);
      })(alice._id.toString()),
    ).rejects.toThrow('cascade failed');

    await expect(
      runInAccounts(() => harness.methods.getUserById(alice._id.toString())),
    ).resolves.not.toBeNull();
    await expect(harness.methods.listMembershipsForIdentity(alice._id)).resolves.toHaveLength(1);
  });
});

describe('createCredentialOwnerLoader', () => {
  it('reads the login account for a member and the user itself otherwise', async () => {
    const alice = await harness.createAccount('alice@example.com', { twoFactorEnabled: true });
    const { member } = await harness.createOrganizationWithMember(alice);
    const loadMember = createAuthUserLoader<IUser>({ getUserById: harness.methods.getUserById });
    const loaded = await loadMember(member._id.toString());
    const getUserById = jest.fn(harness.methods.getUserById);
    const loadOwner = createCredentialOwnerLoader({ getUserById });

    /* `requireJwtAuth` hands handlers the loaded object itself, which carries the account. */
    const owner = await loadOwner(
      Object.assign(loaded!, { id: member._id.toString() }),
      '_id twoFactorEnabled',
    );
    expect(owner?._id.toString()).toBe(alice._id.toString());
    expect(owner?.twoFactorEnabled).toBe(true);

    const legacy = await runAsSystem(
      async () =>
        (await harness.methods.createUser(
          { email: 'legacy@example.com', provider: 'local' },
          undefined,
          true,
          true,
        )) as IUser,
    );
    getUserById.mockClear();
    await runAsSystem(() => loadOwner({ id: legacy._id.toString() }, '_id twoFactorEnabled'));
    expect(getUserById).toHaveBeenCalledWith(legacy._id.toString(), '_id twoFactorEnabled');
  });
});
