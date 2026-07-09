import mongoose, { Types, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods } from '@librechat/data-schemas';
import { ResourceType, PrincipalType } from 'librechat-data-provider';
import type { TGlobalAgent } from 'librechat-data-provider';
import type { IAgent } from '@librechat/data-schemas';
import { reconcileGlobalAgents } from './global';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

let mongoServer: MongoMemoryServer;
let Agent: Model<IAgent>;
let AclEntry: Model<Record<string, unknown>>;
let dbMethods: ReturnType<typeof createMethods>;

const methods = () => ({
  findRoleByIdentifier: dbMethods.findRoleByIdentifier,
  grantPermission: dbMethods.grantPermission,
  findEntriesByResource: dbMethods.findEntriesByResource,
  deleteAclEntries: dbMethods.deleteAclEntries,
});

const reconcile = (globalAgents: TGlobalAgent[]) =>
  reconcileGlobalAgents({ globalAgents, methods: methods(), AgentModel: Agent });

const grantsFor = async (resourceId: Types.ObjectId) =>
  AclEntry.find({ resourceType: ResourceType.AGENT, resourceId }).lean();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  Agent = mongoose.models.Agent as Model<IAgent>;
  AclEntry = mongoose.models.AclEntry as Model<Record<string, unknown>>;
  dbMethods = createMethods(mongoose);
  await dbMethods.seedDefaultRoles();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Agent.deleteMany({});
  await AclEntry.deleteMany({});
});

const baseAgent = (overrides: Partial<TGlobalAgent> = {}): TGlobalAgent =>
  ({
    id: 'agent_global_support',
    name: 'Support',
    provider: 'openAI',
    model: 'gpt-4o',
    instructions: 'Help the user.',
    ...overrides,
  }) as TGlobalAgent;

describe('reconcileGlobalAgents', () => {
  test('seeds an immutable, system-authored agent doc', async () => {
    await reconcile([baseAgent({ access: { roles: ['USER'] } })]);

    const agent = await Agent.findOne({ id: 'agent_global_support' }).lean<IAgent>();
    expect(agent).toBeTruthy();
    expect(agent?.isSystem).toBe(true);
    expect(agent?.author?.toString()).toBe('000000000000000000000000');
    expect(agent?.provider).toBe('openAI');
    expect(agent?.model).toBe('gpt-4o');
    expect(agent?.instructions).toBe('Help the user.');
    expect(agent?.tenantId).toBeUndefined();
  });

  test('grants ACL entries matching the visibility spec', async () => {
    const groupId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    await reconcile([
      baseAgent({ access: { public: true, roles: ['USER'], groups: [groupId], users: [userId] } }),
    ]);

    const agent = await Agent.findOne({ id: 'agent_global_support' }).lean<IAgent>();
    const grants = await grantsFor(agent!._id as Types.ObjectId);
    const byType = grants.map((g) => g.principalType).sort();
    expect(byType).toEqual(
      [PrincipalType.GROUP, PrincipalType.PUBLIC, PrincipalType.ROLE, PrincipalType.USER].sort(),
    );
    const roleGrant = grants.find((g) => g.principalType === PrincipalType.ROLE);
    expect(roleGrant?.principalId).toBe('USER');
  });

  test('is idempotent across re-runs (no duplicate docs or grants)', async () => {
    const cfg = [baseAgent({ access: { public: true } })];
    await reconcile(cfg);
    await reconcile(cfg);

    expect(await Agent.countDocuments({ id: 'agent_global_support' })).toBe(1);
    const agent = await Agent.findOne({ id: 'agent_global_support' }).lean<IAgent>();
    const grants = await grantsFor(agent!._id as Types.ObjectId);
    expect(grants).toHaveLength(1);
    expect(grants[0].principalType).toBe(PrincipalType.PUBLIC);
  });

  test('reconciles grants when the visibility spec changes', async () => {
    const groupId = new Types.ObjectId().toString();
    await reconcile([baseAgent({ access: { public: true } })]);
    await reconcile([baseAgent({ access: { groups: [groupId] } })]);

    const agent = await Agent.findOne({ id: 'agent_global_support' }).lean<IAgent>();
    const grants = await grantsFor(agent!._id as Types.ObjectId);
    expect(grants).toHaveLength(1);
    expect(grants[0].principalType).toBe(PrincipalType.GROUP);
    expect(String(grants[0].principalId)).toBe(groupId);
  });

  test('merges config field overrides onto the existing doc', async () => {
    await reconcile([baseAgent({ access: { public: true } })]);
    await reconcile([
      baseAgent({ instructions: 'Updated instructions.', access: { public: true } }),
    ]);

    const agent = await Agent.findOne({ id: 'agent_global_support' }).lean<IAgent>();
    expect(agent?.instructions).toBe('Updated instructions.');
  });

  test('soft-retires an agent removed from config (revokes grants, keeps doc)', async () => {
    await reconcile([baseAgent({ access: { public: true } })]);
    const agent = await Agent.findOne({ id: 'agent_global_support' }).lean<IAgent>();
    expect(await grantsFor(agent!._id as Types.ObjectId)).toHaveLength(1);

    await reconcile([]);

    expect(await Agent.countDocuments({ id: 'agent_global_support' })).toBe(1);
    expect(await grantsFor(agent!._id as Types.ObjectId)).toHaveLength(0);
  });

  test('skips invalid entries without throwing, still seeds valid ones', async () => {
    const invalid = { id: 'agent_global_broken', name: 'Broken' } as unknown as TGlobalAgent;
    await reconcile([invalid, baseAgent({ access: { public: true } })]);

    expect(await Agent.countDocuments({ id: 'agent_global_broken' })).toBe(0);
    expect(await Agent.countDocuments({ id: 'agent_global_support' })).toBe(1);
  });
});
