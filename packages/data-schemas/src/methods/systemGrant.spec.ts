import mongoose, { Types } from 'mongoose';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import type { SystemCapability } from '~/systemCapabilities';
import { SystemCapabilities, CapabilityImplications } from '~/systemCapabilities';
import { createSystemGrantMethods } from './systemGrant';
import systemGrantSchema from '~/schema/systemGrant';
import logger from '~/config/winston';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let SystemGrant: mongoose.Model<t.ISystemGrant>;
let methods: ReturnType<typeof createSystemGrantMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  SystemGrant =
    mongoose.models.SystemGrant || mongoose.model<t.ISystemGrant>('SystemGrant', systemGrantSchema);
  methods = createSystemGrantMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await SystemGrant.deleteMany({});
});

describe('systemGrant methods', () => {
  describe('seedSystemGrants', () => {
    it('seeds every SystemCapabilities value for the ADMIN role', async () => {
      await methods.seedSystemGrants();

      const grants = await SystemGrant.find({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.ADMIN,
      }).lean();

      const expected = Object.values(SystemCapabilities).sort();
      const actual = grants.map((g) => g.capability).sort();
      expect(actual).toEqual(expected);
    });

    it('is idempotent — duplicate calls produce no extra documents', async () => {
      await methods.seedSystemGrants();
      await methods.seedSystemGrants();
      await methods.seedSystemGrants();

      const count = await SystemGrant.countDocuments({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.ADMIN,
      });
      expect(count).toBe(Object.values(SystemCapabilities).length);
    });

    it('seeds platform-level grants (no tenantId field)', async () => {
      await methods.seedSystemGrants();

      const withTenant = await SystemGrant.countDocuments({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.ADMIN,
        tenantId: { $exists: true },
      });
      expect(withTenant).toBe(0);
    });

    it('does not throw when called (try-catch protects startup)', async () => {
      await expect(methods.seedSystemGrants()).resolves.not.toThrow();
    });

    it('logs error and swallows exception when bulkWrite fails', async () => {
      jest.spyOn(SystemGrant, 'bulkWrite').mockRejectedValueOnce(new Error('disk full'));

      await expect(methods.seedSystemGrants()).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        '[seedSystemGrants] Failed to seed capabilities — will retry on next restart',
        expect.any(Error),
      );
    });
  });

  describe('grantCapability', () => {
    it('creates a grant and returns the document', async () => {
      const userId = new Types.ObjectId();
      const doc = await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_USERS,
      });

      expect(doc).toBeTruthy();
      expect(doc!.principalType).toBe(PrincipalType.USER);
      expect(doc!.capability).toBe(SystemCapabilities.READ_USERS);
      expect(doc!.grantedAt).toBeInstanceOf(Date);
    });

    it('is idempotent — second call does not create a duplicate', async () => {
      const userId = new Types.ObjectId();
      const params = {
        principalType: PrincipalType.USER as const,
        principalId: userId,
        capability: SystemCapabilities.READ_USERS as SystemCapability,
      };

      await methods.grantCapability(params);
      await methods.grantCapability(params);

      const count = await SystemGrant.countDocuments({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_USERS,
      });
      expect(count).toBe(1);
    });

    it('stores grantedBy when provided', async () => {
      const userId = new Types.ObjectId();
      const grantedBy = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_CONFIGS,
        grantedBy,
      });

      const grant = await SystemGrant.findOne({
        principalType: PrincipalType.USER,
        principalId: userId,
      }).lean();

      expect(grant!.grantedBy!.toString()).toBe(grantedBy.toString());
    });

    it('stores tenant-scoped grants with tenantId field present', async () => {
      const userId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_USAGE,
        tenantId: 'tenant-abc',
      });

      const grant = await SystemGrant.findOne({
        principalType: PrincipalType.USER,
        principalId: userId,
        tenantId: 'tenant-abc',
      }).lean();

      expect(grant).toBeTruthy();
      expect(grant!.tenantId).toBe('tenant-abc');
    });

    it('normalizes string userId to ObjectId for USER principal', async () => {
      const userId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId.toString(),
        capability: SystemCapabilities.READ_USERS,
      });

      const grant = await SystemGrant.findOne({ capability: SystemCapabilities.READ_USERS }).lean();
      expect(grant!.principalId.toString()).toBe(userId.toString());
      expect(grant!.principalId).toBeInstanceOf(Types.ObjectId);
    });

    it('normalizes string groupId to ObjectId for GROUP principal', async () => {
      const groupId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.GROUP,
        principalId: groupId.toString(),
        capability: SystemCapabilities.READ_AGENTS,
      });

      const grant = await SystemGrant.findOne({
        capability: SystemCapabilities.READ_AGENTS,
      }).lean();
      expect(grant!.principalId).toBeInstanceOf(Types.ObjectId);
    });

    it('keeps ROLE principalId as a string (no ObjectId cast)', async () => {
      await methods.grantCapability({
        principalType: PrincipalType.ROLE,
        principalId: 'CUSTOM_ROLE',
        capability: SystemCapabilities.READ_CONFIGS,
      });

      const grant = await SystemGrant.findOne({
        principalType: PrincipalType.ROLE,
        principalId: 'CUSTOM_ROLE',
      }).lean();

      expect(grant).toBeTruthy();
      expect(typeof grant!.principalId).toBe('string');
    });

    it('allows same capability for same principal in different tenants', async () => {
      const userId = new Types.ObjectId();
      const params = {
        principalType: PrincipalType.USER as const,
        principalId: userId,
        capability: SystemCapabilities.ACCESS_ADMIN as SystemCapability,
      };

      await methods.grantCapability({ ...params, tenantId: 'tenant-1' });
      await methods.grantCapability({ ...params, tenantId: 'tenant-2' });

      const count = await SystemGrant.countDocuments({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.ACCESS_ADMIN,
      });
      expect(count).toBe(2);
    });
  });

  describe('revokeCapability', () => {
    it('removes the grant document', async () => {
      const userId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_USERS,
      });

      await methods.revokeCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_USERS,
      });

      const grant = await SystemGrant.findOne({
        principalType: PrincipalType.USER,
        principalId: userId,
      }).lean();
      expect(grant).toBeNull();
    });

    it('is a no-op when the grant does not exist', async () => {
      await expect(
        methods.revokeCapability({
          principalType: PrincipalType.USER,
          principalId: new Types.ObjectId(),
          capability: SystemCapabilities.MANAGE_USERS,
        }),
      ).resolves.not.toThrow();
    });

    it('normalizes string userId when revoking', async () => {
      const userId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_USAGE,
      });

      await methods.revokeCapability({
        principalType: PrincipalType.USER,
        principalId: userId.toString(),
        capability: SystemCapabilities.READ_USAGE,
      });

      const count = await SystemGrant.countDocuments({
        principalType: PrincipalType.USER,
        principalId: userId,
      });
      expect(count).toBe(0);
    });

    it('only revokes the specified tenant grant', async () => {
      const userId = new Types.ObjectId();
      const params = {
        principalType: PrincipalType.USER as const,
        principalId: userId,
        capability: SystemCapabilities.READ_CONFIGS as SystemCapability,
      };

      await methods.grantCapability({ ...params, tenantId: 'tenant-1' });
      await methods.grantCapability({ ...params, tenantId: 'tenant-2' });

      await methods.revokeCapability({ ...params, tenantId: 'tenant-1' });

      const remaining = await SystemGrant.find({
        principalType: PrincipalType.USER,
        principalId: userId,
      }).lean();

      expect(remaining).toHaveLength(1);
      expect(remaining[0].tenantId).toBe('tenant-2');
    });
  });

  describe('hasCapabilityForPrincipals', () => {
    it('returns true when a role principal holds the capability', async () => {
      await methods.seedSystemGrants();

      const result = await methods.hasCapabilityForPrincipals({
        principals: [
          { principalType: PrincipalType.USER, principalId: new Types.ObjectId() },
          { principalType: PrincipalType.ROLE, principalId: SystemRoles.ADMIN },
          { principalType: PrincipalType.PUBLIC },
        ],
        capability: SystemCapabilities.ACCESS_ADMIN,
      });
      expect(result).toBe(true);
    });

    it('returns false when no principal has the capability', async () => {
      const result = await methods.hasCapabilityForPrincipals({
        principals: [
          { principalType: PrincipalType.USER, principalId: new Types.ObjectId() },
          { principalType: PrincipalType.ROLE, principalId: SystemRoles.USER },
          { principalType: PrincipalType.PUBLIC },
        ],
        capability: SystemCapabilities.ACCESS_ADMIN,
      });
      expect(result).toBe(false);
    });

    it('returns false for an empty principals array', async () => {
      const result = await methods.hasCapabilityForPrincipals({
        principals: [],
        capability: SystemCapabilities.ACCESS_ADMIN,
      });
      expect(result).toBe(false);
    });

    it('returns false when only PUBLIC principals are present', async () => {
      const result = await methods.hasCapabilityForPrincipals({
        principals: [{ principalType: PrincipalType.PUBLIC }],
        capability: SystemCapabilities.ACCESS_ADMIN,
      });
      expect(result).toBe(false);
    });

    it('matches user-level grants', async () => {
      const userId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_CONFIGS,
      });

      const result = await methods.hasCapabilityForPrincipals({
        principals: [
          { principalType: PrincipalType.USER, principalId: userId },
          { principalType: PrincipalType.ROLE, principalId: SystemRoles.USER },
        ],
        capability: SystemCapabilities.READ_CONFIGS,
      });
      expect(result).toBe(true);
    });

    it('matches group-level grants', async () => {
      const groupId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        capability: SystemCapabilities.READ_USAGE,
      });

      const result = await methods.hasCapabilityForPrincipals({
        principals: [
          { principalType: PrincipalType.USER, principalId: new Types.ObjectId() },
          { principalType: PrincipalType.GROUP, principalId: groupId },
        ],
        capability: SystemCapabilities.READ_USAGE,
      });
      expect(result).toBe(true);
    });

    it('finds grant when string userId was used to create it and ObjectId to query', async () => {
      const userId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId.toString(),
        capability: SystemCapabilities.READ_USAGE,
      });

      const result = await methods.hasCapabilityForPrincipals({
        principals: [{ principalType: PrincipalType.USER, principalId: userId }],
        capability: SystemCapabilities.READ_USAGE,
      });
      expect(result).toBe(true);
    });

    describe('capability implications', () => {
      it.each(
        (
          Object.entries(CapabilityImplications) as [SystemCapability, SystemCapability[]][]
        ).flatMap(([broad, implied]) => implied.map((imp) => [broad, imp] as const)),
      )('%s implies %s', async (broadCap, impliedCap) => {
        const userId = new Types.ObjectId();

        await methods.grantCapability({
          principalType: PrincipalType.USER,
          principalId: userId,
          capability: broadCap,
        });

        const result = await methods.hasCapabilityForPrincipals({
          principals: [{ principalType: PrincipalType.USER, principalId: userId }],
          capability: impliedCap,
        });
        expect(result).toBe(true);
      });

      it.each(
        (
          Object.entries(CapabilityImplications) as [SystemCapability, SystemCapability[]][]
        ).flatMap(([broad, implied]) => implied.map((imp) => [imp, broad] as const)),
      )('%s does NOT imply %s (reverse)', async (narrowCap, broadCap) => {
        const userId = new Types.ObjectId();

        await methods.grantCapability({
          principalType: PrincipalType.USER,
          principalId: userId,
          capability: narrowCap,
        });

        const result = await methods.hasCapabilityForPrincipals({
          principals: [{ principalType: PrincipalType.USER, principalId: userId }],
          capability: broadCap,
        });
        expect(result).toBe(false);
      });
    });

    describe('tenant scoping', () => {
      it('tenant-scoped grant does not match platform-level query', async () => {
        const userId = new Types.ObjectId();

        await methods.grantCapability({
          principalType: PrincipalType.USER,
          principalId: userId,
          capability: SystemCapabilities.READ_CONFIGS,
          tenantId: 'tenant-1',
        });

        const result = await methods.hasCapabilityForPrincipals({
          principals: [{ principalType: PrincipalType.USER, principalId: userId }],
          capability: SystemCapabilities.READ_CONFIGS,
        });
        expect(result).toBe(false);
      });

      it('platform-level grant does not match tenant-scoped query', async () => {
        const userId = new Types.ObjectId();

        await methods.grantCapability({
          principalType: PrincipalType.USER,
          principalId: userId,
          capability: SystemCapabilities.READ_CONFIGS,
        });

        const result = await methods.hasCapabilityForPrincipals({
          principals: [{ principalType: PrincipalType.USER, principalId: userId }],
          capability: SystemCapabilities.READ_CONFIGS,
          tenantId: 'tenant-1',
        });
        expect(result).toBe(false);
      });

      it('tenant-scoped grant matches same-tenant query', async () => {
        const userId = new Types.ObjectId();

        await methods.grantCapability({
          principalType: PrincipalType.USER,
          principalId: userId,
          capability: SystemCapabilities.READ_CONFIGS,
          tenantId: 'tenant-1',
        });

        const result = await methods.hasCapabilityForPrincipals({
          principals: [{ principalType: PrincipalType.USER, principalId: userId }],
          capability: SystemCapabilities.READ_CONFIGS,
          tenantId: 'tenant-1',
        });
        expect(result).toBe(true);
      });

      it('tenant-scoped grant does not match different tenant', async () => {
        const userId = new Types.ObjectId();

        await methods.grantCapability({
          principalType: PrincipalType.USER,
          principalId: userId,
          capability: SystemCapabilities.READ_CONFIGS,
          tenantId: 'tenant-1',
        });

        const result = await methods.hasCapabilityForPrincipals({
          principals: [{ principalType: PrincipalType.USER, principalId: userId }],
          capability: SystemCapabilities.READ_CONFIGS,
          tenantId: 'tenant-2',
        });
        expect(result).toBe(false);
      });
    });
  });

  describe('getCapabilitiesForPrincipal', () => {
    it('lists all capabilities for the ADMIN role after seeding', async () => {
      await methods.seedSystemGrants();

      const grants = await methods.getCapabilitiesForPrincipal({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.ADMIN,
      });

      expect(grants).toHaveLength(Object.values(SystemCapabilities).length);
      const caps = grants.map((g) => g.capability).sort();
      expect(caps).toEqual(Object.values(SystemCapabilities).sort());
    });

    it('returns empty array when principal has no grants', async () => {
      const grants = await methods.getCapabilitiesForPrincipal({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.USER,
      });
      expect(grants).toHaveLength(0);
    });

    it('normalizes string userId for lookup', async () => {
      const userId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_USAGE,
      });

      const grants = await methods.getCapabilitiesForPrincipal({
        principalType: PrincipalType.USER,
        principalId: userId.toString(),
      });
      expect(grants).toHaveLength(1);
      expect(grants[0].capability).toBe(SystemCapabilities.READ_USAGE);
    });

    it('only returns grants for the specified tenant', async () => {
      const userId = new Types.ObjectId();

      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_CONFIGS,
        tenantId: 'tenant-1',
      });
      await methods.grantCapability({
        principalType: PrincipalType.USER,
        principalId: userId,
        capability: SystemCapabilities.READ_USAGE,
        tenantId: 'tenant-2',
      });

      const grants = await methods.getCapabilitiesForPrincipal({
        principalType: PrincipalType.USER,
        principalId: userId,
        tenantId: 'tenant-1',
      });
      expect(grants).toHaveLength(1);
      expect(grants[0].capability).toBe(SystemCapabilities.READ_CONFIGS);
    });
  });

  describe('schema validation', () => {
    it('rejects null tenantId at the schema level', async () => {
      await expect(
        SystemGrant.create({
          principalType: PrincipalType.USER,
          principalId: new Types.ObjectId(),
          capability: SystemCapabilities.READ_USERS,
          tenantId: null,
        }),
      ).rejects.toThrow(/tenantId/);
    });

    it('rejects invalid principalType values', async () => {
      await expect(
        SystemGrant.create({
          principalType: 'INVALID_TYPE',
          principalId: new Types.ObjectId(),
          capability: SystemCapabilities.READ_USERS,
        }),
      ).rejects.toThrow(/principalType/);
    });

    it('requires principalType field', async () => {
      await expect(
        SystemGrant.create({
          principalId: new Types.ObjectId(),
          capability: SystemCapabilities.READ_USERS,
        }),
      ).rejects.toThrow(/principalType/);
    });

    it('requires principalId field', async () => {
      await expect(
        SystemGrant.create({
          principalType: PrincipalType.USER,
          capability: SystemCapabilities.READ_USERS,
        }),
      ).rejects.toThrow(/principalId/);
    });

    it('requires capability field', async () => {
      await expect(
        SystemGrant.create({
          principalType: PrincipalType.USER,
          principalId: new Types.ObjectId(),
        }),
      ).rejects.toThrow(/capability/);
    });

    it('enforces unique compound index (principalType + principalId + capability + tenantId)', async () => {
      const doc = {
        principalType: PrincipalType.USER,
        principalId: new Types.ObjectId(),
        capability: SystemCapabilities.READ_USERS,
      };

      await SystemGrant.create(doc);

      await expect(SystemGrant.create(doc)).rejects.toThrow(/duplicate key|E11000/);
    });

    it('rejects duplicate platform-level grants (absent tenantId) — non-sparse index', async () => {
      const principalId = new Types.ObjectId();

      await SystemGrant.create({
        principalType: PrincipalType.USER,
        principalId,
        capability: SystemCapabilities.ACCESS_ADMIN,
      });

      await expect(
        SystemGrant.create({
          principalType: PrincipalType.USER,
          principalId,
          capability: SystemCapabilities.ACCESS_ADMIN,
        }),
      ).rejects.toThrow(/duplicate key|E11000/);
    });

    it('allows same grant for different tenants (tenantId is part of unique key)', async () => {
      const principalId = new Types.ObjectId();
      const base = {
        principalType: PrincipalType.USER,
        principalId,
        capability: SystemCapabilities.ACCESS_ADMIN,
      };

      await SystemGrant.create({ ...base, tenantId: 'tenant-a' });
      await SystemGrant.create({ ...base, tenantId: 'tenant-b' });

      const count = await SystemGrant.countDocuments({ principalId });
      expect(count).toBe(2);
    });

    it('platform-level and tenant-scoped grants coexist (different unique key values)', async () => {
      const principalId = new Types.ObjectId();
      const base = {
        principalType: PrincipalType.USER,
        principalId,
        capability: SystemCapabilities.ACCESS_ADMIN,
      };

      await SystemGrant.create(base);
      await SystemGrant.create({ ...base, tenantId: 'tenant-1' });

      const count = await SystemGrant.countDocuments({ principalId });
      expect(count).toBe(2);
    });
  });
});
