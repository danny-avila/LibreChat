import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  runAsSystem,
  createModels,
  runInAccounts,
  createMethods,
  generateOrganizationTenantId,
} from '@librechat/data-schemas';
import type { AllMethods, IUser } from '@librechat/data-schemas';

/** Collections the organization auth specs write; cleared between tests (indexes kept). */
const TOUCHED_MODELS = ['User', 'Balance', 'Session', 'Organization', 'OrganizationInvite'];

const ORIGINAL_ENV = {
  TENANT_ISOLATION_STRICT: process.env.TENANT_ISOLATION_STRICT,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
};

export interface OrganizationsHarness {
  methods: AllMethods;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
  createAccount: (email: string, fields?: Partial<IUser>) => Promise<IUser>;
  createOrganizationWithMember: (
    account: IUser,
    role?: string,
  ) => Promise<{ tenantId: string; member: IUser }>;
}

/** A real database with strict tenant isolation, as organizations mode runs it. */
export function createOrganizationsHarness(): OrganizationsHarness {
  let mongoServer: MongoMemoryServer;
  const harness = {} as OrganizationsHarness;

  harness.start = async () => {
    /* Set before the first query: the isolation layer caches the flag on first read. */
    process.env.TENANT_ISOLATION_STRICT = 'true';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    createModels(mongoose);
    await Promise.all(TOUCHED_MODELS.map((name) => mongoose.models[name].init()));
    harness.methods = createMethods(mongoose, { isolatePlatformRoleGrants: () => true });
    process.env.JWT_SECRET = 'organizations-spec-access-secret';
    process.env.JWT_REFRESH_SECRET = 'organizations-spec-refresh-secret';
  };

  harness.stop = async () => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await mongoose.disconnect();
    await mongoServer.stop();
  };

  harness.reset = async () => {
    await runAsSystem(async () => {
      await Promise.all(TOUCHED_MODELS.map((name) => mongoose.models[name].deleteMany({})));
    });
  };

  harness.createAccount = async (email, fields = {}) =>
    runInAccounts(
      async () =>
        (await harness.methods.createUser(
          {
            email,
            name: email.split('@')[0],
            username: email.split('@')[0],
            provider: 'local',
            emailVerified: true,
            ...fields,
          },
          undefined,
          true,
          true,
        )) as IUser,
    );

  harness.createOrganizationWithMember = async (account, role = 'ADMIN') => {
    const tenantId = generateOrganizationTenantId();
    await harness.methods.createOrganization({
      tenantId,
      name: `Org ${tenantId.slice(-4)}`,
      createdBy: account._id,
    });
    const { member } = await harness.methods.createMembership({ tenantId, account, role });
    return { tenantId, member };
  };

  return harness;
}

/** Decodes a JWT payload without verifying it. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}
