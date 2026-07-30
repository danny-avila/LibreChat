import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import type { ConnectOptions, Model } from 'mongoose';
import type { IConversationTag } from '~/schema/conversationTag';
import type * as t from '~/types';
import { decrementTagCounts } from '~/methods/conversationTag';
import { supportsTransactions } from '~/utils/transactions';
import { createScheduleMethods } from '~/methods/schedule';
import { createUserMethods } from '~/methods/user';
import { createFileMethods } from '~/methods/file';
import { createModels } from '~/models';

/**
 * Amazon DocumentDB live-compatibility suite.
 *
 * Exercises the operations that have historically broken on DocumentDB
 * (aggregation-pipeline updates — issue #14488) against a REAL cluster, plus
 * informational capability probes whose results print as a matrix at the end.
 * There is no faithful local emulator of Amazon DocumentDB (the open-source
 * "DocumentDB Local" image is an unrelated PostgreSQL-based engine), so this
 * suite only runs when DOCUMENTDB_URI is set and skips otherwise.
 *
 * Run (from packages/data-schemas, against a DEDICATED database):
 *   DOCUMENTDB_URI="mongodb://user:pass@127.0.0.1:27017/librechat_compat?tls=true&retryWrites=false" \
 *   DOCUMENTDB_TLS_CA_FILE="global-bundle.pem" \
 *     npx jest --config misc/documentdb/jest.documentdb.config.mjs
 *
 * Through an SSH tunnel, additionally set
 *   DOCUMENTDB_TLS_ALLOW_INVALID_HOSTNAMES=true
 * because the tunnel endpoint will not match the cluster certificate.
 *
 * Set DOCUMENTDB_EXPECT_PARTIAL_INDEXES=true when targeting DocumentDB 5.0+
 * instance-based clusters to turn the partial-index probe into a hard assertion.
 */
const DOCUMENTDB_URI = process.env.DOCUMENTDB_URI ?? '';
const describeLive = DOCUMENTDB_URI ? describe : describe.skip;

const HOUR = 3_600_000;
const runId = randomUUID().slice(0, 8);
const capabilities: Record<string, string> = {};

function getDb() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB database handle not available');
  }
  return db;
}

