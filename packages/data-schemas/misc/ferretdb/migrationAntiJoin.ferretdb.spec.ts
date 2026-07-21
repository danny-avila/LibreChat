import mongoose, { Schema, Types } from 'mongoose';

/**
 * Integration tests for migration anti-join → $nin replacement.
 *
 * The original migration scripts used a $lookup + $filter + $match({ $size: 0 })
 * anti-join to find resources without ACL entries. FerretDB does not support
 * $lookup, so this was replaced with a two-step pattern:
 *   1. AclEntry.distinct('resourceId', { resourceType, principalType })
 *   2. Model.find({ _id: { $nin: migratedIds }, ... })
 *
 * Run against FerretDB:
 *   FERRETDB_URI="mongodb://ferretdb:ferretdb@127.0.0.1:27020/migration_antijoin_test" npx jest migrationAntiJoin.ferretdb
 *
 * Run against MongoDB (for parity):
 *   FERRETDB_URI="mongodb://127.0.0.1:27017/migration_antijoin_test" npx jest migrationAntiJoin.ferretdb
 */

const FERRETDB_URI = process.env.FERRETDB_URI;

const describeIfFerretDB = FERRETDB_URI ? describe : describe.skip;

const agentSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  author: { type: String },
});

const promptGroupSchema = new Schema({
  name: { type: String, required: true },
  author: { type: String },
  authorName: { type: String },
  category: { type: String },
});

