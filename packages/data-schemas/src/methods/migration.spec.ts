import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { EModelEndpoint, PrincipalModel, PrincipalType } from 'librechat-data-provider';
import type { IAclEntry, IBalance, IConversation } from '../types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '../models';
import { runAsSystem } from '~/config/tenantContext';
import { createAclEntryMethods } from './aclEntry';
import { createMigrationMethods, type MigrationMethods } from './migration';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let modelsToCleanup: string[] = [];
let methods: MigrationMethods;

const sourceUserId = new mongoose.Types.ObjectId().toString();
const targetUserId = new mongoose.Types.ObjectId().toString();
const targetTenantId = 'tenant-target';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);

  const aclMethods = createAclEntryMethods(mongoose);
  methods = createMigrationMethods(mongoose, {
    getSoleOwnedResourceIds: aclMethods.getSoleOwnedResourceIds,
  });

  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete mongoose.models[modelName];
    }
  }

  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('migration methods', () => {
  test('countUserData returns per-scope counts', async () => {
    const Conversation = mongoose.models.Conversation;
    await Conversation.create([
      {
        conversationId: uuidv4(),
        user: sourceUserId,
        tenantId: 'tenant-a',
        endpoint: EModelEndpoint.openAI,
      },
      {
        conversationId: uuidv4(),
        user: sourceUserId,
        tenantId: 'tenant-a',
        endpoint: EModelEndpoint.openAI,
      },
      {
        conversationId: uuidv4(),
        user: targetUserId,
        tenantId: targetTenantId,
        endpoint: EModelEndpoint.openAI,
      },
    ]);

    const counts = await methods.countUserData({
      sourceUserId,
      scopes: ['conversation'],
    });

    expect(counts.conversation).toBe(2);
  });

  test('reassignUserData moves generic conversation ownership', async () => {
    const Conversation = mongoose.models.Conversation;
    const convoId = uuidv4();
    await Conversation.create({
      conversationId: convoId,
      user: sourceUserId,
      tenantId: 'tenant-a',
      endpoint: EModelEndpoint.openAI,
    });

    const results = await runAsSystem(() =>
      methods.reassignUserData({
        sourceUserId,
        targetUserId,
        targetTenantId,
        scopes: ['conversation'],
      }),
    );

    expect(results).toEqual([
      expect.objectContaining({
        scopeKey: 'conversation',
        modified: 1,
        skipped: 0,
      }),
    ]);

    const moved = await Conversation.findOne({ conversationId: convoId }).lean<IConversation>();
    expect(moved?.user).toBe(targetUserId);
    expect(moved?.tenantId).toBe(targetTenantId);

    const sourceRemaining = await Conversation.countDocuments({ user: sourceUserId });
    expect(sourceRemaining).toBe(0);
  });

  test('reassignUserData preserves conversation createdAt and updatedAt', async () => {
    const Conversation = mongoose.models.Conversation;
    const pastDate = new Date('2026-03-01T10:00:00.000Z');
    const convoId = uuidv4();
    await Conversation.create({
      conversationId: convoId,
      user: sourceUserId,
      tenantId: 'tenant-a',
      endpoint: EModelEndpoint.openAI,
      createdAt: pastDate,
      updatedAt: pastDate,
    });

    await runAsSystem(() =>
      methods.reassignUserData({
        sourceUserId,
        targetUserId,
        targetTenantId,
        scopes: ['conversation'],
      }),
    );

    const moved = await Conversation.findOne({ conversationId: convoId }).lean<IConversation>();
    expect(moved?.user).toBe(targetUserId);
    expect(moved?.createdAt?.toISOString()).toBe(pastDate.toISOString());
    expect(moved?.updatedAt?.toISOString()).toBe(pastDate.toISOString());
  });

  test('reassignUserData preserves target conversations and merges source (10 + 5 = 15)', async () => {
    const Conversation = mongoose.models.Conversation;
    const sourceConvos = Array.from({ length: 10 }, () => ({
      conversationId: uuidv4(),
      user: sourceUserId,
      tenantId: 'tenant-a',
      endpoint: EModelEndpoint.openAI,
    }));
    const targetConvos = Array.from({ length: 5 }, () => ({
      conversationId: uuidv4(),
      user: targetUserId,
      tenantId: targetTenantId,
      endpoint: EModelEndpoint.openAI,
    }));
    await Conversation.create([...sourceConvos, ...targetConvos]);

    const targetBefore = await Conversation.countDocuments({ user: targetUserId });
    expect(targetBefore).toBe(5);

    await runAsSystem(() =>
      methods.reassignUserData({
        sourceUserId,
        targetUserId,
        targetTenantId,
        scopes: ['conversation'],
      }),
    );

    const targetAfter = await Conversation.countDocuments({ user: targetUserId });
    expect(targetAfter).toBe(15);

    const sourceAfter = await Conversation.countDocuments({ user: sourceUserId });
    expect(sourceAfter).toBe(0);

    const originalTargetIds = new Set(targetConvos.map((convo) => convo.conversationId));
    const stillOwnedByTarget = await Conversation.find({
      user: targetUserId,
      conversationId: { $in: [...originalTargetIds] },
    }).lean();
    expect(stillOwnedByTarget).toHaveLength(5);
  });

  test('reassignUserData skips conversation tags with name conflicts', async () => {
    const ConversationTag = mongoose.models.ConversationTag;
    await ConversationTag.create([
      { user: sourceUserId, tag: 'work', tenantId: 'tenant-a' },
      { user: sourceUserId, tag: 'personal', tenantId: 'tenant-a' },
      { user: targetUserId, tag: 'work', tenantId: targetTenantId },
    ]);

    const results = await runAsSystem(() =>
      methods.reassignUserData({
        sourceUserId,
        targetUserId,
        targetTenantId,
        scopes: ['conversationTag'],
      }),
    );

    expect(results[0]).toEqual(
      expect.objectContaining({
        scopeKey: 'conversationTag',
        matched: 2,
        modified: 1,
        skipped: 1,
      }),
    );

    const sourceTags = await ConversationTag.find({ user: sourceUserId }).lean();
    expect(sourceTags).toHaveLength(1);
    expect(sourceTags[0]?.tag).toBe('work');

    const targetTags = await ConversationTag.find({ user: targetUserId }).lean();
    expect(targetTags.map((tag) => tag.tag).sort()).toEqual(['personal', 'work']);
  });

  test('reassignUserData merges balance into existing target balance', async () => {
    const Balance = mongoose.models.Balance;
    await Balance.create([
      { user: new mongoose.Types.ObjectId(sourceUserId), tokenCredits: 50, tenantId: 'tenant-a' },
      {
        user: new mongoose.Types.ObjectId(targetUserId),
        tokenCredits: 100,
        tenantId: targetTenantId,
      },
    ]);

    const results = await runAsSystem(() =>
      methods.reassignUserData({
        sourceUserId,
        targetUserId,
        targetTenantId,
        scopes: ['balance'],
      }),
    );

    expect(results[0]).toEqual(
      expect.objectContaining({
        scopeKey: 'balance',
        modified: 1,
      }),
    );

    const targetBalance = await Balance.findOne({
      user: new mongoose.Types.ObjectId(targetUserId),
    }).lean<IBalance>();
    expect(targetBalance?.tokenCredits).toBe(150);

    const sourceBalance = await Balance.findOne({
      user: new mongoose.Types.ObjectId(sourceUserId),
    }).lean();
    expect(sourceBalance).toBeNull();
  });

  test('reassignUserData reassigns ACL principal entries', async () => {
    const AclEntry = mongoose.models.AclEntry;
    const resourceId = new mongoose.Types.ObjectId();
    await AclEntry.create({
      principalType: PrincipalType.USER,
      principalModel: PrincipalModel.USER,
      principalId: new mongoose.Types.ObjectId(sourceUserId),
      resourceType: 'agent',
      resourceId,
      permBits: 1,
      tenantId: 'tenant-a',
    });

    await runAsSystem(() =>
      methods.reassignUserData({
        sourceUserId,
        targetUserId,
        targetTenantId,
        scopes: ['aclEntry'],
      }),
    );

    const sourceEntries = await AclEntry.countDocuments({
      principalType: PrincipalType.USER,
      principalId: new mongoose.Types.ObjectId(sourceUserId),
    });
    expect(sourceEntries).toBe(0);

    const targetEntries = await AclEntry.findOne({
      principalType: PrincipalType.USER,
      principalId: new mongoose.Types.ObjectId(targetUserId),
    }).lean<IAclEntry>();
    expect(targetEntries?.resourceId?.toString()).toBe(resourceId.toString());
    expect(targetEntries?.tenantId).toBe(targetTenantId);
  });
});
