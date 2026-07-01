import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createAgentJobMethods } from './agentJob';
import { createModels } from '~/models';
import type { IAgentJobDocument } from '~/types/agentJob';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let AgentJob: mongoose.Model<IAgentJobDocument>;
let methods: ReturnType<typeof createAgentJobMethods>;

const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);

  AgentJob = mongoose.models.AgentJob as mongoose.Model<IAgentJobDocument>;
  methods = createAgentJobMethods(mongoose);

  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await AgentJob.deleteMany({});
});

describe('AgentJob methods', () => {
  describe('createAgentJob', () => {
    it('creates a job with sensible defaults', async () => {
      const job = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'conv-1',
        goal: 'Do the thing',
      });

      expect(job.status).toBe('queued');
      expect(job.currentStep).toBe(0);
      expect(job.steps).toHaveLength(0);
      expect(job.maxSteps).toBeGreaterThan(0);
      expect(job.lockedAt ?? null).toBeNull();
    });
  });

  describe('getAgentJobById', () => {
    it('returns the job for its owner', async () => {
      const created = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'conv-1',
        goal: 'Owned job',
      });

      const found = await methods.getAgentJobById(created._id, userId);
      expect(found).not.toBeNull();
      expect(found?.goal).toBe('Owned job');
    });

    it('does not leak jobs across owners', async () => {
      const created = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'conv-1',
        goal: 'Private job',
      });

      const found = await methods.getAgentJobById(created._id, otherUserId);
      expect(found).toBeNull();
    });
  });

  describe('listAgentJobs', () => {
    it('lists only the owner jobs, filtered by status', async () => {
      await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'queued job',
      });
      const running = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c2',
        goal: 'running job',
        status: 'running',
      });
      await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(otherUserId),
        conversationId: 'c3',
        goal: 'other user job',
      });

      const all = await methods.listAgentJobs({ userId });
      expect(all).toHaveLength(2);

      const onlyRunning = await methods.listAgentJobs({ userId, statuses: ['running'] });
      expect(onlyRunning).toHaveLength(1);
      expect(String(onlyRunning[0]._id)).toBe(String(running._id));
    });

    it('filters by conversationId', async () => {
      await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'conv-a',
        goal: 'job a',
      });
      await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'conv-b',
        goal: 'job b',
      });

      const jobs = await methods.listAgentJobs({ userId, conversationId: 'conv-a' });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].conversationId).toBe('conv-a');
    });
  });

  describe('claimDueJob', () => {
    it('claims a queued job and marks it running + locked', async () => {
      const created = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'claim me',
      });

      const now = new Date();
      const claimed = await methods.claimDueJob(now, 'instance-a', 60_000);

      expect(claimed).not.toBeNull();
      expect(String(claimed?._id)).toBe(String(created._id));
      expect(claimed?.status).toBe('running');
      expect(claimed?.lockedBy).toBe('instance-a');
      expect(claimed?.lockedAt).not.toBeNull();
    });

    it('is atomic: a second claimer gets nothing when only one job is due', async () => {
      await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'single job',
      });

      const now = new Date();
      const [first, second] = await Promise.all([
        methods.claimDueJob(now, 'instance-a', 60_000),
        methods.claimDueJob(now, 'instance-b', 60_000),
      ]);

      const claims = [first, second].filter(Boolean);
      expect(claims).toHaveLength(1);
    });

    it('does not reclaim a freshly locked job, but reclaims a stale one', async () => {
      await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'lock test',
      });

      const now = new Date();
      const first = await methods.claimDueJob(now, 'instance-a', 60_000);
      expect(first).not.toBeNull();

      const secondFresh = await methods.claimDueJob(new Date(), 'instance-b', 60_000);
      expect(secondFresh).toBeNull();

      const later = new Date(Date.now() + 120_000);
      const secondStale = await methods.claimDueJob(later, 'instance-b', 60_000);
      expect(secondStale).not.toBeNull();
      expect(secondStale?.lockedBy).toBe('instance-b');
    });

    it('does not claim terminal jobs', async () => {
      await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'done job',
        status: 'done',
      });

      const claimed = await methods.claimDueJob(new Date(), 'instance-a', 60_000);
      expect(claimed).toBeNull();
    });
  });

  describe('recordJobStep', () => {
    it('appends a step, advances the pointer, and releases the lock', async () => {
      const created = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'stepper',
      });
      await methods.claimDueJob(new Date(), 'instance-a', 60_000);

      await methods.recordJobStep(created._id, {
        step: { index: 0, status: 'success', summary: 'did step 0', messageId: 'm0' },
        status: 'running',
        currentStep: 1,
        checkpoint: { stepSummaries: ['did step 0'], lastMessageId: 'm0' },
      });

      const job = await methods.getAgentJobById(created._id, userId);
      expect(job?.steps).toHaveLength(1);
      expect(job?.currentStep).toBe(1);
      expect(job?.status).toBe('running');
      expect(job?.lockedAt ?? null).toBeNull();
      expect(job?.lockedBy ?? null).toBeNull();
    });

    it('records an error step with lastError', async () => {
      const created = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'fails',
      });

      await methods.recordJobStep(created._id, {
        step: { index: 0, status: 'error', summary: 'boom' },
        status: 'error',
        currentStep: 0,
        error: 'boom',
      });

      const job = await methods.getAgentJobById(created._id, userId);
      expect(job?.status).toBe('error');
      expect(job?.lastError).toBe('boom');
    });
  });

  describe('cancelAgentJob', () => {
    it('cancels a running job and releases the lock', async () => {
      const created = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'cancel me',
        status: 'running',
      });

      const canceled = await methods.cancelAgentJob(created._id, userId);
      expect(canceled?.status).toBe('canceled');
      expect(canceled?.lockedAt ?? null).toBeNull();
    });

    it('does not cancel a terminal job', async () => {
      const created = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'already done',
        status: 'done',
      });

      const canceled = await methods.cancelAgentJob(created._id, userId);
      expect(canceled).toBeNull();
    });

    it('does not cancel another owner job', async () => {
      const created = await methods.createAgentJob({
        user: new mongoose.Types.ObjectId(userId),
        conversationId: 'c1',
        goal: 'not yours',
        status: 'running',
      });

      const canceled = await methods.cancelAgentJob(created._id, otherUserId);
      expect(canceled).toBeNull();
    });
  });
});
