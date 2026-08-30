import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import { AccessRoleIds, PrincipalType, ResourceType } from 'librechat-data-provider';
import { AccessControlService } from '~/acl/accessControlService';
import { createCodeEnvironmentRegistry } from './environments';

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
      },
    });

    expect(mongoose.models.CodeEnvironment.schema.path('controlPlaneId')).toBeDefined();
    expect(created).toEqual({
      resourceId: expect.any(String),
      id: 'danny-vm',
      name: "Danny's VM",
      type: 'attached',
    });
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
});
