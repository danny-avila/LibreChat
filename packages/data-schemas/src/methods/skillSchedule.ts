import type { Model, Types, FilterQuery } from 'mongoose';
import type {
  ISkillSchedule,
  ISkillScheduleDocument,
  SkillScheduleStatus,
} from '~/types/skillSchedule';

export type CreateSkillScheduleInput = Omit<
  ISkillSchedule,
  'createdAt' | 'updatedAt' | 'lastStatus' | 'lockedAt' | 'lockedBy'
> & {
  lastStatus?: SkillScheduleStatus;
};

export type UpdateSkillScheduleInput = Partial<
  Pick<
    ISkillSchedule,
    | 'name'
    | 'enabled'
    | 'prompt'
    | 'skillName'
    | 'skillId'
    | 'agent_id'
    | 'endpoint'
    | 'endpointType'
    | 'model'
    | 'spec'
    | 'scheduleType'
    | 'cron'
    | 'runAt'
    | 'timezone'
    | 'nextRunAt'
  >
>;

export type MarkScheduleResultInput = {
  status: SkillScheduleStatus;
  conversationId?: string;
  error?: string | null;
  nextRunAt?: Date | null;
  enabled?: boolean;
};

export function createSkillScheduleMethods(mongoose: typeof import('mongoose')) {
  const getModel = () => mongoose.models.SkillSchedule as Model<ISkillScheduleDocument>;

  /** Creates a schedule owned by `data.user`. */
  async function createSkillSchedule(
    data: CreateSkillScheduleInput,
  ): Promise<ISkillScheduleDocument> {
    const SkillSchedule = getModel();
    return SkillSchedule.create(data);
  }

  /** Fetches a single owner-scoped schedule. */
  async function getSkillScheduleById(
    id: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ): Promise<ISkillScheduleDocument | null> {
    const SkillSchedule = getModel();
    return SkillSchedule.findOne({ _id: id, user: userId }).lean<ISkillScheduleDocument>();
  }

  /** Lists all schedules for an owner, newest first. */
  async function listSkillSchedules(params: {
    userId: string | Types.ObjectId;
    tenantId?: string;
  }): Promise<ISkillScheduleDocument[]> {
    const SkillSchedule = getModel();
    const filter: FilterQuery<ISkillScheduleDocument> = { user: params.userId };
    if (params.tenantId) {
      filter.tenantId = params.tenantId;
    }
    return SkillSchedule.find(filter)
      .sort({ updatedAt: -1 })
      .lean<ISkillScheduleDocument[]>();
  }

  /** Owner-scoped update. Returns the updated doc or null when not found. */
  async function updateSkillSchedule(
    id: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    patch: UpdateSkillScheduleInput,
  ): Promise<ISkillScheduleDocument | null> {
    const SkillSchedule = getModel();
    return SkillSchedule.findOneAndUpdate({ _id: id, user: userId }, { $set: patch }, {
      new: true,
    }).lean<ISkillScheduleDocument>();
  }

  /** Owner-scoped delete. */
  async function deleteSkillSchedule(
    id: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ): Promise<{ deletedCount?: number }> {
    const SkillSchedule = getModel();
    return SkillSchedule.deleteOne({ _id: id, user: userId });
  }

  /**
   * Atomically claims a single due schedule for execution. Claims rows that
   * are enabled, due (`nextRunAt <= now`), and either unlocked or whose lock
   * has gone stale (instance crashed mid-run). The atomic `findOneAndUpdate`
   * guarantees two poller instances never grab the same row.
   *
   * MUST be called inside a system (cross-tenant) context so the scan spans
   * all tenants; the run itself then switches into the owner's tenant.
   */
  async function claimDueSchedule(
    now: Date,
    instanceId: string,
    lockTtlMs: number,
  ): Promise<ISkillScheduleDocument | null> {
    const SkillSchedule = getModel();
    const staleBefore = new Date(now.getTime() - lockTtlMs);
    return SkillSchedule.findOneAndUpdate(
      {
        enabled: true,
        nextRunAt: { $ne: null, $lte: now },
        $or: [{ lockedAt: null }, { lockedAt: { $lte: staleBefore } }],
      },
      { $set: { lockedAt: now, lockedBy: instanceId, lastStatus: 'running', lastRunAt: now } },
      { new: true, sort: { nextRunAt: 1 } },
    ).lean<ISkillScheduleDocument>();
  }

  /**
   * Records the outcome of a run and releases the claim. Pass the recomputed
   * `nextRunAt` (next future slot for recurring, or null for exhausted
   * one-time schedules) and optionally flip `enabled` off.
   */
  async function markScheduleResult(
    id: string | Types.ObjectId,
    result: MarkScheduleResultInput,
  ): Promise<void> {
    const SkillSchedule = getModel();
    const set: Record<string, unknown> = {
      lastStatus: result.status,
      lockedAt: null,
      lockedBy: null,
    };
    if (result.conversationId !== undefined) {
      set.lastConversationId = result.conversationId;
    }
    if (result.error !== undefined) {
      set.lastError = result.error;
    }
    if (result.nextRunAt !== undefined) {
      set.nextRunAt = result.nextRunAt;
    }
    if (result.enabled !== undefined) {
      set.enabled = result.enabled;
    }
    await SkillSchedule.updateOne({ _id: id }, { $set: set });
  }

  /**
   * Atomically claims a specific schedule for a manual ("Run now") execution.
   * Locks it only when it isn't already locked (or the lock is stale), so a
   * duplicate trigger — a double-submitted request, a retry, or the poller —
   * returns `null` and runs nothing. Mirrors `claimDueSchedule`'s lock so the
   * manual and scheduled paths are mutually exclusive. Returns the locked doc
   * or `null` when a run is already in progress.
   */
  async function claimScheduleForRun(
    id: string | Types.ObjectId,
    instanceId: string,
    lockTtlMs: number,
    conversationId?: string,
  ): Promise<ISkillScheduleDocument | null> {
    const SkillSchedule = getModel();
    const now = new Date();
    const staleBefore = new Date(now.getTime() - lockTtlMs);
    const set: Record<string, unknown> = {
      lockedAt: now,
      lockedBy: instanceId,
      lastStatus: 'running',
      lastRunAt: now,
    };
    if (conversationId !== undefined) {
      set.lastConversationId = conversationId;
    }
    return SkillSchedule.findOneAndUpdate(
      { _id: id, $or: [{ lockedAt: null }, { lockedAt: { $lte: staleBefore } }] },
      { $set: set },
      { new: true },
    ).lean<ISkillScheduleDocument>();
  }

  return {
    createSkillSchedule,
    getSkillScheduleById,
    listSkillSchedules,
    updateSkillSchedule,
    deleteSkillSchedule,
    claimDueSchedule,
    claimScheduleForRun,
    markScheduleResult,
  };
}

export type SkillScheduleMethods = ReturnType<typeof createSkillScheduleMethods>;