const aclEntrySchema = new Schema(
  {
    principalType: { type: String, required: true },
    principalId: { type: Schema.Types.Mixed },
    resourceType: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    permBits: { type: Number, default: 1 },
    roleId: { type: Schema.Types.ObjectId },
    grantedBy: { type: Schema.Types.ObjectId },
    grantedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

type AgentDoc = mongoose.InferSchemaType<typeof agentSchema>;
type PromptGroupDoc = mongoose.InferSchemaType<typeof promptGroupSchema>;
type AclEntryDoc = mongoose.InferSchemaType<typeof aclEntrySchema>;

describeIfFerretDB('Migration anti-join → $nin - FerretDB compatibility', () => {
  let Agent: mongoose.Model<AgentDoc>;
  let PromptGroup: mongoose.Model<PromptGroupDoc>;
  let AclEntry: mongoose.Model<AclEntryDoc>;

  beforeAll(async () => {
    await mongoose.connect(FERRETDB_URI as string);
    Agent = mongoose.model('TestMigAgent', agentSchema);
    PromptGroup = mongoose.model('TestMigPromptGroup', promptGroupSchema);
    AclEntry = mongoose.model('TestMigAclEntry', aclEntrySchema);
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Agent.deleteMany({});
    await PromptGroup.deleteMany({});
    await AclEntry.deleteMany({});
  });

  describe('agent migration pattern', () => {
    it('should return only agents WITHOUT user-type ACL entries', async () => {
      const agent1 = await Agent.create({ id: 'agent_1', name: 'Migrated Agent', author: 'user1' });
      const agent2 = await Agent.create({
        id: 'agent_2',
        name: 'Unmigrated Agent',
        author: 'user2',
      });
      await Agent.create({ id: 'agent_3', name: 'Another Unmigrated', author: 'user3' });

      await AclEntry.create({
        principalType: 'user',
        principalId: new Types.ObjectId(),
        resourceType: 'agent',
        resourceId: agent1._id,
      });

      await AclEntry.create({
        principalType: 'public',
        resourceType: 'agent',
        resourceId: agent2._id,
      });

      const migratedIds = await AclEntry.distinct('resourceId', {
        resourceType: 'agent',
        principalType: 'user',
      });

      const toMigrate = await Agent.find({
        _id: { $nin: migratedIds },
        author: { $exists: true, $ne: null },
      })
        .select('_id id name author')
        .lean();

      expect(toMigrate).toHaveLength(2);
      const names = toMigrate.map((a: Record<string, unknown>) => a.name).sort();
      expect(names).toEqual(['Another Unmigrated', 'Unmigrated Agent']);
    });

    it('should exclude agents without an author', async () => {
      await Agent.create({ id: 'agent_no_author', name: 'No Author' });
      await Agent.create({ id: 'agent_null_author', name: 'Null Author', author: null });
      await Agent.create({ id: 'agent_with_author', name: 'Has Author', author: 'user1' });

      const migratedIds = await AclEntry.distinct('resourceId', {
        resourceType: 'agent',
        principalType: 'user',
      });

      const toMigrate = await Agent.find({
        _id: { $nin: migratedIds },
        author: { $exists: true, $ne: null },
      })
        .select('_id id name author')
        .lean();

      expect(toMigrate).toHaveLength(1);
      expect((toMigrate[0] as Record<string, unknown>).name).toBe('Has Author');
    });

    it('should return empty array when all agents are migrated', async () => {
      const agent1 = await Agent.create({ id: 'a1', name: 'Agent 1', author: 'user1' });
      const agent2 = await Agent.create({ id: 'a2', name: 'Agent 2', author: 'user2' });

      await AclEntry.create([
        {
          principalType: 'user',
          principalId: new Types.ObjectId(),
          resourceType: 'agent',
          resourceId: agent1._id,
        },
        {
          principalType: 'user',
          principalId: new Types.ObjectId(),
          resourceType: 'agent',
          resourceId: agent2._id,
        },
      ]);

      const migratedIds = await AclEntry.distinct('resourceId', {
        resourceType: 'agent',
        principalType: 'user',
      });

      const toMigrate = await Agent.find({
        _id: { $nin: migratedIds },
        author: { $exists: true, $ne: null },
      }).lean();

      expect(toMigrate).toHaveLength(0);
    });

    it('should not be confused by ACL entries for a different resourceType', async () => {
      const agent = await Agent.create({ id: 'a1', name: 'Agent', author: 'user1' });

      await AclEntry.create({
        principalType: 'user',
        principalId: new Types.ObjectId(),
        resourceType: 'promptGroup',
        resourceId: agent._id,
      });

      const migratedIds = await AclEntry.distinct('resourceId', {
        resourceType: 'agent',
        principalType: 'user',
      });

      const toMigrate = await Agent.find({
        _id: { $nin: migratedIds },
        author: { $exists: true, $ne: null },
      }).lean();

      expect(toMigrate).toHaveLength(1);
      expect((toMigrate[0] as Record<string, unknown>).name).toBe('Agent');
    });

    it('should return correct projected fields', async () => {
      await Agent.create({
        id: 'proj_agent',
        name: 'Field Test',
        author: 'user1',
      });

      const migratedIds = await AclEntry.distinct('resourceId', {
        resourceType: 'agent',
        principalType: 'user',
      });

      const toMigrate = await Agent.find({
        _id: { $nin: migratedIds },
        author: { $exists: true, $ne: null },
      })
        .select('_id id name author')
        .lean();

      expect(toMigrate).toHaveLength(1);
      const agent = toMigrate[0] as Record<string, unknown>;
      expect(agent).toHaveProperty('_id');
      expect(agent).toHaveProperty('id', 'proj_agent');
      expect(agent).toHaveProperty('name', 'Field Test');
      expect(agent).toHaveProperty('author', 'user1');
    });
  });

  describe('promptGroup migration pattern', () => {
    it('should return only prompt groups WITHOUT user-type ACL entries', async () => {
      const pg1 = await PromptGroup.create({
        name: 'Migrated PG',
        author: 'user1',
        category: 'code',
      });
      await PromptGroup.create({ name: 'Unmigrated PG', author: 'user2', category: 'writing' });

      await AclEntry.create({
        principalType: 'user',
        principalId: new Types.ObjectId(),
        resourceType: 'promptGroup',
        resourceId: pg1._id,
      });

      const migratedIds = await AclEntry.distinct('resourceId', {
        resourceType: 'promptGroup',
        principalType: 'user',
      });

      const toMigrate = await PromptGroup.find({
        _id: { $nin: migratedIds },
        author: { $exists: true, $ne: null },
      })
        .select('_id name author authorName category')
        .lean();

      expect(toMigrate).toHaveLength(1);
      expect((toMigrate[0] as Record<string, unknown>).name).toBe('Unmigrated PG');
    });

    it('should return correct projected fields for prompt groups', async () => {
      await PromptGroup.create({
        name: 'PG Fields',
        author: 'user1',
        authorName: 'Test User',
        category: 'marketing',
      });

      const migratedIds = await AclEntry.distinct('resourceId', {
        resourceType: 'promptGroup',
        principalType: 'user',
      });

      const toMigrate = await PromptGroup.find({
        _id: { $nin: migratedIds },
        author: { $exists: true, $ne: null },
      })
        .select('_id name author authorName category')
        .lean();

      expect(toMigrate).toHaveLength(1);
      const pg = toMigrate[0] as Record<string, unknown>;
      expect(pg).toHaveProperty('_id');
      expect(pg).toHaveProperty('name', 'PG Fields');
      expect(pg).toHaveProperty('author', 'user1');
      expect(pg).toHaveProperty('authorName', 'Test User');
      expect(pg).toHaveProperty('category', 'marketing');
    });
  });

  describe('cross-resource isolation', () => {
    it('should independently track agent and promptGroup migrations', async () => {
      const agent = await Agent.create({
        id: 'iso_agent',
        name: 'Isolated Agent',
        author: 'user1',
      });
      await PromptGroup.create({ name: 'Isolated PG', author: 'user2' });

      await AclEntry.create({
        principalType: 'user',
        principalId: new Types.ObjectId(),
        resourceType: 'agent',
        resourceId: agent._id,
      });

      const migratedAgentIds = await AclEntry.distinct('resourceId', {
        resourceType: 'agent',
        principalType: 'user',
      });
      const migratedPGIds = await AclEntry.distinct('resourceId', {
        resourceType: 'promptGroup',
        principalType: 'user',
      });

      const agentsToMigrate = await Agent.find({
        _id: { $nin: migratedAgentIds },
        author: { $exists: true, $ne: null },
      }).lean();

      const pgsToMigrate = await PromptGroup.find({
        _id: { $nin: migratedPGIds },
        author: { $exists: true, $ne: null },
      }).lean();

      expect(agentsToMigrate).toHaveLength(0);
      expect(pgsToMigrate).toHaveLength(1);
    });
  });

  describe('scale behavior', () => {
    it('should correctly handle many resources with partial migration', async () => {
      const agents = [];
      for (let i = 0; i < 20; i++) {
        agents.push({ id: `agent_${i}`, name: `Agent ${i}`, author: `user_${i}` });
      }
      const created = await Agent.insertMany(agents);

      const migrateEvens = created
        .filter((_, i) => i % 2 === 0)
        .map((a) => ({
          principalType: 'user',
          principalId: new Types.ObjectId(),
          resourceType: 'agent',
          resourceId: a._id,
        }));
      await AclEntry.insertMany(migrateEvens);

      const migratedIds = await AclEntry.distinct('resourceId', {
        resourceType: 'agent',
        principalType: 'user',
      });

      const toMigrate = await Agent.find({
        _id: { $nin: migratedIds },
        author: { $exists: true, $ne: null },
      }).lean();

      expect(toMigrate).toHaveLength(10);
      const indices = toMigrate
        .map((a) => parseInt(String(a.name).replace('Agent ', ''), 10))
        .sort((a, b) => a - b);
      expect(indices).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
    });
  });
});
