import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import { AccessRoleIds, PrincipalType, ResourceType } from 'librechat-data-provider';
import { AccessControlService } from '~/acl/accessControlService';
import { createCodeEnvironmentRegistry } from './environments';
import { revokeUserCodeEnvironmentWorkers } from './lifecycle';

function createSharedCache() {
  const values = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => values.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      values.set(key, value);
      return true;
    }),
  };
}

describe('code environment registry', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    createModels(mongoose);
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    await createMethods(mongoose).seedDefaultRoles();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await createMethods(mongoose).seedDefaultRoles();
  });

  test('discovers a registered environment only for its owner principal', async () => {
    const registry = createCodeEnvironmentRegistry(mongoose);
    const ownerId = new Types.ObjectId();
    const strangerId = new Types.ObjectId();

    const created = await registry.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'danny-vm',
        name: "Danny's VM",
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
        workerId: 'danny-worker',
      },
    });

    expect(mongoose.models.CodeEnvironment.schema.path('controlPlaneId')).toBeDefined();
    expect(created).toEqual({
      resourceId: expect.any(String),
      id: 'danny-vm',
      name: "Danny's VM",
      type: 'attached',
    });
    await expect(registry.listRegisteredIds()).resolves.toEqual(['danny-vm']);
    await expect(
      registry.listAccessible({ userId: ownerId, role: 'USER', idOnTheSource: null }),
    ).resolves.toEqual([created]);
    await expect(
      registry.listAccessible({ userId: strangerId, role: 'USER', idOnTheSource: null }),
    ).resolves.toEqual([]);
    await expect(
      registry.listAccessibleConfigurations({
        userId: ownerId,
        role: 'USER',
        idOnTheSource: null,
      }),
    ).resolves.toEqual([
      {
        id: 'danny-vm',
        name: "Danny's VM",
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
        owner: 'principal',
        workerId: 'danny-worker',
      },
    ]);
  });

  test('discovers environments granted through role and group principals', async () => {
    const registry = createCodeEnvironmentRegistry(mongoose);
    const methods = createMethods(mongoose);
    const access = new AccessControlService(mongoose);
    const ownerId = new Types.ObjectId();
    const teammateId = new Types.ObjectId();
    const group = await methods.createGroup({
      name: 'Code Team',
      source: 'local',
      memberIds: [teammateId.toString()],
    });
    const roleEnvironment = await registry.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'role-vm',
        name: 'Role VM',
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
      },
    });
    const groupEnvironment = await registry.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'group-vm',
        name: 'Group VM',
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
      },
    });

    await access.grantPermission({
      principalType: PrincipalType.ROLE,
      principalId: 'CODE_USER',
      resourceType: ResourceType.CODE_ENVIRONMENT,
      resourceId: roleEnvironment.resourceId,
      accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_VIEWER,
      grantedBy: ownerId,
    });
    await access.grantPermission({
      principalType: PrincipalType.GROUP,
      principalId: group._id,
      resourceType: ResourceType.CODE_ENVIRONMENT,
      resourceId: groupEnvironment.resourceId,
      accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_VIEWER,
      grantedBy: ownerId,
    });

    await expect(
      registry.listAccessible({
        userId: teammateId,
        role: 'CODE_USER',
        idOnTheSource: null,
      }),
    ).resolves.toEqual([roleEnvironment, groupEnvironment]);
  });

  test('keeps a user-bound worker private even if its ACL is granted to a role', async () => {
    const registry = createCodeEnvironmentRegistry(mongoose);
    const access = new AccessControlService(mongoose);
    const ownerId = new Types.ObjectId();
    const teammateId = new Types.ObjectId();
    const environment = await registry.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'owner-worker',
        name: 'Owner worker',
        type: 'attached',
        baseURL: 'https://code.example.com',
        workerId: 'owner-worker',
        workerPrincipal: { type: 'user', id: ownerId.toString() },
      },
    });
    await access.grantPermission({
      principalType: PrincipalType.ROLE,
      principalId: 'CODE_USER',
      resourceType: ResourceType.CODE_ENVIRONMENT,
      resourceId: environment.resourceId,
      accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_VIEWER,
      grantedBy: ownerId,
    });

    await expect(
      registry.listAccessible({ userId: teammateId, role: 'CODE_USER', idOnTheSource: null }),
    ).resolves.toEqual([]);
    await expect(
      registry.listAccessible({ userId: ownerId, role: 'USER', idOnTheSource: null }),
    ).resolves.toEqual([environment]);
  });

  test('deletes an owner environment and its ACL after lifecycle cleanup succeeds', async () => {
    const registry = createCodeEnvironmentRegistry(mongoose);
    const ownerId = new Types.ObjectId();
    const environment = await registry.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'remove-me',
        name: 'Remove me',
        type: 'attached',
        baseURL: 'https://code.example.com',
        workerId: 'remove-me',
        controlPlaneId: 'self-service',
        workerPrincipal: { type: 'user', id: ownerId.toString() },
      },
    });
    const beforeDelete = jest.fn().mockResolvedValue(undefined);

    await expect(
      registry.remove({
        actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
        environmentId: 'remove-me',
        beforeDelete,
      }),
    ).resolves.toEqual(environment);
    expect(beforeDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'remove-me',
        workerId: 'remove-me',
        controlPlaneId: 'self-service',
      }),
    );
    await expect(
      mongoose.models.AclEntry.countDocuments({ resourceId: environment.resourceId }),
    ).resolves.toBe(0);
    await expect(
      registry.listAccessible({ userId: ownerId, role: 'USER', idOnTheSource: null }),
    ).resolves.toEqual([]);
  });

  test('revokes every user-bound worker before account deletion', async () => {
    const ownerId = new Types.ObjectId();
    await createCodeEnvironmentRegistry(mongoose).register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'account-worker',
        name: 'Account worker',
        type: 'attached',
        baseURL: 'https://code.example.com/v1',
        workerId: 'account-worker',
        controlPlaneId: 'self-service',
        workerPrincipal: { type: 'user', id: ownerId.toString() },
      },
    });
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });

    await expect(
      revokeUserCodeEnvironmentWorkers({
        mongoose,
        userId: ownerId.toString(),
        appConfig: {
          endpoints: {
            agents: {
              statefulCodeSessions: {
                allowedEnvironments: ['user'],
                environments: [
                  {
                    id: 'self-service',
                    name: 'Self-service',
                    type: 'attached',
                    baseURL: 'https://code.example.com/v1',
                    owner: 'deployment',
                    pairing: {
                      allowPrincipalWorkers: true,
                      tokenEnv: 'CODE_ADMIN_TOKEN',
                    },
                  },
                ],
              },
            },
          },
        } as never,
        readSecret: () => 'administrator-token',
        fetchImpl,
      }),
    ).resolves.toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://code.example.com/v1/bridge/workers/account-worker/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('removes creator-owned environment records and grants when the user is deleted', async () => {
    const registry = createCodeEnvironmentRegistry(mongoose);
    const methods = createMethods(mongoose);
    const ownerId = new Types.ObjectId();
    const environment = await registry.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'departing-user-vm',
        name: 'Departing user VM',
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
      },
    });

    await expect(methods.deleteUserCodeEnvironments(ownerId)).resolves.toBe(1);
    await expect(
      registry.listAccessible({ userId: ownerId, role: 'USER', idOnTheSource: null }),
    ).resolves.toEqual([]);
    await expect(
      mongoose.models.AclEntry.countDocuments({
        resourceType: ResourceType.CODE_ENVIRONMENT,
        resourceId: environment.resourceId,
      }),
    ).resolves.toBe(0);
  });

  test('invalidates shared configuration caches after registration', async () => {
    const cache = createSharedCache();
    const firstWorker = createCodeEnvironmentRegistry(mongoose, { configurationCache: cache });
    const secondWorker = createCodeEnvironmentRegistry(mongoose, { configurationCache: cache });
    const ownerId = new Types.ObjectId();
    const actor = { userId: ownerId, role: 'USER', idOnTheSource: null };

    await expect(firstWorker.listAccessibleConfigurations(actor)).resolves.toEqual([]);
    await secondWorker.register({
      actor,
      environment: {
        id: 'shared-cache-vm',
        name: 'Shared cache VM',
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
      },
    });

    await expect(firstWorker.listAccessibleConfigurations(actor)).resolves.toEqual([
      expect.objectContaining({ id: 'shared-cache-vm' }),
    ]);
  });

  test('caches registered environment ids behind the shared tenant revision', async () => {
    const cache = createSharedCache();
    const firstWorker = createCodeEnvironmentRegistry(mongoose, { configurationCache: cache });
    const secondWorker = createCodeEnvironmentRegistry(mongoose, { configurationCache: cache });
    const distinct = jest.spyOn(mongoose.models.CodeEnvironment, 'distinct');
    const ownerId = new Types.ObjectId();

    await expect(firstWorker.listRegisteredIds()).resolves.toEqual([]);
    await expect(firstWorker.listRegisteredIds()).resolves.toEqual([]);
    expect(distinct).toHaveBeenCalledTimes(1);

    await secondWorker.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'revision-cached-vm',
        name: 'Revision Cached VM',
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
      },
    });

    await expect(firstWorker.listRegisteredIds()).resolves.toEqual(['revision-cached-vm']);
    expect(distinct).toHaveBeenCalledTimes(2);
    distinct.mockRestore();
  });

  test('invalidates shared configuration caches after ACL revocation', async () => {
    const cache = createSharedCache();
    const registry = createCodeEnvironmentRegistry(mongoose, { configurationCache: cache });
    const ownerId = new Types.ObjectId();
    const teammateId = new Types.ObjectId();
    const environment = await registry.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'revoked-vm',
        name: 'Revoked VM',
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
      },
    });
    const access = new AccessControlService(mongoose);
    await access.grantPermission({
      principalType: PrincipalType.USER,
      principalId: teammateId,
      resourceType: ResourceType.CODE_ENVIRONMENT,
      resourceId: environment.resourceId,
      accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_VIEWER,
      grantedBy: ownerId,
    });
    const teammate = { userId: teammateId, role: 'USER', idOnTheSource: null };
    await expect(registry.listAccessibleConfigurations(teammate)).resolves.toHaveLength(1);

    await mongoose.models.AclEntry.deleteMany({
      principalType: PrincipalType.USER,
      principalId: teammateId,
      resourceType: ResourceType.CODE_ENVIRONMENT,
      resourceId: environment.resourceId,
    });
    await registry.invalidateAccessibleConfigurations();

    await expect(registry.listAccessibleConfigurations(teammate)).resolves.toEqual([]);
  });

  test('does not reuse revoked access when cache invalidation fails', async () => {
    const cache = createSharedCache();
    const registry = createCodeEnvironmentRegistry(mongoose, { configurationCache: cache });
    const ownerId = new Types.ObjectId();
    const teammateId = new Types.ObjectId();
    const environment = await registry.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'fail-closed-vm',
        name: 'Fail Closed VM',
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
      },
    });
    const access = new AccessControlService(mongoose);
    await access.grantPermission({
      principalType: PrincipalType.USER,
      principalId: teammateId,
      resourceType: ResourceType.CODE_ENVIRONMENT,
      resourceId: environment.resourceId,
      accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_VIEWER,
      grantedBy: ownerId,
    });
    const teammate = { userId: teammateId, role: 'USER', idOnTheSource: null };
    await expect(registry.listAccessibleConfigurations(teammate)).resolves.toHaveLength(1);

    await mongoose.models.AclEntry.deleteMany({
      principalType: PrincipalType.USER,
      principalId: teammateId,
      resourceType: ResourceType.CODE_ENVIRONMENT,
      resourceId: environment.resourceId,
    });
    cache.set.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(registry.invalidateAccessibleConfigurations()).rejects.toThrow(
      'redis unavailable',
    );

    await expect(registry.listAccessibleConfigurations(teammate)).resolves.toEqual([]);
  });

  test('does not reuse cached access after group membership changes', async () => {
    const cache = createSharedCache();
    const registry = createCodeEnvironmentRegistry(mongoose, { configurationCache: cache });
    const methods = createMethods(mongoose);
    const ownerId = new Types.ObjectId();
    const teammateId = new Types.ObjectId();
    const group = await methods.createGroup({
      name: 'Temporary Code Team',
      source: 'local',
      memberIds: [teammateId.toString()],
    });
    const environment = await registry.register({
      actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
      environment: {
        id: 'temporary-group-vm',
        name: 'Temporary Group VM',
        type: 'attached',
        baseURL: 'https://code.example.com',
        controlPlaneId: 'shared-code-api',
      },
    });
    const access = new AccessControlService(mongoose);
    await access.grantPermission({
      principalType: PrincipalType.GROUP,
      principalId: group._id,
      resourceType: ResourceType.CODE_ENVIRONMENT,
      resourceId: environment.resourceId,
      accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_VIEWER,
      grantedBy: ownerId,
    });
    const teammate = { userId: teammateId, role: 'USER', idOnTheSource: null };

    await expect(registry.listAccessibleConfigurations(teammate)).resolves.toHaveLength(1);
    await methods.updateGroupById(group._id, { memberIds: [] });
    await expect(registry.listAccessibleConfigurations(teammate)).resolves.toEqual([]);
  });

  test('rolls registration back when shared cache invalidation fails', async () => {
    const registry = createCodeEnvironmentRegistry(mongoose, {
      configurationCache: {
        get: jest.fn(),
        set: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      },
    });
    const ownerId = new Types.ObjectId();

    await expect(
      registry.register({
        actor: { userId: ownerId, role: 'USER', idOnTheSource: null },
        environment: {
          id: 'rolled-back-vm',
          name: 'Rolled Back VM',
          type: 'attached',
          baseURL: 'https://code.example.com',
          controlPlaneId: 'shared-code-api',
        },
      }),
    ).rejects.toThrow('redis unavailable');

    await expect(
      mongoose.models.CodeEnvironment.countDocuments({ environmentId: 'rolled-back-vm' }),
    ).resolves.toBe(0);
    await expect(
      mongoose.models.AclEntry.countDocuments({ resourceType: ResourceType.CODE_ENVIRONMENT }),
    ).resolves.toBe(0);
  });
});
