import type { AnyBulkWriteOperation, Model, Types } from 'mongoose';
import type {
  ISkillDeletion,
  ISkillDeletionDocument,
  ISkillUploadIntent,
  ISkillUploadIntentDocument,
} from '~/types/skillDeletion';
import type { ISkillFileDocument } from '~/types/skill';
import type { ISkillDocument } from '~/types/skill';
import { tenantSafeBulkWrite } from '~/utils/tenantBulkWrite';
import logger from '~/config/winston';

type SkillRow = ISkillDocument & { _id: Types.ObjectId };
const LEGACY_BACKFILL_BATCH_SIZE = 100;
type IntentInput = {
  skillId: string;
  author: string;
  fileId: string;
  source: string;
  storageKey: string;
  tenantId?: string;
  writerId: string;
};

export type StoppedSkillUploadRecovery =
  | { status: 'missing' | 'changed' }
  | { status: 'recovered'; state: 'committed' | 'abandoned' };

export interface SkillLifecycleMethods {
  beginSkillDeletion: (id: string) => Promise<ISkillDeletion | null>;
  getSkillDeletion: (id: string) => Promise<ISkillDeletion | null>;
  discoverUnjournaledDeletions: (limit?: number) => Promise<number>;
  listPendingSkillDeletions: (limit?: number) => Promise<ISkillDeletion[]>;
  listSkillDeletionTombstones: (limit?: number) => Promise<ISkillDeletion[]>;
  noteSkillDeletionAttempt: (skillId: string | Types.ObjectId) => Promise<void>;
  claimSkillDeletion: (
    skillId: string | Types.ObjectId,
    owner: string,
    leaseMs: number,
  ) => Promise<boolean>;
  refreshSkillDeletionClaim: (
    skillId: string | Types.ObjectId,
    owner: string,
    leaseMs: number,
  ) => Promise<boolean>;
  releaseSkillDeletionClaim: (skillId: string | Types.ObjectId, owner: string) => Promise<void>;
  completeSkillDeletion: (skillId: string | Types.ObjectId) => Promise<void>;
  reopenSkillDeletion: (skillId: string | Types.ObjectId) => Promise<void>;
  scheduleSkillDeletionRecheck: (
    skillId: string | Types.ObjectId,
    owner: string,
    delayMs: number,
  ) => Promise<boolean>;
  reserveSkillUploadIntent: (input: IntentInput) => Promise<ISkillUploadIntent>;
  transitionSkillUploadIntent: (
    fileId: string,
    writerId: string,
    from: ISkillUploadIntent['state'],
    to: ISkillUploadIntent['state'],
  ) => Promise<boolean>;
  listSkillUploadIntents: (skillId: string | Types.ObjectId) => Promise<ISkillUploadIntent[]>;
  getSkillUploadIntent: (fileId: string) => Promise<ISkillUploadIntent | null>;
  recoverStoppedSkillUploadIntent: (
    fileId: string,
    expectedWriterId: string,
  ) => Promise<StoppedSkillUploadRecovery>;
  listAbandonedSkillUploadIntents: (limit?: number) => Promise<ISkillUploadIntent[]>;
  claimAbandonedSkillUploadIntent: (
    fileId: string,
    owner: string,
    leaseMs: number,
  ) => Promise<boolean>;
  refreshAbandonedSkillUploadIntentClaim: (
    fileId: string,
    owner: string,
    leaseMs: number,
  ) => Promise<boolean>;
  noteAbandonedSkillUploadIntentAttempt: (fileId: string) => Promise<void>;
  releaseAbandonedSkillUploadIntentClaim: (fileId: string, owner: string) => Promise<void>;
  skillFileExistsForIntent: (skillId: string, fileId: string) => Promise<boolean>;
  markSkillUploadIntentCleaned: (fileId: string) => Promise<void>;
  queueCommittedSkillUploadCleanup: (fileId: string) => Promise<void>;
  scheduleAbandonedSkillUploadIntentRecheck: (
    fileId: string,
    owner: string,
    delayMs: number,
  ) => Promise<boolean>;
}

