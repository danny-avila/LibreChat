import mongoose, { Schema, Types } from 'mongoose';

/**
 * Integration tests for $pullAll compatibility with FerretDB.
 *
 * These tests verify that the $pull → $pullAll migration works
 * identically on both MongoDB and FerretDB by running against
 * a real database specified via FERRETDB_URI env var.
 *
 * Run against FerretDB:
 *   FERRETDB_URI="mongodb://ferretdb:ferretdb@127.0.0.1:27020/pullall_test" npx jest pullAll.ferretdb
 *
 * Run against MongoDB (for parity):
 *   FERRETDB_URI="mongodb://127.0.0.1:27017/pullall_test" npx jest pullAll.ferretdb
 */

const FERRETDB_URI = process.env.FERRETDB_URI;

const describeIfFerretDB = FERRETDB_URI ? describe : describe.skip;

const groupSchema = new Schema({
  name: { type: String, required: true },
  memberIds: [{ type: String }],
});

const conversationSchema = new Schema({
  conversationId: { type: String, required: true, unique: true },
  user: { type: String },
  tags: { type: [String], default: [] },
});

const projectSchema = new Schema({
  name: { type: String, required: true },
  promptGroupIds: { type: [Schema.Types.ObjectId], default: [] },
  agentIds: { type: [String], default: [] },
});

const agentSchema = new Schema({
  name: { type: String, required: true },
  projectIds: { type: [String], default: [] },
  tool_resources: { type: Schema.Types.Mixed, default: {} },
});

