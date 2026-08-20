import mongoose from 'mongoose';
import { createModels, logger } from '..';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  PermissionBits,
  PrincipalModel,
  PrincipalType,
  ResourceType,
} from 'librechat-data-provider';
import type { CacheStore } from '~/types';
import { createMethods } from './index';

logger.silent = true;

type Methods = ReturnType<typeof createMethods>;
type AclEntryDoc = { principalType: string; resourceId: unknown; permBits: number };

let mongoServer: MongoMemoryServer;
let methods: Methods;
let AclEntry: mongoose.Model<unknown>;
let Prompt: mongoose.Model<unknown>;
let PromptGroup: mongoose.Model<unknown>;
let cacheMap: Map<string, unknown>;

const cacheStore: CacheStore = {
  get: async (key) => cacheMap.get(key),
  set: async (key, value) => {
    cacheMap.set(key, value);
  },
  delete: async (key) => {
    cacheMap.delete(key);
  },
  clear: async () => {
    cacheMap.clear();
  },
};

const idStrings = (ids: Array<mongoose.Types.ObjectId>): string[] => ids.map((id) => id.toString());

async function seedGroupAndPrompt(author: mongoose.Types.ObjectId) {
  const prompt = await Prompt.create({
    groupId: new mongoose.Types.ObjectId(),
    author,
    prompt: 'Hello {{name}}',
    type: 'text',
  });
  const group = await PromptGroup.create({
    name: `Group ${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    author,
    authorName: 'Test Author',
    productionId: prompt._id,
  });
  return group;
}

async function grantView(
  principalType: string,
  principalId: mongoose.Types.ObjectId | null,
  resourceId: unknown,
) {
  await AclEntry.create({
    principalType,
    ...(principalId ? { principalId } : {}),
    ...(principalType === PrincipalType.USER ? { principalModel: PrincipalModel.USER } : {}),
    resourceType: ResourceType.PROMPTGROUP,
    resourceId,
    permBits: PermissionBits.VIEW,
  } as AclEntryDoc);
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  AclEntry = mongoose.models.AclEntry;
  Prompt = mongoose.models.Prompt;
  PromptGroup = mongoose.models.PromptGroup;
  cacheMap = new Map();
  methods = createMethods(mongoose, { getCache: () => cacheStore });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Promise.all([AclEntry.deleteMany({}), Prompt.deleteMany({}), PromptGroup.deleteMany({})]);
  await methods.invalidatePromptGroupAccessContext();
});

describe('getPromptGroupAccessContext', () => {
  it('resolves user-accessible, public, and owned prompt group ID sets', async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherId = new mongoose.Types.ObjectId();
    const ownGroup = await seedGroupAndPrompt(userId);
    const publicGroup = await seedGroupAndPrompt(otherId);
    const hiddenGroup = await seedGroupAndPrompt(otherId);

    await grantView(PrincipalType.USER, userId, ownGroup._id);
    await grantView(PrincipalType.PUBLIC, null, publicGroup._id);

    const { accessibleIds, publiclyAccessibleIds, ownedPromptGroupIds } =
      await methods.getPromptGroupAccessContext({ userId: userId.toString(), role: 'USER' });

    expect(idStrings(publiclyAccessibleIds)).toEqual([publicGroup._id.toString()]);
    expect(idStrings(ownedPromptGroupIds)).toEqual([ownGroup._id.toString()]);

    const accessible = idStrings(accessibleIds);
    expect(accessible).toContain(ownGroup._id.toString());
    expect(accessible).toContain(publicGroup._id.toString());
    expect(accessible).not.toContain(hiddenGroup._id.toString());
  });

  it('serves repeat reads from the cache and refreshes after invalidation', async () => {
    const userId = new mongoose.Types.ObjectId();
    const ownGroup = await seedGroupAndPrompt(userId);
    const sharedGroup = await seedGroupAndPrompt(new mongoose.Types.ObjectId());
    await grantView(PrincipalType.USER, userId, ownGroup._id);

    await methods.getPromptGroupAccessContext({ userId: userId.toString(), role: 'USER' });

    await grantView(PrincipalType.USER, userId, sharedGroup._id);

    const stale = await methods.getPromptGroupAccessContext({
      userId: userId.toString(),
      role: 'USER',
    });
    expect(idStrings(stale.accessibleIds)).not.toContain(sharedGroup._id.toString());

    await methods.invalidatePromptGroupAccessContext();

    const fresh = await methods.getPromptGroupAccessContext({
      userId: userId.toString(),
      role: 'USER',
    });
    expect(idStrings(fresh.accessibleIds)).toContain(sharedGroup._id.toString());
  });

  it('shares the public set across users and invalidates it on group deletion', async () => {
    const authorId = new mongoose.Types.ObjectId();
    const publicGroup = await seedGroupAndPrompt(authorId);
    await grantView(PrincipalType.PUBLIC, null, publicGroup._id);

    const authorCtx = await methods.getPromptGroupAccessContext({
      userId: authorId.toString(),
      role: 'USER',
    });
    const otherCtx = await methods.getPromptGroupAccessContext({
      userId: new mongoose.Types.ObjectId().toString(),
      role: 'USER',
    });

    expect(idStrings(authorCtx.publiclyAccessibleIds)).toEqual([publicGroup._id.toString()]);
    expect(idStrings(otherCtx.publiclyAccessibleIds)).toEqual([publicGroup._id.toString()]);

    await methods.deletePromptGroup({ _id: publicGroup._id.toString() });

    const afterDelete = await methods.getPromptGroupAccessContext({
      userId: authorId.toString(),
      role: 'USER',
    });
    expect(idStrings(afterDelete.publiclyAccessibleIds)).toEqual([]);
  });

  it('invalidates cached owned IDs when a prompt group is created', async () => {
    const userId = new mongoose.Types.ObjectId();
    const before = await methods.getPromptGroupAccessContext({
      userId: userId.toString(),
      role: 'USER',
    });
    expect(before.ownedPromptGroupIds).toHaveLength(0);

    await methods.createPromptGroup({
      prompt: { prompt: 'Created', type: 'text' },
      group: { name: 'Created Group' },
      author: userId.toString(),
      authorName: 'Test Author',
    });

    const after = await methods.getPromptGroupAccessContext({
      userId: userId.toString(),
      role: 'USER',
    });
    expect(after.ownedPromptGroupIds).toHaveLength(1);
  });
});