/** Durable bookkeeping only. Provider effects are owned by the API-layer cleanup worker. */
export function createSkillLifecycleMethods(
  mongoose: typeof import('mongoose'),
): SkillLifecycleMethods {
  // createMethods may be constructed before createModels (for example in
  // server bootstrap and tests). Resolve models at call time, not here.
  const skillModel = () => mongoose.models.Skill as Model<ISkillDocument>;
  const skillFileModel = () => mongoose.models.SkillFile as Model<ISkillFileDocument>;
  const deletionModel = () => mongoose.models.SkillDeletion as Model<ISkillDeletionDocument>;
  const intentModel = () => mongoose.models.SkillUploadIntent as Model<ISkillUploadIntentDocument>;

  async function beginSkillDeletion(id: string): Promise<ISkillDeletion | null> {
    const skillId = new mongoose.Types.ObjectId(id);
    const skill = (await skillModel()
      .findOneAndUpdate(
        { _id: skillId, deletingAt: { $exists: false } },
        // The reserved name cannot be created through Skill validation. Moving
        // it in the same write as the deletion mark releases the public name
        // under the existing unique index, without an index migration.
        { $set: { name: `__deleted__${id}`, deletingAt: new Date(), deletionNeedsJournal: true } },
        { new: true },
      )
      .lean()) as SkillRow | null;
    const existing = skill ?? ((await skillModel().findById(skillId).lean()) as SkillRow | null);
    if (!existing?.deletingAt) return null;
    const journal = (await deletionModel()
      .findOneAndUpdate(
        { skillId },
        {
          $setOnInsert: {
            skillId,
            author: existing.author,
            tenantId: existing.tenantId,
            startedAt: existing.deletingAt,
          },
        },
        { upsert: true, new: true },
      )
      .lean()) as ISkillDeletion;
    if (existing.deletionNeedsJournal) {
      // The marker also covers crashes after the journal insert but before
      // every legacy file has a durable blob reference.
      let writes: AnyBulkWriteOperation[] = [];
      for await (const file of skillFileModel().find({ skillId }).cursor()) {
        writes.push({
          updateOne: {
            filter: {
              fileId: file.file_id,
              ...(file.tenantId ? { tenantId: file.tenantId } : {}),
            },
            update: {
              $setOnInsert: {
                skillId,
                fileId: file.file_id,
                source: file.source,
                storageKey: file.filepath,
                author: file.author,
                writerId: 'legacy-backfill',
                state: 'committed',
              },
            },
            upsert: true,
          },
        });
        if (writes.length === LEGACY_BACKFILL_BATCH_SIZE) {
          await tenantSafeBulkWrite(intentModel(), writes, { ordered: false });
          writes = [];
        }
      }
      if (writes.length > 0) {
        await tenantSafeBulkWrite(intentModel(), writes, { ordered: false });
      }
      await skillModel().updateOne(
        { _id: skillId, deletionNeedsJournal: true },
        { $unset: { deletionNeedsJournal: '' } },
      );
    }
    return journal;
  }

  async function getSkillDeletion(id: string): Promise<ISkillDeletion | null> {
    return (await deletionModel()
      .findOne({ skillId: new mongoose.Types.ObjectId(id) })
      .lean()) as ISkillDeletion | null;
  }

  /** Repairs the mark/outbox crash gap without requiring a MongoDB transaction. */
  async function discoverUnjournaledDeletions(limit = 100): Promise<number> {
    let count = 0;
    const pending = await skillModel()
      .find({ deletionNeedsJournal: true })
      .sort({ deletionJournalAttemptAt: 1, deletingAt: 1 })
      .limit(limit)
      .select('_id')
      .lean();
    for (const skill of pending) {
      await skillModel().updateOne(
        { _id: skill._id, deletionNeedsJournal: true },
        { $set: { deletionJournalAttemptAt: new Date() } },
      );
      try {
        await beginSkillDeletion(skill._id.toString());
        count++;
      } catch {
        // Keep the marker and rotate this Skill behind other pending backfills.
        logger.warn(`[skill deletion] Journal backfill deferred for ${skill._id}`);
      }
    }
    return count;
  }

  async function listPendingSkillDeletions(limit = 100): Promise<ISkillDeletion[]> {
    return (await deletionModel()
      .find({ completedAt: { $exists: false } })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .lean()) as ISkillDeletion[];
  }

  async function listSkillDeletionTombstones(limit = 100): Promise<ISkillDeletion[]> {
    const now = new Date();
    return (await deletionModel()
      .find({
        $and: [
          { $or: [{ claimExpiresAt: { $exists: false } }, { claimExpiresAt: { $lte: now } }] },
          {
            $or: [
              { completedAt: { $exists: false } },
              { nextCheckAt: { $exists: false } },
              { nextCheckAt: { $lte: now } },
            ],
          },
        ],
      })
      .sort({ lastAttemptAt: 1, startedAt: 1 })
      .limit(limit)
      .lean()) as ISkillDeletion[];
  }

  async function noteSkillDeletionAttempt(skillId: string | Types.ObjectId): Promise<void> {
    await deletionModel().updateOne({ skillId }, { $set: { lastAttemptAt: new Date() } });
  }

  async function claimSkillDeletion(
    skillId: string | Types.ObjectId,
    owner: string,
    leaseMs: number,
  ): Promise<boolean> {
    const now = new Date();
    const result = await deletionModel().updateOne(
      {
        skillId,
        $and: [
          {
            $or: [
              { claimExpiresAt: { $exists: false } },
              { claimExpiresAt: { $lte: now } },
              { claimOwner: owner },
            ],
          },
          {
            $or: [
              { completedAt: { $exists: false } },
              { nextCheckAt: { $exists: false } },
              { nextCheckAt: { $lte: now } },
            ],
          },
        ],
      },
      { $set: { claimOwner: owner, claimExpiresAt: new Date(now.getTime() + leaseMs) } },
    );
    return result.matchedCount === 1;
  }

  async function refreshSkillDeletionClaim(
    skillId: string | Types.ObjectId,
    owner: string,
    leaseMs: number,
  ): Promise<boolean> {
    const result = await deletionModel().updateOne(
      { skillId, claimOwner: owner, claimExpiresAt: { $gt: new Date() } },
      { $set: { claimExpiresAt: new Date(Date.now() + leaseMs) } },
    );
    return result.matchedCount === 1;
  }

  async function releaseSkillDeletionClaim(
    skillId: string | Types.ObjectId,
    owner: string,
  ): Promise<void> {
    await deletionModel().updateOne(
      { skillId, claimOwner: owner },
      { $unset: { claimOwner: '', claimExpiresAt: '' } },
    );
  }

  async function completeSkillDeletion(skillId: string | Types.ObjectId): Promise<void> {
    await deletionModel().updateOne({ skillId }, { $set: { completedAt: new Date() } });
  }

  async function reopenSkillDeletion(skillId: string | Types.ObjectId): Promise<void> {
    await deletionModel().updateOne({ skillId }, { $unset: { completedAt: '', nextCheckAt: '' } });
  }

  async function scheduleSkillDeletionRecheck(
    skillId: string | Types.ObjectId,
    owner: string,
    delayMs: number,
  ): Promise<boolean> {
    const now = new Date();
    const result = await deletionModel().updateOne(
      { skillId, claimOwner: owner, claimExpiresAt: { $gt: now }, completedAt: { $exists: true } },
      { $set: { nextCheckAt: new Date(now.getTime() + delayMs) } },
    );
    return result.modifiedCount === 1;
  }

  async function reserveSkillUploadIntent(input: IntentInput): Promise<ISkillUploadIntent> {
    // Publish the future blob reference before checking the parent. Deletion
    // marks the parent first, then scans intents: it must either see this row
    // or make the check below fail before any bytes are written.
    try {
      const intent = (await intentModel().create({ ...input, state: 'uploading' })).toObject();
      const skill = await skillModel()
        .findOne({ _id: input.skillId, deletingAt: { $exists: false } })
        .select('_id')
        .lean();
      if (!skill) {
        throw Object.assign(new Error('Skill is being deleted'), { code: 'SKILL_DELETING' });
      }
      return intent;
    } catch (error) {
      await intentModel().updateOne(
        { fileId: input.fileId, writerId: input.writerId, state: 'uploading' },
        { $set: { state: 'abandoned' } },
      );
      throw error;
    }
  }

  async function transitionSkillUploadIntent(
    fileId: string,
    writerId: string,
    from: ISkillUploadIntent['state'],
    to: ISkillUploadIntent['state'],
  ): Promise<boolean> {
    const result = await intentModel().updateOne(
      { fileId, writerId, state: from },
      { $set: { state: to } },
    );
    if (result.modifiedCount === 1) return true;
    return Boolean(await intentModel().exists({ fileId, writerId, state: to }));
  }

  async function listSkillUploadIntents(
    skillId: string | Types.ObjectId,
  ): Promise<ISkillUploadIntent[]> {
    return (await intentModel().find({ skillId }).lean()) as ISkillUploadIntent[];
  }

  async function getSkillUploadIntent(fileId: string): Promise<ISkillUploadIntent | null> {
    return (await intentModel().findOne({ fileId }).lean()) as ISkillUploadIntent | null;
  }

  /** Operator-only recovery: call only after independently confirming the writer has stopped. */
  async function recoverStoppedSkillUploadIntent(
    fileId: string,
    expectedWriterId: string,
  ): Promise<StoppedSkillUploadRecovery> {
    const intent = await getSkillUploadIntent(fileId);
    if (!intent) return { status: 'missing' };
    if (
      intent.writerId !== expectedWriterId ||
      (intent.state !== 'uploading' && intent.state !== 'committing')
    ) {
      return { status: 'changed' };
    }
    const rowExists = await skillFileExistsForIntent(intent.skillId.toString(), fileId);
    const state = rowExists ? 'committed' : 'abandoned';
    const result = await intentModel().updateOne(
      { fileId, writerId: expectedWriterId, state: intent.state },
      { $set: { state } },
    );
    return result.modifiedCount === 1 ? { status: 'recovered', state } : { status: 'changed' };
  }

  async function listAbandonedSkillUploadIntents(limit = 100): Promise<ISkillUploadIntent[]> {
    const now = new Date();
    return (await intentModel()
      .find({
        state: 'abandoned',
        $and: [
          { $or: [{ claimExpiresAt: { $exists: false } }, { claimExpiresAt: { $lte: now } }] },
          { $or: [{ nextCheckAt: { $exists: false } }, { nextCheckAt: { $lte: now } }] },
        ],
      })
      .sort({ lastCleanupAttemptAt: 1, createdAt: 1 })
      .limit(limit)
      .lean()) as ISkillUploadIntent[];
  }

  async function claimAbandonedSkillUploadIntent(
    fileId: string,
    owner: string,
    leaseMs: number,
  ): Promise<boolean> {
    const now = new Date();
    const result = await intentModel().updateOne(
      {
        fileId,
        state: 'abandoned',
        $and: [
          {
            $or: [
              { claimExpiresAt: { $exists: false } },
              { claimExpiresAt: { $lte: now } },
              { claimOwner: owner },
            ],
          },
          { $or: [{ nextCheckAt: { $exists: false } }, { nextCheckAt: { $lte: now } }] },
        ],
      },
      { $set: { claimOwner: owner, claimExpiresAt: new Date(now.getTime() + leaseMs) } },
    );
    return result.matchedCount === 1;
  }

  async function refreshAbandonedSkillUploadIntentClaim(
    fileId: string,
    owner: string,
    leaseMs: number,
  ): Promise<boolean> {
    const result = await intentModel().updateOne(
      { fileId, state: 'abandoned', claimOwner: owner, claimExpiresAt: { $gt: new Date() } },
      { $set: { claimExpiresAt: new Date(Date.now() + leaseMs) } },
    );
    return result.matchedCount === 1;
  }

  async function noteAbandonedSkillUploadIntentAttempt(fileId: string): Promise<void> {
    await intentModel().updateOne({ fileId }, { $set: { lastCleanupAttemptAt: new Date() } });
  }

  async function releaseAbandonedSkillUploadIntentClaim(
    fileId: string,
    owner: string,
  ): Promise<void> {
    await intentModel().updateOne(
      { fileId, claimOwner: owner },
      { $unset: { claimOwner: '', claimExpiresAt: '' } },
    );
  }

  async function skillFileExistsForIntent(skillId: string, fileId: string): Promise<boolean> {
    return Boolean(await skillFileModel().exists({ skillId, file_id: fileId }));
  }

  async function markSkillUploadIntentCleaned(fileId: string): Promise<void> {
    await intentModel().updateOne({ fileId }, { $set: { cleanedAt: new Date() } });
  }

  /** A committed upload rolled back before publication must remain sweepable. */
  async function queueCommittedSkillUploadCleanup(fileId: string): Promise<void> {
    const result = await intentModel().updateOne(
      { fileId, state: 'committed', cleanedAt: { $exists: false } },
      { $set: { state: 'abandoned' }, $unset: { nextCheckAt: '' } },
    );
    if (result.matchedCount === 1) return;
    const intent = await intentModel().findOne({ fileId }).lean();
    if (intent?.state !== 'abandoned' && !intent?.cleanedAt) {
      throw new Error(`Skill blob cleanup intent is missing or invalid: ${fileId}`);
    }
  }

  async function scheduleAbandonedSkillUploadIntentRecheck(
    fileId: string,
    owner: string,
    delayMs: number,
  ): Promise<boolean> {
    const now = new Date();
    const result = await intentModel().updateOne(
      {
        fileId,
        state: 'abandoned',
        claimOwner: owner,
        claimExpiresAt: { $gt: now },
      },
      { $set: { nextCheckAt: new Date(now.getTime() + delayMs) } },
    );
    return result.modifiedCount === 1;
  }

  return {
    beginSkillDeletion,
    getSkillDeletion,
    discoverUnjournaledDeletions,
    listPendingSkillDeletions,
    listSkillDeletionTombstones,
    noteSkillDeletionAttempt,
    claimSkillDeletion,
    refreshSkillDeletionClaim,
    releaseSkillDeletionClaim,
    completeSkillDeletion,
    reopenSkillDeletion,
    scheduleSkillDeletionRecheck,
    reserveSkillUploadIntent,
    transitionSkillUploadIntent,
    listSkillUploadIntents,
    getSkillUploadIntent,
    recoverStoppedSkillUploadIntent,
    listAbandonedSkillUploadIntents,
    claimAbandonedSkillUploadIntent,
    refreshAbandonedSkillUploadIntentClaim,
    noteAbandonedSkillUploadIntentAttempt,
    releaseAbandonedSkillUploadIntentClaim,
    skillFileExistsForIntent,
    markSkillUploadIntentCleaned,
    queueCommittedSkillUploadCleanup,
    scheduleAbandonedSkillUploadIntentRecheck,
  };
}
