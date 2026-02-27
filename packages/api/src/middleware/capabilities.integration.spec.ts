import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import {
  createModels,
  createMethods,
  SystemCapabilities,
  CapabilityImplications,
} from '@librechat/data-schemas';
import type { SystemCapability } from '@librechat/data-schemas';
import type { AllMethods } from '@librechat/data-schemas';
import {
  generateCapabilityCheck,
  capabilityStore,
  capabilityContextMiddleware,
} from './capabilities';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

let mongoServer: MongoMemoryServer;
let methods: AllMethods;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  methods = createMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

/**
 * Runs `fn` inside an AsyncLocalStorage context identical to what
 * capabilityContextMiddleware sets up for real Express requests.
 */
function withinRequestContext<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    capabilityContextMiddleware(
      {} as Parameters<typeof capabilityContextMiddleware>[0],
      {} as Parameters<typeof capabilityContextMiddleware>[1],
      () => {
        fn().then(resolve, reject);
      },
    );
  });
}

describe('capabilities integration (real MongoDB)', () => {
  let adminUser: { _id: Types.ObjectId; id: string; role: string };
  let regularUser: { _id: Types.ObjectId; id: string; role: string };

  beforeEach(async () => {
    const User = mongoose.models.User;

    const admin = await User.create({
      name: 'Admin',
      email: 'admin@test.com',
      password: 'password123',
      provider: 'local',
      role: SystemRoles.ADMIN,
    });
    adminUser = { _id: admin._id, id: admin._id.toString(), role: SystemRoles.ADMIN };

    const user = await User.create({
      name: 'Regular',
      email: 'user@test.com',
      password: 'password123',
      provider: 'local',
      role: SystemRoles.USER,
    });
    regularUser = { _id: user._id, id: user._id.toString(), role: SystemRoles.USER };
  });

  describe('end-to-end with real getUserPrincipals + hasCapabilityForPrincipals', () => {
    let hasCapability: ReturnType<typeof generateCapabilityCheck>['hasCapability'];
    let hasConfigCapability: ReturnType<typeof generateCapabilityCheck>['hasConfigCapability'];

    beforeEach(() => {
      ({ hasCapability, hasConfigCapability } = generateCapabilityCheck({
        getUserPrincipals: methods.getUserPrincipals,
        hasCapabilityForPrincipals: methods.hasCapabilityForPrincipals,
      }));
    });

    it('returns true for ADMIN after seedSystemGrants', async () => {
      await methods.seedSystemGrants();

      const result = await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);
      expect(result).toBe(true);
    });

    it('returns false for regular USER (no grants)', async () => {
      await methods.seedSystemGrants();

      const result = await hasCapability(regularUser, SystemCapabilities.ACCESS_ADMIN);
      expect(result).toBe(false);
    });

    it('resolves all seeded capabilities for ADMIN', async () => {
      await methods.seedSystemGrants();

      for (const cap of Object.values(SystemCapabilities)) {
        const result = await hasCapability(adminUser, cap);
        expect(result).toBe(true);
      }
    });

    it('resolves capability implications (MANAGE_X implies READ_X)', async () => {
      await methods.grantCapability({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.USER,
        capability: SystemCapabilities.MANAGE_USERS,
      });

      const hasManage = await hasCapability(regularUser, SystemCapabilities.MANAGE_USERS);
      const hasRead = await hasCapability(regularUser, SystemCapabilities.READ_USERS);

      expect(hasManage).toBe(true);
      expect(hasRead).toBe(true);
    });

    it('implication is one-directional (READ_X does NOT imply MANAGE_X)', async () => {
      await methods.grantCapability({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.USER,
        capability: SystemCapabilities.READ_USERS,
      });

      const hasRead = await hasCapability(regularUser, SystemCapabilities.READ_USERS);
      const hasManage = await hasCapability(regularUser, SystemCapabilities.MANAGE_USERS);

      expect(hasRead).toBe(true);
      expect(hasManage).toBe(false);
    });

    it('grants to a specific user work independently of role', async () => {
      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: regularUser.id,
        capability: SystemCapabilities.READ_AGENTS,
      });

      const result = await hasCapability(regularUser, SystemCapabilities.READ_AGENTS);
      expect(result).toBe(true);
    });

    it('grants via group membership are resolved', async () => {
      const Group = mongoose.models.Group;
      const group = await Group.create({
        name: 'Editors',
        source: 'local',
        memberIds: [regularUser.id],
      });

      await methods.grantCapability({
        principalType: PrincipalType.GROUP,
        principalId: group._id,
        capability: SystemCapabilities.MANAGE_PROMPTS,
      });

      const result = await hasCapability(regularUser, SystemCapabilities.MANAGE_PROMPTS);
      expect(result).toBe(true);
    });

    it('revoked capability is no longer granted', async () => {
      await methods.grantCapability({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.USER,
        capability: SystemCapabilities.READ_USAGE,
      });
      expect(await hasCapability(regularUser, SystemCapabilities.READ_USAGE)).toBe(true);

      await methods.revokeCapability({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.USER,
        capability: SystemCapabilities.READ_USAGE,
      });
      expect(await hasCapability(regularUser, SystemCapabilities.READ_USAGE)).toBe(false);
    });

    it('tenant-scoped grant does not leak to platform-level check', async () => {
      await methods.grantCapability({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.USER,
        capability: SystemCapabilities.ACCESS_ADMIN,
        tenantId: 'tenant-a',
      });

      const platformResult = await hasCapability(regularUser, SystemCapabilities.ACCESS_ADMIN);
      expect(platformResult).toBe(false);

      const tenantResult = await hasCapability(
        { ...regularUser, tenantId: 'tenant-a' },
        SystemCapabilities.ACCESS_ADMIN,
      );
      expect(tenantResult).toBe(true);
    });

    it('hasConfigCapability falls back to section-specific grant', async () => {
      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: regularUser.id,
        capability: 'manage:configs:endpoints' as SystemCapability,
      });

      const hasBroad = await hasConfigCapability(regularUser, 'endpoints');
      expect(hasBroad).toBe(true);

      const hasOtherSection = await hasConfigCapability(regularUser, 'balance');
      expect(hasOtherSection).toBe(false);
    });
  });

  describe('AsyncLocalStorage per-request caching', () => {
    it('caches getUserPrincipals within a single request context', async () => {
      await methods.seedSystemGrants();
      const getUserPrincipals = jest.fn(methods.getUserPrincipals);

      const { hasCapability } = generateCapabilityCheck({
        getUserPrincipals,
        hasCapabilityForPrincipals: methods.hasCapabilityForPrincipals,
      });

      await withinRequestContext(async () => {
        await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);
        await hasCapability(adminUser, SystemCapabilities.MANAGE_USERS);
        await hasCapability(adminUser, SystemCapabilities.READ_CONFIGS);
      });

      expect(getUserPrincipals).toHaveBeenCalledTimes(1);
    });

    it('caches capability results within a single request context', async () => {
      await methods.seedSystemGrants();
      const hasCapabilityForPrincipals = jest.fn(methods.hasCapabilityForPrincipals);

      const { hasCapability } = generateCapabilityCheck({
        getUserPrincipals: methods.getUserPrincipals,
        hasCapabilityForPrincipals,
      });

      await withinRequestContext(async () => {
        const r1 = await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);
        const r2 = await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);
        expect(r1).toBe(true);
        expect(r2).toBe(true);
      });

      const accessAdminCalls = hasCapabilityForPrincipals.mock.calls.filter(
        (args) => args[0].capability === SystemCapabilities.ACCESS_ADMIN,
      );
      expect(accessAdminCalls).toHaveLength(1);
    });

    it('does NOT share cache across separate request contexts', async () => {
      await methods.seedSystemGrants();
      const getUserPrincipals = jest.fn(methods.getUserPrincipals);

      const { hasCapability } = generateCapabilityCheck({
        getUserPrincipals,
        hasCapabilityForPrincipals: methods.hasCapabilityForPrincipals,
      });

      await withinRequestContext(async () => {
        await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);
      });

      await withinRequestContext(async () => {
        await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);
      });

      expect(getUserPrincipals).toHaveBeenCalledTimes(2);
    });

    it('isolates cache between concurrent request contexts', async () => {
      await methods.seedSystemGrants();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: regularUser.id,
        capability: SystemCapabilities.READ_AGENTS,
      });

      const { hasCapability } = generateCapabilityCheck({
        getUserPrincipals: methods.getUserPrincipals,
        hasCapabilityForPrincipals: methods.hasCapabilityForPrincipals,
      });

      const results = await Promise.all([
        withinRequestContext(async () => {
          const admin = await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);
          const agents = await hasCapability(adminUser, SystemCapabilities.READ_AGENTS);
          return { admin, agents, who: 'admin' };
        }),
        withinRequestContext(async () => {
          const admin = await hasCapability(regularUser, SystemCapabilities.ACCESS_ADMIN);
          const agents = await hasCapability(regularUser, SystemCapabilities.READ_AGENTS);
          return { admin, agents, who: 'regular' };
        }),
      ]);

      const adminResult = results.find((r) => r.who === 'admin')!;
      const regularResult = results.find((r) => r.who === 'regular')!;

      expect(adminResult.admin).toBe(true);
      expect(adminResult.agents).toBe(true);
      expect(regularResult.admin).toBe(false);
      expect(regularResult.agents).toBe(true);
    });

    it('falls through to DB when outside request context (no ALS)', async () => {
      await methods.seedSystemGrants();
      const getUserPrincipals = jest.fn(methods.getUserPrincipals);

      const { hasCapability } = generateCapabilityCheck({
        getUserPrincipals,
        hasCapabilityForPrincipals: methods.hasCapabilityForPrincipals,
      });

      await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);
      await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);

      expect(getUserPrincipals).toHaveBeenCalledTimes(2);
    });

    it('caches false results correctly (negative caching)', async () => {
      const hasCapabilityForPrincipals = jest.fn(methods.hasCapabilityForPrincipals);

      const { hasCapability } = generateCapabilityCheck({
        getUserPrincipals: methods.getUserPrincipals,
        hasCapabilityForPrincipals,
      });

      await withinRequestContext(async () => {
        const r1 = await hasCapability(regularUser, SystemCapabilities.MANAGE_USERS);
        const r2 = await hasCapability(regularUser, SystemCapabilities.MANAGE_USERS);
        expect(r1).toBe(false);
        expect(r2).toBe(false);
      });

      const manageUserCalls = hasCapabilityForPrincipals.mock.calls.filter(
        (args) => args[0].capability === SystemCapabilities.MANAGE_USERS,
      );
      expect(manageUserCalls).toHaveLength(1);
    });

    it('uses separate principal cache keys for different users in same context', async () => {
      await methods.seedSystemGrants();
      const getUserPrincipals = jest.fn(methods.getUserPrincipals);

      const { hasCapability } = generateCapabilityCheck({
        getUserPrincipals,
        hasCapabilityForPrincipals: methods.hasCapabilityForPrincipals,
      });

      await withinRequestContext(async () => {
        await hasCapability(adminUser, SystemCapabilities.ACCESS_ADMIN);
        await hasCapability(regularUser, SystemCapabilities.ACCESS_ADMIN);
      });

      expect(getUserPrincipals).toHaveBeenCalledTimes(2);
    });
  });

  describe('requireCapability middleware (real DB, real ALS)', () => {
    it('calls next() for granted capability inside request context', async () => {
      await methods.seedSystemGrants();

      const { requireCapability } = generateCapabilityCheck({
        getUserPrincipals: methods.getUserPrincipals,
        hasCapabilityForPrincipals: methods.hasCapabilityForPrincipals,
      });

      const middleware = requireCapability(SystemCapabilities.ACCESS_ADMIN);
      const next = jest.fn();
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const req = { user: { id: adminUser.id, role: adminUser.role } };
      const res = { status: statusMock };

      await withinRequestContext(async () => {
        await middleware(req as never, res as never, next);
      });

      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('returns 403 for denied capability inside request context', async () => {
      await methods.seedSystemGrants();

      const { requireCapability } = generateCapabilityCheck({
        getUserPrincipals: methods.getUserPrincipals,
        hasCapabilityForPrincipals: methods.hasCapabilityForPrincipals,
      });

      const middleware = requireCapability(SystemCapabilities.MANAGE_USERS);
      const next = jest.fn();
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const req = { user: { id: regularUser.id, role: regularUser.role } };
      const res = { status: statusMock };

      await withinRequestContext(async () => {
        await middleware(req as never, res as never, next);
      });

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });
  });

  describe('CapabilityImplications consistency', () => {
    it('every implication pair resolves correctly through the full stack', async () => {
      const pairs = Object.entries(CapabilityImplications) as [
        SystemCapability,
        SystemCapability[],
      ][];

      const { hasCapability } = generateCapabilityCheck({
        getUserPrincipals: methods.getUserPrincipals,
        hasCapabilityForPrincipals: methods.hasCapabilityForPrincipals,
      });

      for (const [broadCap, impliedCaps] of pairs) {
        await mongoose.connection.dropDatabase();

        await methods.grantCapability({
          principalType: PrincipalType.USER,
          principalId: regularUser.id,
          capability: broadCap,
        });

        for (const impliedCap of impliedCaps) {
          const result = await hasCapability(regularUser, impliedCap);
          expect(result).toBe(true);
        }

        const hasBroad = await hasCapability(regularUser, broadCap);
        expect(hasBroad).toBe(true);
      }
    });
  });
});
