import type { Model, Types } from 'mongoose';
import type {
  ISkillDeletion,
  ISkillDeletionDocument,
  ISkillUploadIntent,
  ISkillUploadIntentDocument,
} from '~/types/skillDeletion';
import type { ISkillFileDocument } from '~/types/skill';
import type { ISkillDocument } from '~/types/skill';

type SkillRow = ISkillDocument & { _id: Types.ObjectId };
type IntentInput = {
  skillId: string;
  author: string;
  fileId: string;
  source: string;
  storageKey: string;
  tenantId?: string;
  writerId: string;
};

export interface SkillLifecycleMethods {
  beginSkillDeletion: (id: string) => Promise<ISkillDeletion | null>;
  getSkillDeletion: (id: string) => Promise<ISkillDeletion | null>;
  discoverUnjournaledDeletions: () => Promise<number>;
  listPendingSkillDeletions: (limit?: number) => Promise<ISkillDeletion[]>;
  listSkillDeletionTombstones: (limit?: number) => Promise<ISkillDeletion[]>;
  noteSkillDeletionAttempt: (skillId: Types.ObjectId) => Promise<void>;
  claimSkillDeletion: (skillId: Types.ObjectId, owner: string, leaseMs: number) => Promise<boolean>;
  refreshSkillDeletionClaim: (
    skillId: Types.ObjectId,
    owner: string,
    leaseMs: number,
  ) => Promise<boolean>;
  releaseSkillDeletionClaim: (skillId: Types.ObjectId, owner: string) => Promise<void>;
  completeSkillDeletion: (skillId: Types.ObjectId) => Promise<void>;
  reopenSkillDeletion: (skillId: Types.ObjectId) => Promise<void>;
  reserveSkillUploadIntent: (input: IntentInput) => Promise<ISkillUploadIntent>;
  transitionSkillUploadIntent: (
    fileId: string,
    writerId: string,
    from: ISkillUploadIntent['state'],
    to: ISkillUploadIntent['state'],
  ) => Promise<boolean>;
  listSkillUploadIntents: (skillId: Types.ObjectId) => Promise<ISkillUploadIntent[]>;
  markSkillUploadIntentCleaned: (fileId: string) => Promise<void>;
  preserveExistingSkillBlob: (input: {
    skillId: string;
    fileId: string;
    source: string;
    storageKey: string;
    author: string;
    tenantId?: string;
  }) => Promise<void>;
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
        { $set: { deletingAt: new Date() } },
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
    // Pre-existing files have no upload intent. Materialize their persistent
    // blob references while the parent is hidden; restart discovery repeats
    // this if the process dies midway through the backfill.
    for await (const file of skillFileModel().find({ skillId }).cursor()) {
      await preserveExistingSkillBlob({
        skillId: skillId.toString(),
        fileId: file.file_id,
        source: file.source,
        storageKey: file.filepath,
        author: file.author.toString(),
        tenantId: file.tenantId,
      });
    }
    return journal;
  }

  async function getSkillDeletion(id: string): Promise<ISkillDeletion | null> {
    return (await deletionModel()
      .findOne({ skillId: new mongoose.Types.ObjectId(id) })
      .lean()) as ISkillDeletion | null;
  }

  /** Repairs the mark/outbox crash gap without requiring a MongoDB transaction. */
  async function discoverUnjournaledDeletions(): Promise<number> {
    let count = 0;
    for await (const skill of skillModel()
      .find({ deletingAt: { $exists: true } })
      .select('_id')
      .cursor()) {
      await beginSkillDeletion(skill._id.toString());
      count++;
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
    return (await deletionModel()
      .find({})
      .sort({ lastAttemptAt: 1, startedAt: 1 })
      .limit(limit)
      .lean()) as ISkillDeletion[];
  }

  async function noteSkillDeletionAttempt(skillId: Types.ObjectId): Promise<void> {
    await deletionModel().updateOne({ skillId }, { $set: { lastAttemptAt: new Date() } });
  }

  async function claimSkillDeletion(
    skillId: Types.ObjectId,
    owner: string,
    leaseMs: number,
  ): Promise<boolean> {
    const now = new Date();
    const result = await deletionModel().updateOne(
      {
        skillId,
        $or: [
          { claimExpiresAt: { $exists: false } },
          { claimExpiresAt: { $lte: now } },
          { claimOwner: owner },
        ],
      },
      { $set: { claimOwner: owner, claimExpiresAt: new Date(now.getTime() + leaseMs) } },
    );
    return result.modifiedCount === 1;
  }

  async function refreshSkillDeletionClaim(
    skillId: Types.ObjectId,
    owner: string,
    leaseMs: number,
  ): Promise<boolean> {
    const result = await deletionModel().updateOne(
      { skillId, claimOwner: owner, claimExpiresAt: { $gt: new Date() } },
      { $set: { claimExpiresAt: new Date(Date.now() + leaseMs) } },
    );
    return result.modifiedCount === 1;
  }

  async function releaseSkillDeletionClaim(skillId: Types.ObjectId, owner: string): Promise<void> {
    await deletionModel().updateOne(
      { skillId, claimOwner: owner },
      { $unset: { claimOwner: '', claimExpiresAt: '' } },
    );
  }

  async function completeSkillDeletion(skillId: Types.ObjectId): Promise<void> {
    await deletionModel().updateOne({ skillId }, { $set: { completedAt: new Date() } });
  }

  async function reopenSkillDeletion(skillId: Types.ObjectId): Promise<void> {
    await deletionModel().updateOne({ skillId }, { $unset: { completedAt: '' } });
  }

  async function reserveSkillUploadIntent(input: IntentInput): Promise<ISkillUploadIntent> {
    const skill = await skillModel()
      .findOne({ _id: input.skillId, deletingAt: { $exists: false } })
      .select('_id')
      .lean();
    if (!skill) {
      throw Object.assign(new Error('Skill is being deleted'), { code: 'SKILL_DELETING' });
    }
    return (await intentModel().create({ ...input, state: 'uploading' })).toObject();
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
    return result.modifiedCount === 1;
  }

  async function listSkillUploadIntents(skillId: Types.ObjectId): Promise<ISkillUploadIntent[]> {
    return (await intentModel().find({ skillId }).lean()) as ISkillUploadIntent[];
  }

  async function markSkillUploadIntentCleaned(fileId: string): Promise<void> {
    await intentModel().updateOne({ fileId }, { $set: { cleanedAt: new Date() } });
  }

  /** Backfill a legacy file before replacing/removing its only row reference. */
  async function preserveExistingSkillBlob(input: {
    skillId: string;
    fileId: string;
    source: string;
    storageKey: string;
    author: string;
    tenantId?: string;
  }): Promise<void> {
    await intentModel().updateOne(
      { fileId: input.fileId },
      {
        $setOnInsert: {
          skillId: input.skillId,
          fileId: input.fileId,
          source: input.source,
          storageKey: input.storageKey,
          author: input.author,
          tenantId: input.tenantId,
          writerId: 'legacy-backfill',
          state: 'committed',
        },
      },
      { upsert: true },
    );
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
    reserveSkillUploadIntent,
    transitionSkillUploadIntent,
    listSkillUploadIntents,
    markSkillUploadIntentCleaned,
    preserveExistingSkillBlob,
  };
}
