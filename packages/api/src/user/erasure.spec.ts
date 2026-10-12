import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ResourceType, PrincipalType } from 'librechat-data-provider';
import { createModels, createMethods } from '@librechat/data-schemas';
import type { CheckpointDeletion } from '~/agents/checkpoints/deletion';
import type { UserErasureDeps } from './erasure';
import { deleteAllSharedLinksWithCleanup } from '~/shared-links/service';
import { eraseUserData } from './erasure';

const OWNER_BITS = 15;

let mongo: MongoMemoryServer;
let methods: ReturnType<typeof createMethods>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  createModels(mongoose);
  await mongoose.connect(mongo.getUri());
  methods = createMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(async () => {
  await mongoose.connection.db?.dropDatabase();
});

const model = (name: string) => mongoose.models[name].collection;
const count = (name: string, filter: Record<string, unknown>) => model(name).countDocuments(filter);

async function seedUser(userId: mongoose.Types.ObjectId) {
  const user = userId.toString();
  const skillId = new mongoose.Types.ObjectId();
  const mcpServerId = new mongoose.Types.ObjectId();
  const legacyServerId = new mongoose.Types.ObjectId();

  await model('Skill').insertOne({ _id: skillId, name: `skill-${user}`, author: userId });
  await model('SkillFile').insertOne({ skillId, relativePath: 'notes.md', author: userId });
  await methods.grantPermission(
    PrincipalType.USER,
    userId,
    ResourceType.SKILL,
    skillId,
    OWNER_BITS,
    userId,
  );
  await model('MCPServer').insertMany([
    { _id: mcpServerId, serverName: `acl-${user}`, author: userId },
    { _id: legacyServerId, serverName: `legacy-${user}`, author: userId },
  ]);
  await methods.grantPermission(
    PrincipalType.USER,
    userId,
    ResourceType.MCPSERVER,
    mcpServerId,
    OWNER_BITS,
    userId,
  );
  await model('SharedLink').insertOne({ user, conversationId: `convo-${user}`, shareId: user });
  await model('File').insertMany([
    { user: userId, file_id: `file-a-${user}`, filepath: '/uploads/a', source: 'local' },
    { user: userId, file_id: `file-b-${user}`, filepath: '/uploads/b', source: 's3' },
  ]);
  await model('Conversation').insertOne({ user, conversationId: `convo-${user}` });
  await model('Transaction').insertOne({ user: userId, tokenType: 'prompt', rawAmount: -1 });
  await model('ToolFavorite').insertOne({ user: userId, itemType: 'tool', itemId: 'web' });
  await model('ChatProject').insertOne({ user, name: `project-${user}` });
  await model('AgentQueuedTurn').insertOne({ user: userId, conversationId: `convo-${user}` });
  await model('AgentQueuedTurnSequence').insertOne({
    user: userId,
    conversationId: `convo-${user}`,
  });
  await model('RefreshTokenBridge').insertOne({
    userId: user,
    tenantId: 'tenant-1',
    oldRefreshTokenHash: `hash-${user}`,
    encryptedNewRefreshToken: 'encrypted',
  });
  return { skillId, mcpServerId, legacyServerId };
}

function createDeps() {
  const order: string[] = [];
  const checkpointDeletion: CheckpointDeletion = {
    conversationIds: () => [],
    remember: jest.fn(async () => {
      order.push('remember');
    }),
    cleanup: jest.fn(async () => {
      order.push('cleanup');
    }),
    acknowledge: jest.fn(async () => {
      order.push('acknowledge');
    }),
  };
  const deps: UserErasureDeps = {
    ...methods,
    openCheckpointDeletion: jest.fn(async () => checkpointDeletion),
    deleteSharedLinks: deleteAllSharedLinksWithCleanup,
    deleteStoredFiles: jest.fn(async () => {
      order.push('deleteStoredFiles');
    }),
    invalidateMCPServerTools: jest.fn(async () => undefined),
    disconnectMCPServer: jest.fn(async () => undefined),
  };
  return { deps, checkpointDeletion, order };
}

