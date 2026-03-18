const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { actionSchema } = require('@librechat/data-schemas');
const { updateAction, getActions, deleteAction } = require('./Action');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  if (!mongoose.models.Action) {
    mongoose.model('Action', actionSchema);
  }
  await mongoose.connect(mongoUri);
}, 20000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.Action.deleteMany({});
});

const userId = new mongoose.Types.ObjectId();

describe('Action ownership scoping', () => {
  describe('updateAction', () => {
    it('updates when action_id and agent_id both match', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_1',
        agent_id: 'agent_A',
        metadata: { domain: 'example.com' },
      });

      const result = await updateAction(
        { action_id: 'act_1', agent_id: 'agent_A' },
        { metadata: { domain: 'updated.com' } },
      );

      expect(result).not.toBeNull();
      expect(result.metadata.domain).toBe('updated.com');
      expect(result.agent_id).toBe('agent_A');
    });

    it('does not update when agent_id does not match (creates a new doc via upsert)', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_1',
        agent_id: 'agent_B',
        metadata: { domain: 'victim.com', api_key: 'secret' },
      });

      const result = await updateAction(
        { action_id: 'act_1', agent_id: 'agent_A' },
        { user: userId, metadata: { domain: 'attacker.com' } },
      );

      expect(result.metadata.domain).toBe('attacker.com');

      const original = await mongoose.models.Action.findOne({
        action_id: 'act_1',
        agent_id: 'agent_B',
      }).lean();
      expect(original).not.toBeNull();
      expect(original.metadata.domain).toBe('victim.com');
      expect(original.metadata.api_key).toBe('secret');
    });

    it('updates when action_id and assistant_id both match', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_2',
        assistant_id: 'asst_X',
        metadata: { domain: 'example.com' },
      });

      const result = await updateAction(
        { action_id: 'act_2', assistant_id: 'asst_X' },
        { metadata: { domain: 'updated.com' } },
      );

      expect(result).not.toBeNull();
      expect(result.metadata.domain).toBe('updated.com');
    });

    it('does not overwrite when assistant_id does not match', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_2',
        assistant_id: 'asst_victim',
        metadata: { domain: 'victim.com', api_key: 'secret' },
      });

      await updateAction(
        { action_id: 'act_2', assistant_id: 'asst_attacker' },
        { user: userId, metadata: { domain: 'attacker.com' } },
      );

      const original = await mongoose.models.Action.findOne({
        action_id: 'act_2',
        assistant_id: 'asst_victim',
      }).lean();
      expect(original).not.toBeNull();
      expect(original.metadata.domain).toBe('victim.com');
      expect(original.metadata.api_key).toBe('secret');
    });
  });

  describe('deleteAction', () => {
    it('deletes when action_id and agent_id both match', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_del',
        agent_id: 'agent_A',
        metadata: { domain: 'example.com' },
      });

      const result = await deleteAction({ action_id: 'act_del', agent_id: 'agent_A' });
      expect(result).not.toBeNull();
      expect(result.action_id).toBe('act_del');

      const remaining = await mongoose.models.Action.countDocuments();
      expect(remaining).toBe(0);
    });

    it('returns null and preserves the document when agent_id does not match', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_del',
        agent_id: 'agent_B',
        metadata: { domain: 'victim.com' },
      });

      const result = await deleteAction({ action_id: 'act_del', agent_id: 'agent_A' });
      expect(result).toBeNull();

      const remaining = await mongoose.models.Action.countDocuments();
      expect(remaining).toBe(1);
    });

    it('deletes when action_id and assistant_id both match', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_del_asst',
        assistant_id: 'asst_X',
        metadata: { domain: 'example.com' },
      });

      const result = await deleteAction({ action_id: 'act_del_asst', assistant_id: 'asst_X' });
      expect(result).not.toBeNull();

      const remaining = await mongoose.models.Action.countDocuments();
      expect(remaining).toBe(0);
    });

    it('returns null and preserves the document when assistant_id does not match', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_del_asst',
        assistant_id: 'asst_victim',
        metadata: { domain: 'victim.com' },
      });

      const result = await deleteAction({
        action_id: 'act_del_asst',
        assistant_id: 'asst_attacker',
      });
      expect(result).toBeNull();

      const remaining = await mongoose.models.Action.countDocuments();
      expect(remaining).toBe(1);
    });
  });

  describe('getActions (unscoped baseline)', () => {
    it('returns actions by action_id regardless of agent_id', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_shared',
        agent_id: 'agent_B',
        metadata: { domain: 'example.com' },
      });

      const results = await getActions({ action_id: 'act_shared' }, true);
      expect(results).toHaveLength(1);
      expect(results[0].agent_id).toBe('agent_B');
    });

    it('returns actions scoped by agent_id when provided', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_scoped',
        agent_id: 'agent_A',
        metadata: { domain: 'a.com' },
      });
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_other',
        agent_id: 'agent_B',
        metadata: { domain: 'b.com' },
      });

      const results = await getActions({ agent_id: 'agent_A' });
      expect(results).toHaveLength(1);
      expect(results[0].action_id).toBe('act_scoped');
    });
  });

  describe('cross-type protection', () => {
    it('updateAction with agent_id filter does not overwrite assistant-owned action', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_cross',
        assistant_id: 'asst_victim',
        metadata: { domain: 'victim.com', api_key: 'secret' },
      });

      await updateAction(
        { action_id: 'act_cross', agent_id: 'agent_attacker' },
        { user: userId, metadata: { domain: 'evil.com' } },
      );

      const original = await mongoose.models.Action.findOne({
        action_id: 'act_cross',
        assistant_id: 'asst_victim',
      }).lean();
      expect(original).not.toBeNull();
      expect(original.metadata.domain).toBe('victim.com');
      expect(original.metadata.api_key).toBe('secret');
    });

    it('deleteAction with agent_id filter does not delete assistant-owned action', async () => {
      await mongoose.models.Action.create({
        user: userId,
        action_id: 'act_cross_del',
        assistant_id: 'asst_victim',
        metadata: { domain: 'victim.com' },
      });

      const result = await deleteAction({ action_id: 'act_cross_del', agent_id: 'agent_attacker' });
      expect(result).toBeNull();

      const remaining = await mongoose.models.Action.countDocuments();
      expect(remaining).toBe(1);
    });
  });
});