describeIfFerretDB('$pullAll FerretDB compatibility', () => {
  let Group: mongoose.Model<unknown>;
  let Conversation: mongoose.Model<unknown>;
  let Project: mongoose.Model<unknown>;
  let Agent: mongoose.Model<unknown>;

  beforeAll(async () => {
    await mongoose.connect(FERRETDB_URI as string);

    Group = mongoose.models.FDBGroup || mongoose.model('FDBGroup', groupSchema);
    Conversation =
      mongoose.models.FDBConversation || mongoose.model('FDBConversation', conversationSchema);
    Project = mongoose.models.FDBProject || mongoose.model('FDBProject', projectSchema);
    Agent = mongoose.models.FDBAgent || mongoose.model('FDBAgent', agentSchema);

    await Group.createCollection();
    await Conversation.createCollection();
    await Project.createCollection();
    await Agent.createCollection();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  afterEach(async () => {
    await Group.deleteMany({});
    await Conversation.deleteMany({});
    await Project.deleteMany({});
    await Agent.deleteMany({});
  });

  describe('scalar $pullAll (single value wrapped in array)', () => {
    it('should remove a single memberId from a group', async () => {
      const userId = new Types.ObjectId().toString();
      const otherUserId = new Types.ObjectId().toString();

      await Group.create({
        name: 'Test Group',
        memberIds: [userId, otherUserId],
      });

      await Group.updateMany({ memberIds: userId }, { $pullAll: { memberIds: [userId] } });

      const updated = await Group.findOne({ name: 'Test Group' }).lean();
      const doc = updated as Record<string, unknown>;
      expect(doc.memberIds).toEqual([otherUserId]);
    });

    it('should remove a memberId from multiple groups at once', async () => {
      const userId = new Types.ObjectId().toString();

      await Group.create([
        { name: 'Group A', memberIds: [userId, 'other-1'] },
        { name: 'Group B', memberIds: [userId, 'other-2'] },
        { name: 'Group C', memberIds: ['other-3'] },
      ]);

      await Group.updateMany({ memberIds: userId }, { $pullAll: { memberIds: [userId] } });

      const groups = await Group.find({}).sort({ name: 1 }).lean();
      const docs = groups as Array<Record<string, unknown>>;
      expect(docs[0].memberIds).toEqual(['other-1']);
      expect(docs[1].memberIds).toEqual(['other-2']);
      expect(docs[2].memberIds).toEqual(['other-3']);
    });

    it('should remove a tag from conversations', async () => {
      const user = 'user-123';
      const tag = 'important';

      await Conversation.create([
        { conversationId: 'conv-1', user, tags: [tag, 'other'] },
        { conversationId: 'conv-2', user, tags: [tag] },
        { conversationId: 'conv-3', user, tags: ['other'] },
      ]);

      await Conversation.updateMany({ user, tags: tag }, { $pullAll: { tags: [tag] } });

      const convos = await Conversation.find({}).sort({ conversationId: 1 }).lean();
      const docs = convos as Array<Record<string, unknown>>;
      expect(docs[0].tags).toEqual(['other']);
      expect(docs[1].tags).toEqual([]);
      expect(docs[2].tags).toEqual(['other']);
    });

    it('should remove a single agentId from all projects', async () => {
      const agentId = 'agent-to-remove';

      await Project.create([
        { name: 'Proj A', agentIds: [agentId, 'agent-keep'] },
        { name: 'Proj B', agentIds: ['agent-keep'] },
      ]);

      await Project.updateMany({}, { $pullAll: { agentIds: [agentId] } });

      const projects = await Project.find({}).sort({ name: 1 }).lean();
      const docs = projects as Array<Record<string, unknown>>;
      expect(docs[0].agentIds).toEqual(['agent-keep']);
      expect(docs[1].agentIds).toEqual(['agent-keep']);
    });

    it('should be a no-op when the value does not exist in the array', async () => {
      await Group.create({ name: 'Stable Group', memberIds: ['a', 'b'] });

      await Group.updateMany(
        { memberIds: 'nonexistent' },
        { $pullAll: { memberIds: ['nonexistent'] } },
      );

      const group = await Group.findOne({ name: 'Stable Group' }).lean();
      const doc = group as Record<string, unknown>;
      expect(doc.memberIds).toEqual(['a', 'b']);
    });
  });

  describe('multi-value $pullAll (replacing $pull + $in)', () => {
    it('should remove multiple promptGroupIds from a project', async () => {
      const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];

      await Project.create({
        name: 'Test Project',
        promptGroupIds: ids,
      });

      const toRemove = [ids[0], ids[2]];
      await Project.findOneAndUpdate(
        { name: 'Test Project' },
        { $pullAll: { promptGroupIds: toRemove } },
        { new: true },
      );

      const updated = await Project.findOne({ name: 'Test Project' }).lean();
      const doc = updated as Record<string, unknown>;
      const remaining = (doc.promptGroupIds as Types.ObjectId[]).map((id) => id.toString());
      expect(remaining).toEqual([ids[1].toString()]);
    });

    it('should remove multiple agentIds from a project', async () => {
      await Project.create({
        name: 'Agent Project',
        agentIds: ['a1', 'a2', 'a3', 'a4'],
      });

      await Project.findOneAndUpdate(
        { name: 'Agent Project' },
        { $pullAll: { agentIds: ['a1', 'a3'] } },
        { new: true },
      );

      const updated = await Project.findOne({ name: 'Agent Project' }).lean();
      const doc = updated as Record<string, unknown>;
      expect(doc.agentIds).toEqual(['a2', 'a4']);
    });

    it('should remove projectIds from an agent', async () => {
      await Agent.create({
        name: 'Test Agent',
        projectIds: ['p1', 'p2', 'p3'],
      });

      await Agent.findOneAndUpdate(
        { name: 'Test Agent' },
        { $pullAll: { projectIds: ['p1', 'p3'] } },
        { new: true },
      );

      const updated = await Agent.findOne({ name: 'Test Agent' }).lean();
      const doc = updated as Record<string, unknown>;
      expect(doc.projectIds).toEqual(['p2']);
    });

    it('should handle removing from nested dynamic paths (tool_resources)', async () => {
      await Agent.create({
        name: 'Resource Agent',
        tool_resources: {
          code_interpreter: { file_ids: ['f1', 'f2', 'f3'] },
          file_search: { file_ids: ['f4', 'f5'] },
        },
      });

      const pullAllOps: Record<string, string[]> = {};
      const filesByResource = {
        code_interpreter: ['f1', 'f3'],
        file_search: ['f5'],
      };

      for (const [resource, fileIds] of Object.entries(filesByResource)) {
        pullAllOps[`tool_resources.${resource}.file_ids`] = fileIds;
      }

      await Agent.findOneAndUpdate(
        { name: 'Resource Agent' },
        { $pullAll: pullAllOps },
        { new: true },
      );

      const updated = await Agent.findOne({ name: 'Resource Agent' }).lean();
      const doc = updated as unknown as Record<string, { [key: string]: { file_ids: string[] } }>;
      expect(doc.tool_resources.code_interpreter.file_ids).toEqual(['f2']);
      expect(doc.tool_resources.file_search.file_ids).toEqual(['f4']);
    });

    it('should handle empty array (no-op)', async () => {
      await Project.create({
        name: 'Unchanged',
        agentIds: ['a1', 'a2'],
      });

      await Project.findOneAndUpdate(
        { name: 'Unchanged' },
        { $pullAll: { agentIds: [] } },
        { new: true },
      );

      const updated = await Project.findOne({ name: 'Unchanged' }).lean();
      const doc = updated as Record<string, unknown>;
      expect(doc.agentIds).toEqual(['a1', 'a2']);
    });

    it('should handle values not present in the array', async () => {
      await Project.create({
        name: 'Partial',
        agentIds: ['a1', 'a2'],
      });

      await Project.findOneAndUpdate(
        { name: 'Partial' },
        { $pullAll: { agentIds: ['a1', 'nonexistent'] } },
        { new: true },
      );

      const updated = await Project.findOne({ name: 'Partial' }).lean();
      const doc = updated as Record<string, unknown>;
      expect(doc.agentIds).toEqual(['a2']);
    });
  });

  describe('duplicate handling', () => {
    it('should remove all occurrences of a duplicated value', async () => {
      await Group.create({
        name: 'Dupes Group',
        memberIds: ['a', 'b', 'a', 'c', 'a'],
      });

      await Group.updateMany({ name: 'Dupes Group' }, { $pullAll: { memberIds: ['a'] } });

      const updated = await Group.findOne({ name: 'Dupes Group' }).lean();
      const doc = updated as Record<string, unknown>;
      expect(doc.memberIds).toEqual(['b', 'c']);
    });
  });
});
