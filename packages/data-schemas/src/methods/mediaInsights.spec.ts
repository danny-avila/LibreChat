import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createTransactionModel } from '../models/transaction';
import { createMediaJobModel } from '../models/media';
import { getMediaInsights } from './mediaInsights';

let mongo: MongoMemoryServer;
const owner = new mongoose.Types.ObjectId();
const otherOwner = new mongoose.Types.ObjectId();
const createdAt = new Date().toISOString();
const options = {
  tenantId: 'tenant-a',
  from: new Date(Date.now() - 60_000),
  to: new Date(Date.now() + 60_000),
  page: 1,
  pageSize: 5,
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  createMediaJobModel(mongoose);
  createTransactionModel(mongoose);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([
    mongoose.models.MediaJob.deleteMany({}),
    mongoose.models.Transaction.deleteMany({}),
  ]);
});

const job = (jobId: string, changes = {}) => ({
  jobId,
  ownerId: owner.toString(),
  tenantId: 'tenant-a',
  createdAt,
  executionOwner: 'media',
  receipt: { phase: 'accepted' },
  phase: 'succeeded',
  execution: { api: 'openai', modelId: 'image-model' },
  operation: 'image.generate',
  provider: { certainty: 'terminal' },
  ...changes,
});
const transaction = (jobId: string, changes = {}) => ({
  user: owner,
  tenantId: 'tenant-a',
  mediaJobId: jobId,
  context: 'media',
  mediaCostUSD: 1,
  mediaCostSource: 'provider',
  ...changes,
});

it('aggregates durable outcomes and the shared ledger without chat, cross-owner or cross-tenant costs', async () => {
  await mongoose.models.MediaJob.collection.insertMany([
    job('known'),
    job('estimated'),
    job('legacy'),
    job('operator', { phase: 'failed', recoveryDecisions: [{ request: { action: 'settle' } }] }),
    job('unknown', { phase: 'requires_attention', provider: { certainty: 'unknown' } }),
    job('cancelled', { phase: 'cancelled', provider: { certainty: 'unsubmitted' } }),
    job('active', { phase: 'queued', provider: { certainty: 'unsubmitted' } }),
    job('native', { executionOwner: 'chat' }),
    job('private', { tenantId: 'tenant-b' }),
    job('unpublished', { receipt: { phase: 'preparing' } }),
  ]);
  await mongoose.models.Transaction.collection.insertMany([
    transaction('known'),
    transaction('estimated', { mediaCostUSD: 2, mediaCostSource: 'estimate' }),
    transaction('legacy', { mediaCostUSD: 3, mediaCostSource: null }),
    transaction('operator', { mediaCostUSD: 4 }),
    transaction('unknown', { tenantId: 'tenant-b', mediaCostUSD: 100 }),
    transaction('unknown', { user: otherOwner, mediaCostUSD: 200 }),
    transaction('known', { context: 'media_debt', mediaCostUSD: 900 }),
  ]);
  const result = await getMediaInsights(mongoose, options);
  expect(result.summary).toEqual({
    submitted: 7,
    completed: 3,
    failed: 1,
    cancelled: 1,
    uncertain: 1,
    active: 1,
    providerCostUSD: 1,
    operatorCostUSD: 4,
    estimatedCostUSD: 2,
    unclassifiedCostUSD: 3,
    unknownCostJobs: 1,
  });
  expect(result.offerings).toHaveLength(1);
  expect(result.offerings[0]).toMatchObject({
    provider: 'openai',
    model: 'image-model',
    operation: 'image.generate',
  });
  expect(JSON.stringify(result)).not.toContain('ownerId');
});

it('treats the default tenant explicitly and keeps every tenant out of its result', async () => {
  await mongoose.models.MediaJob.collection.insertMany([
    job('tenant'),
    job('default', { tenantId: null }),
  ]);
  await mongoose.models.Transaction.collection.insertMany([
    transaction('default', { tenantId: null, mediaCostUSD: 0 }),
  ]);
  const result = await getMediaInsights(mongoose, { ...options, tenantId: undefined });
  expect(result.summary.submitted).toBe(1);
  expect(result.summary.unknownCostJobs).toBe(0);
});

it('paginates offerings while preserving totals and ignores jobs outside the shared date range', async () => {
  await mongoose.models.MediaJob.collection.insertMany([
    ...Array.from({ length: 7 }, (_, i) =>
      job(`job-${i}`, { execution: { api: 'openai', modelId: `model-${i}` } }),
    ),
    job('old', { createdAt: '2000-01-01T00:00:00.000Z' }),
  ]);
  const [first, second] = await Promise.all([
    getMediaInsights(mongoose, options),
    getMediaInsights(mongoose, { ...options, page: 2 }),
  ]);
  expect(first.summary.submitted).toBe(7);
  expect(first.pages).toBe(2);
  expect(first.offerings).toHaveLength(5);
  expect(second.offerings).toHaveLength(2);
  expect(second.summary).toEqual(first.summary);
  expect(new Set([...first.offerings, ...second.offerings].map((row) => row.model)).size).toBe(7);
});
