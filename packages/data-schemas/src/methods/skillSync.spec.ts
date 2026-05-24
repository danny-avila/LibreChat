import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '../models';
import { createSkillSyncMethods } from './skillSync';
import type { ISkillSyncCredential } from '~/types/skillSync';
import { encryptV2, decryptV2 } from '~/crypto';

jest.mock('~/crypto', () => ({
  encryptV2: jest.fn(async (value: string) => `encrypted:${value}`),
  decryptV2: jest.fn(async (value: string) => value.replace(/^encrypted:/, '')),
}));

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createSkillSyncMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  methods = createSkillSyncMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.SkillSyncCredential.deleteMany({});
  await mongoose.models.SkillSyncStatus.deleteMany({});
  jest.clearAllMocks();
});

describe('createSkillSyncMethods', () => {
  it('encrypts GitHub tokens and never exposes stored token material in summaries', async () => {
    const summary = await methods.upsertSkillSyncCredential({
      provider: 'github',
      credentialKey: 'github-skills-prod',
      token: 'ghp_secret',
    });
    expect(encryptV2).toHaveBeenCalledWith('ghp_secret');
    expect(summary).toMatchObject({
      provider: 'github',
      credentialKey: 'github-skills-prod',
      credentialPresent: true,
    });
    expect(JSON.stringify(summary)).not.toContain('ghp_secret');
    expect(JSON.stringify(summary)).not.toContain('encrypted:ghp_secret');

    const raw = (await mongoose.models.SkillSyncCredential.findOne({
      provider: 'github',
      credentialKey: 'github-skills-prod',
    })
      .select('+encryptedToken +tokenHash')
      .lean()) as ISkillSyncCredential | null;
    if (!raw) {
      throw new Error('Expected stored skill sync credential');
    }
    expect(raw.encryptedToken).toBe('encrypted:ghp_secret');
    expect(raw.tokenHash).toHaveLength(64);
  });

  it('decrypts GitHub tokens only through the token accessor', async () => {
    await methods.upsertSkillSyncCredential({
      provider: 'github',
      credentialKey: 'github-skills-prod',
      token: 'github_pat_secret',
    });
    const token = await methods.getSkillSyncCredentialToken('github', 'github-skills-prod');
    expect(decryptV2).toHaveBeenCalledWith('encrypted:github_pat_secret');
    expect(token).toBe('github_pat_secret');
  });

  it('uses the status collection as a Mongo-backed sync lock', async () => {
    await expect(
      methods.tryAcquireSkillSyncLock({
        provider: 'github',
        lockOwner: 'worker-a',
        leaseMs: 60_000,
      }),
    ).resolves.toBe(true);
    await expect(
      methods.tryAcquireSkillSyncLock({
        provider: 'github',
        lockOwner: 'worker-b',
        leaseMs: 60_000,
      }),
    ).resolves.toBe(false);
    await methods.releaseSkillSyncLock({ provider: 'github', lockOwner: 'worker-a' });
    await expect(
      methods.tryAcquireSkillSyncLock({
        provider: 'github',
        lockOwner: 'worker-b',
        leaseMs: 60_000,
      }),
    ).resolves.toBe(true);
  });
});
