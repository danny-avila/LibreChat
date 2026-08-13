import type { IUser } from '@librechat/data-schemas';
import { serializeUserForResponse } from './user';

const createdAt = new Date('2026-08-13T12:00:00.000Z');

const internalUser = {
  _id: 'user-id',
  id: 'user-id',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  avatar: '/avatars/user-id.png',
  provider: 'local',
  role: 'USER',
  plugins: ['web_search'],
  twoFactorEnabled: true,
  termsAccepted: true,
  personalization: { memories: false },
  skillStates: { skill_one: true },
  createdAt,
  tenantId: 'tenant-id',
  clerkId: 'user_clerk',
  clerkDeletedAt: new Date('2026-08-13T13:00:00.000Z'),
  password: 'password-hash',
  refreshToken: [{ refreshToken: 'refresh-secret' }],
  resetToken: 'reset-secret',
  totpSecret: 'totp-secret',
  backupCodes: [{ codeHash: 'backup-secret' }],
  pendingTotpSecret: 'pending-totp-secret',
  pendingBackupCodes: [{ codeHash: 'pending-backup-secret' }],
  federatedTokens: { access_token: 'access-secret' },
  openidTokens: { refresh_token: 'openid-secret' },
  safeLookingRuntimeField: 'must-not-leak',
};

const expectedPublicUser = {
  _id: 'user-id',
  id: 'user-id',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  avatar: '/avatars/user-id.png',
  provider: 'local',
  role: 'USER',
  plugins: ['web_search'],
  twoFactorEnabled: true,
  termsAccepted: true,
  personalization: { memories: false },
  skillStates: { skill_one: true },
  createdAt,
  tenantId: 'tenant-id',
};

describe('serializeUserForResponse', () => {
  it('allowlists public fields from a lean user and excludes Clerk state and auth secrets', () => {
    const serialized = serializeUserForResponse(internalUser as unknown as IUser);

    expect(serialized).toEqual(expectedPublicUser);
  });

  it('serializes a Mongoose-style document through the same allowlist', () => {
    const document = {
      toObject: () => internalUser,
    } as unknown as IUser;

    expect(serializeUserForResponse(document)).toEqual(expectedPublicUser);
  });
});
