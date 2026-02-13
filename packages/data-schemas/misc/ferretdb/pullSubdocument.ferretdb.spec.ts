import mongoose, { Schema } from 'mongoose';

/**
 * Integration tests to verify whether $pull with condition objects
 * works on FerretDB v2.x. The v1.24 docs listed $pull as supported,
 * but the v2.x array update operator docs only list $push, $addToSet,
 * $pop, and $pullAll.
 *
 * This test covers the 3 patterns used in api/models/Agent.js:
 *   1. $pull { edges: { to: id } }           -- simple condition object
 *   2. $pull { favorites: { agentId: id } }   -- single scalar match
 *   3. $pull { favorites: { agentId: { $in: [...] } } } -- $in condition
 *
 * Run against FerretDB:
 *   FERRETDB_URI="mongodb://ferretdb:ferretdb@127.0.0.1:27020/pull_subdoc_test" npx jest pullSubdocument.ferretdb
 *
 * Run against MongoDB (for parity):
 *   FERRETDB_URI="mongodb://127.0.0.1:27017/pull_subdoc_test" npx jest pullSubdocument.ferretdb
 */

const FERRETDB_URI = process.env.FERRETDB_URI;
const describeIfFerretDB = FERRETDB_URI ? describe : describe.skip;

const agentSchema = new Schema({
  name: { type: String, required: true },
  edges: { type: [Schema.Types.Mixed], default: [] },
});

const userSchema = new Schema({
  name: { type: String, required: true },
  favorites: {
    type: [
      {
        _id: false,
        agentId: String,
        model: String,
        endpoint: String,
      },
    ],
    default: [],
  },
});

type AgentDoc = mongoose.InferSchemaType<typeof agentSchema>;
type UserDoc = mongoose.InferSchemaType<typeof userSchema>;

describeIfFerretDB('$pull with condition objects - FerretDB v2 verification', () => {
  let Agent: mongoose.Model<AgentDoc>;
  let User: mongoose.Model<UserDoc>;

  beforeAll(async () => {
    await mongoose.connect(FERRETDB_URI as string);
    Agent = mongoose.model('TestPullAgent', agentSchema);
    User = mongoose.model('TestPullUser', userSchema);
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Agent.deleteMany({});
    await User.deleteMany({});
  });

  describe('Pattern 1: $pull { edges: { to: id } }', () => {
    it('should remove edge subdocuments matching a condition', async () => {
      await Agent.create({
        name: 'Agent A',
        edges: [
          { from: 'a', to: 'b', edgeType: 'handoff' },
          { from: 'a', to: 'c', edgeType: 'direct' },
          { from: 'a', to: 'b', edgeType: 'direct' },
        ],
      });

      await Agent.updateMany({ 'edges.to': 'b' }, { $pull: { edges: { to: 'b' } } });

      const result = await Agent.findOne({ name: 'Agent A' }).lean();
      expect(result?.edges).toHaveLength(1);
      expect((result?.edges[0] as Record<string, unknown>).to).toBe('c');
    });

    it('should not affect agents without matching edges', async () => {
      await Agent.create({
        name: 'Agent B',
        edges: [{ from: 'x', to: 'y' }],
      });

      await Agent.updateMany({ 'edges.to': 'z' }, { $pull: { edges: { to: 'z' } } });

      const result = await Agent.findOne({ name: 'Agent B' }).lean();
      expect(result?.edges).toHaveLength(1);
    });
  });

  describe('Pattern 2: $pull { favorites: { agentId: id } }', () => {
    it('should remove favorite subdocuments matching agentId', async () => {
      await User.create({
        name: 'User 1',
        favorites: [
          { agentId: 'agent_1' },
          { agentId: 'agent_2' },
          { model: 'gpt-4', endpoint: 'openAI' },
        ],
      });

      await User.updateMany(
        { 'favorites.agentId': 'agent_1' },
        { $pull: { favorites: { agentId: 'agent_1' } } },
      );

      const result = await User.findOne({ name: 'User 1' }).lean();
      expect(result?.favorites).toHaveLength(2);

      const agentIds = result?.favorites.map((f) => f.agentId).filter(Boolean);
      expect(agentIds).toEqual(['agent_2']);
    });

    it('should remove from multiple users at once', async () => {
      await User.create([
        {
          name: 'User A',
          favorites: [{ agentId: 'target' }, { agentId: 'keep' }],
        },
        {
          name: 'User B',
          favorites: [{ agentId: 'target' }],
        },
        {
          name: 'User C',
          favorites: [{ agentId: 'keep' }],
        },
      ]);

      await User.updateMany(
        { 'favorites.agentId': 'target' },
        { $pull: { favorites: { agentId: 'target' } } },
      );

      const users = await User.find({}).sort({ name: 1 }).lean();
      expect(users[0].favorites).toHaveLength(1);
      expect(users[0].favorites[0].agentId).toBe('keep');
      expect(users[1].favorites).toHaveLength(0);
      expect(users[2].favorites).toHaveLength(1);
      expect(users[2].favorites[0].agentId).toBe('keep');
    });
  });

  describe('Pattern 3: $pull { favorites: { agentId: { $in: [...] } } }', () => {
    it('should remove favorites matching any agentId in the array', async () => {
      await User.create({
        name: 'Bulk User',
        favorites: [
          { agentId: 'a1' },
          { agentId: 'a2' },
          { agentId: 'a3' },
          { model: 'gpt-4', endpoint: 'openAI' },
        ],
      });

      await User.updateMany(
        { 'favorites.agentId': { $in: ['a1', 'a3'] } },
        { $pull: { favorites: { agentId: { $in: ['a1', 'a3'] } } } },
      );

      const result = await User.findOne({ name: 'Bulk User' }).lean();
      expect(result?.favorites).toHaveLength(2);

      const agentIds = result?.favorites.map((f) => f.agentId).filter(Boolean);
      expect(agentIds).toEqual(['a2']);
    });

    it('should work across multiple users with $in', async () => {
      await User.create([
        {
          name: 'Multi A',
          favorites: [{ agentId: 'x' }, { agentId: 'y' }, { agentId: 'z' }],
        },
        {
          name: 'Multi B',
          favorites: [{ agentId: 'x' }, { agentId: 'z' }],
        },
      ]);

      await User.updateMany(
        { 'favorites.agentId': { $in: ['x', 'y'] } },
        { $pull: { favorites: { agentId: { $in: ['x', 'y'] } } } },
      );

      const users = await User.find({}).sort({ name: 1 }).lean();
      expect(users[0].favorites).toHaveLength(1);
      expect(users[0].favorites[0].agentId).toBe('z');
      expect(users[1].favorites).toHaveLength(1);
      expect(users[1].favorites[0].agentId).toBe('z');
    });
  });
});