describeLive('Amazon DocumentDB live compatibility', () => {
  let User: Model<t.IUser>;
  let ConversationTag: Model<IConversationTag>;
  let userMethods: ReturnType<typeof createUserMethods>;
  let fileMethods: ReturnType<typeof createFileMethods>;

  const testEmail = (label: string) => `${label}-${runId}@compat.test`;

  beforeAll(async () => {
    const options: ConnectOptions = { autoIndex: false, autoCreate: false };
    if (process.env.DOCUMENTDB_TLS_CA_FILE) {
      options.tlsCAFile = process.env.DOCUMENTDB_TLS_CA_FILE;
    }
    if (process.env.DOCUMENTDB_TLS_ALLOW_INVALID_HOSTNAMES === 'true') {
      options.tlsAllowInvalidHostnames = true;
    }
    await mongoose.connect(DOCUMENTDB_URI, options);

    const models = createModels(mongoose);
    Object.assign(mongoose.models, models);
    User = mongoose.models.User;
    ConversationTag = mongoose.models.ConversationTag;
    userMethods = createUserMethods(mongoose);
    fileMethods = createFileMethods(mongoose);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({ email: { $regex: runId } });
      await ConversationTag.deleteMany({ tag: { $regex: runId } });
      await mongoose.models.File.deleteMany({ filename: { $regex: runId } });

      const rows = Object.entries(capabilities).map(
        ([capability, verdict]) => `  ${capability.padEnd(36)} ${verdict}`,
      );
      console.log(`\nDocumentDB capability matrix (run ${runId}):\n${rows.join('\n')}\n`);
      await mongoose.disconnect();
    }
  });

  describe('pipeline-form updates (bug class behind #14488)', () => {
    it('records whether the engine accepts pipeline updates and $$NOW', async () => {
      const probe = getDb().collection(`pipeline_probe_${runId}`);
      await probe.insertOne({ probe: 1 });

      capabilities['pipeline-form updateOne'] = await probe
        .updateOne({ probe: 1 }, [{ $set: { probed: true } }])
        .then(() => 'supported')
        .catch((error: Error) => `rejected (${error.message})`);
      capabilities['$$NOW system variable'] = await probe
        .updateOne({ probe: 1 }, [{ $set: { probedAt: '$$NOW' } }])
        .then(() => 'supported')
        .catch((error: Error) => `rejected (${error.message})`);

      await probe.drop().catch(() => undefined);
      expect(capabilities['pipeline-form updateOne']).toBeDefined();
    });

    it('acceptTerms stamps once and preserves the first timestamp', async () => {
      const user = await User.create({
        name: 'DocDB Terms',
        email: testEmail('terms'),
        provider: 'local',
      });
      const userId = String(user._id);

      const first = await userMethods.acceptTerms(userId);
      expect(first?.termsAccepted).toBe(true);
      expect(first?.termsAcceptedAt).toBeInstanceOf(Date);

      const repeat = await userMethods.acceptTerms(userId);
      expect((repeat?.termsAcceptedAt as Date).getTime()).toBe(
        (first?.termsAcceptedAt as Date).getTime(),
      );
    });

    it('acceptTerms converges under concurrent requests', async () => {
      const user = await User.create({
        name: 'DocDB Concurrent',
        email: testEmail('concurrent'),
        provider: 'local',
      });
      const userId = String(user._id);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => userMethods.acceptTerms(userId)),
      );

      expect(results.every((result) => result?.termsAccepted === true)).toBe(true);
      const stamped = new Set(results.map((result) => (result?.termsAcceptedAt as Date).getTime()));
      expect(stamped.size).toBe(1);
    });

    it('decrementTagCounts clamps at zero', async () => {
      const user = `docdb-user-${runId}`;
      const tag = `tag-${runId}`;
      await ConversationTag.create({ user, tag, position: 1, count: 1 });

      await decrementTagCounts(mongoose, user, [tag, tag, tag]);

      const stored = await ConversationTag.findOne({ user, tag }).lean();
      expect(stored?.count).toBe(0);
    });

    it('extendFilesTTL widens toward the window and clamps to the ceiling', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId = randomUUID();
      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: `${fileId}-${runId}.txt`,
        filepath: `/uploads/${fileId}.txt`,
        type: 'text/plain',
        bytes: 1,
      });
      await mongoose.models.File.updateOne(
        { file_id: fileId },
        { $set: { expiresAt: new Date(Date.now() + 60_000) } },
        { timestamps: false },
      );

      const hold = { renewMs: 24 * HOUR, maxLifetimeMs: 48 * HOUR };
      const widened = await fileMethods.extendFilesTTL([fileId], hold, { user: String(userId) });
      expect(widened).toBe(1);

      const stored = await mongoose.models.File.findOne({ file_id: fileId }).lean<{
        createdAt: Date;
        expiresAt?: Date;
      }>();
      expect(stored?.expiresAt).toBeDefined();
      expect(stored!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * HOUR);
      expect(stored!.expiresAt!.getTime()).toBeLessThanOrEqual(
        stored!.createdAt.getTime() + hold.maxLifetimeMs,
      );
    });
  });

  describe('capability probes (informational)', () => {
    it('probes multi-document transaction support', async () => {
      const supported = await supportsTransactions(mongoose);
      capabilities['multi-document transactions'] = supported
        ? 'supported'
        : 'unsupported (runtime fallback engages)';
      expect(typeof supported).toBe('boolean');
    });

    it('probes partial unique index support (OAuth id uniqueness relies on it)', async () => {
      const probe = getDb().collection(`partial_index_probe_${runId}`);
      await probe.insertOne({ seeded: true });

      const outcome = await probe
        .createIndex(
          { googleId: 1, tenantId: 1 },
          { unique: true, partialFilterExpression: { googleId: { $exists: true } } },
        )
        .then(() => 'supported')
        .catch((error: Error) => `REJECTED (${error.message})`);
      capabilities['partial unique indexes'] = outcome;

      await probe.drop().catch(() => undefined);
      if (process.env.DOCUMENTDB_EXPECT_PARTIAL_INDEXES === 'true') {
        expect(outcome).toBe('supported');
      }
    });

    it('verifies TTL index support (session/token expiry relies on it)', async () => {
      const probe = getDb().collection(`ttl_probe_${runId}`);
      await probe.insertOne({ createdAt: new Date() });

      await expect(
        probe.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 }),
      ).resolves.toBeDefined();
      capabilities['TTL indexes'] = 'supported';

      await probe.drop().catch(() => undefined);
    });

    it('flags a connection string missing retryWrites=false', () => {
      const disabled = /retryWrites=false/i.test(DOCUMENTDB_URI);
      capabilities['retryWrites=false in URI'] = disabled
        ? 'present'
        : 'MISSING — DocumentDB rejects retryable writes';
      expect(typeof disabled).toBe('boolean');
    });
  });

  /**
   * The scheduler's rewritten write shapes (classic operators, worker clock — the
   * DocumentDB-portable replacements for its original pipeline/$$NOW CAS forms),
   * exercised through the real methods against the live engine.
   */
  describe('scheduler write shapes', () => {
    const scheduleMethods = () => createScheduleMethods(mongoose);
    const scheduleData = (overrides: Record<string, unknown> = {}) => ({
      id: `sched_compat_${runId}_${randomUUID().slice(0, 8)}`,
      user: new mongoose.Types.ObjectId(),
      name: `compat ${runId}`,
      prompt: 'compat probe',
      agent_id: 'agent_compat',
      cadence: { frequency: 'daily', hour: 8, minute: 0 },
      timezone: 'America/New_York',
      target: 'new',
      enabled: true,
      nextRunAt: new Date(Date.now() - 60_000),
      ...overrides,
    });

    afterAll(async () => {
      await mongoose.models.Schedule.deleteMany({ name: `compat ${runId}` });
      await mongoose.models.ScheduleRun.deleteMany({ scheduleId: { $regex: runId } });
    });

    it('claims a due schedule via the classic-operator lease CAS', async () => {
      const methods = scheduleMethods();
      const schedule = await methods.createSchedule(scheduleData() as never);
      const claimed = await methods.claimDueSchedule({
        instanceId: `compat-${runId}`,
        leaseMs: 60_000,
      });
      expect(claimed?.leaseUntil).toBeInstanceOf(Date);
      // Held lease: a second claim must not steal it.
      const contender = await methods.claimDueSchedule({
        instanceId: `compat2-${runId}`,
        leaseMs: 60_000,
      });
      expect(contender?.id).not.toBe(schedule.id);
      capabilities['scheduler lease CAS'] = 'supported';
    });

    it('stamps and resolves an abort request with guarded classic updates', async () => {
      const methods = scheduleMethods();
      const schedule = await methods.createSchedule(scheduleData() as never);
      const scheduledFor = new Date('2026-07-20T12:00:00Z');
      await mongoose.models.ScheduleRun.create({
        scheduleId: schedule.id,
        user: schedule.user,
        scheduledFor,
        status: 'started',
        firedAt: new Date(),
      });
      expect(await methods.requestRunAbort(schedule.id, scheduledFor, 'stop')).toBe(true);
      await methods.markRunAbortPersisted(schedule.id, scheduledFor);
      const state = await methods.getScheduleRunAbortState(schedule.id, scheduledFor);
      expect(state?.abortSource).toBe('stop');
      expect(state?.abortPersistedAt).toBeInstanceOf(Date);
      capabilities['scheduler abort stamps'] = 'supported';
    });

    it('arms only an unarmed row through the shared arming CAS', async () => {
      const methods = scheduleMethods();
      const schedule = await methods.createSchedule(
        scheduleData({ nextRunAt: undefined }) as never,
      );
      const armAt = new Date(Date.now() + HOUR);
      expect(await methods.armSchedule(schedule.id, armAt, 0)).toBe(true);
      expect(await methods.armSchedule(schedule.id, new Date(Date.now() + 2 * HOUR), 0)).toBe(
        false,
      );
      capabilities['scheduler arming CAS'] = 'supported';
    });
  });
});
