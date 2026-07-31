import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import type { IUser } from '@librechat/data-schemas';
import type { ExodeIdentity } from './types';
import type { ExodeUserDeps } from './user';
import { upsertExodeUser } from './user';

jest.mock('librechat-data-provider', () => ({ SystemRoles: { USER: 'USER' } }), {
  virtual: true,
});
jest.mock('~/auth/openid', () => ({
  normalizeOpenIdIssuer: (issuer?: string) => issuer?.trim().replace(/\/+$/, '') || undefined,
}));

const identity: ExodeIdentity = {
  subject: 'principal-subject-with-enough-length',
  userId: 9021,
  userUuid: 'f49635f4-e814-4d66-a535-73229b949253',
  name: 'Aslan Orlov',
  schoolId: 17,
  sellerId: 42,
};

const technicalEmail = `${createHash('sha256')
  .update(`exode-main\0${identity.subject}`)
  .digest('hex')}@users.exode.invalid`;

function createUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: new Types.ObjectId(),
    id: new Types.ObjectId().toString(),
    email: technicalEmail,
    emailVerified: true,
    name: 'Aslan Orlov',
    provider: 'exode',
    ...overrides,
  } as IUser;
}

function createDeps(user: IUser | null): ExodeUserDeps {
  return {
    findUser: jest.fn(async () => user),
    createUser: jest.fn(async () => new Types.ObjectId()),
    updateUser: jest.fn(async () => user),
  };
}

describe('upsertExodeUser', () => {
  it('does not write an unchanged existing user', async () => {
    const user = createUser();
    const deps = createDeps(user);

    await expect(upsertExodeUser(identity, 'exode-main/', undefined, deps)).resolves.toBe(user);
    expect(deps.updateUser).not.toHaveBeenCalled();
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('uses the cache-invalidating updateUser dependency for profile changes', async () => {
    const existing = createUser({ name: 'Old Name' });
    const updated = createUser();
    const deps = createDeps(existing);
    deps.updateUser = jest.fn(async () => updated);

    await expect(upsertExodeUser(identity, 'exode-main/', 'tenant-a', deps)).resolves.toBe(updated);
    expect(deps.updateUser).toHaveBeenCalledWith(String(existing._id), {
      name: 'Aslan Orlov',
      avatar: undefined,
      email: technicalEmail,
      emailVerified: true,
      provider: 'exode',
    });
  });

  it('recovers from a concurrent insert using the issuer-bound identity lookup', async () => {
    const created = createUser();
    const deps = createDeps(null);
    deps.findUser = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created);
    deps.createUser = jest.fn(async () => {
      const error = new Error('duplicate') as Error & { code: number };
      error.code = 11000;
      throw error;
    });

    await expect(upsertExodeUser(identity, 'exode-main', 'tenant-a', deps)).resolves.toBe(created);
    expect(deps.findUser).toHaveBeenLastCalledWith({
      openidId: identity.subject,
      openidIssuer: 'exode-main',
      tenantId: 'tenant-a',
    });
  });

  it('reports a stable identity conflict when a duplicate email belongs to another principal', async () => {
    const deps = createDeps(null);
    deps.findUser = jest.fn(async () => null);
    deps.createUser = jest.fn(async () => {
      const error = new Error('duplicate') as Error & { code: number };
      error.code = 11000;
      throw error;
    });

    await expect(upsertExodeUser(identity, 'exode-main', undefined, deps)).rejects.toMatchObject({
      code: 'IDENTITY_CONFLICT',
      status: 409,
    });
  });
});