describe('eraseUserData', () => {
  it('clears skills, MCP servers, shared links, file objects and checkpoints', async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherId = new mongoose.Types.ObjectId();
    const user = userId.toString();
    const { skillId } = await seedUser(userId);
    const other = await seedUser(otherId);
    const { deps, checkpointDeletion, order } = createDeps();

    await eraseUserData({ userId: user, tenantId: 'tenant-1', checkpointer: { ttl: 60 } }, deps);

    expect(deps.openCheckpointDeletion).toHaveBeenCalledWith(user, 'tenant-1', undefined, {
      ttl: 60,
    });
    expect(checkpointDeletion.remember).toHaveBeenCalledWith([`convo-${user}`]);
    expect(order.slice(0, 3)).toEqual(['remember', 'cleanup', 'acknowledge']);
    expect(await count('Conversation', { user })).toBe(0);

    expect(deps.deleteStoredFiles).toHaveBeenCalledTimes(1);
    const storedFiles = (deps.deleteStoredFiles as jest.Mock).mock.calls[0][0];
    expect(storedFiles.map((file: { file_id: string }) => file.file_id).sort()).toEqual([
      `file-a-${user}`,
      `file-b-${user}`,
    ]);
    expect(await count('File', { user: userId })).toBe(0);

    expect(await count('Skill', { _id: skillId })).toBe(0);
    expect(await count('SkillFile', { skillId })).toBe(0);
    expect(await count('MCPServer', { author: userId })).toBe(0);
    expect(deps.invalidateMCPServerTools).toHaveBeenCalledWith(`acl-${user}`);
    expect(deps.invalidateMCPServerTools).toHaveBeenCalledWith(`legacy-${user}`);
    expect(deps.disconnectMCPServer).toHaveBeenCalledWith(`acl-${user}`);
    expect(deps.disconnectMCPServer).toHaveBeenCalledWith(`legacy-${user}`);
    expect(await count('SharedLink', { user })).toBe(0);
    expect(await count('AclEntry', { principalId: userId })).toBe(0);
    expect(await count('Transaction', { user: userId })).toBe(0);
    expect(await count('ToolFavorite', { user: userId })).toBe(0);
    expect(await count('ChatProject', { user })).toBe(0);
    expect(await count('AgentQueuedTurn', { user: userId })).toBe(0);
    expect(await count('AgentQueuedTurnSequence', { user: userId })).toBe(0);
    expect(await count('RefreshTokenBridge', { userId: user })).toBe(0);

    expect(await count('Skill', { _id: other.skillId })).toBe(1);
    expect(await count('MCPServer', { author: otherId })).toBe(2);
    expect(await count('SharedLink', { user: otherId.toString() })).toBe(1);
    expect(await count('File', { user: otherId })).toBe(2);
    expect(await count('Conversation', { user: otherId.toString() })).toBe(1);
    expect(await count('ToolFavorite', { user: otherId })).toBe(1);
    expect(await count('ChatProject', { user: otherId.toString() })).toBe(1);
    expect(await count('AgentQueuedTurn', { user: otherId })).toBe(1);
    expect(await count('AgentQueuedTurnSequence', { user: otherId })).toBe(1);
    expect(await count('RefreshTokenBridge', { userId: otherId.toString() })).toBe(1);
  });

  it('keeps the transaction ledger when the operator retains it', async () => {
    const userId = new mongoose.Types.ObjectId();
    await seedUser(userId);
    const { deps } = createDeps();

    await eraseUserData({ userId: userId.toString(), keepTransactions: true }, deps);

    expect(await count('Transaction', { user: userId })).toBe(1);
    expect(await count('Conversation', { user: userId.toString() })).toBe(0);
  });

  it('erases nothing past conversations when checkpoint capture fails', async () => {
    const userId = new mongoose.Types.ObjectId();
    await seedUser(userId);
    const { deps, checkpointDeletion } = createDeps();
    (checkpointDeletion.cleanup as jest.Mock).mockRejectedValueOnce(new Error('store down'));

    await expect(eraseUserData({ userId: userId.toString() }, deps)).rejects.toThrow('store down');

    expect(checkpointDeletion.acknowledge).not.toHaveBeenCalled();
    expect(deps.deleteStoredFiles).not.toHaveBeenCalled();
    expect(await count('File', { user: userId })).toBe(2);
    expect(await count('Skill', { author: userId })).toBe(1);
  });

  it('stops before group and ACL cleanup when the MCP server lookup fails', async () => {
    const userId = new mongoose.Types.ObjectId();
    await seedUser(userId);
    const { deps } = createDeps();
    const failingDeps: UserErasureDeps = {
      ...deps,
      findUserErasableMCPServers: jest.fn().mockRejectedValue(new Error('mongo down')),
    };

    await expect(eraseUserData({ userId: userId.toString() }, failingDeps)).rejects.toThrow(
      'mongo down',
    );

    expect(await count('MCPServer', { author: userId })).toBe(2);
    expect(await count('AclEntry', { principalId: userId })).toBeGreaterThan(0);
  });

  it('removes stored files while the user keys their provider clients need still exist', async () => {
    const userId = new mongoose.Types.ObjectId();
    await seedUser(userId);
    const { deps, order } = createDeps();
    const deleteUserKey = deps.deleteUserKey;
    const orderedDeps: UserErasureDeps = {
      ...deps,
      deleteUserKey: jest.fn(async (params) => {
        order.push('deleteUserKey');
        return deleteUserKey(params);
      }),
    };

    await eraseUserData({ userId: userId.toString() }, orderedDeps);

    expect(order.indexOf('deleteStoredFiles')).toBeLessThan(order.indexOf('deleteUserKey'));
  });

  it('still erases the account when the storage provider fails', async () => {
    const userId = new mongoose.Types.ObjectId();
    await seedUser(userId);
    const { deps } = createDeps();
    (deps.deleteStoredFiles as jest.Mock).mockRejectedValueOnce(new Error('provider down'));

    await eraseUserData({ userId: userId.toString() }, deps);

    expect(await count('File', { user: userId })).toBe(0);
    expect(await count('Skill', { author: userId })).toBe(0);
  });
});
