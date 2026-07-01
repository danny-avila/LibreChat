import type { Model, Types, FilterQuery } from 'mongoose';
import type {
  IAgentJob,
  IAgentJobStep,
  AgentJobStatus,
  IAgentJobDocument,
  IAgentJobClientOp,
} from '~/types/agentJob';

export type CreateAgentJobInput = Pick<IAgentJob, 'user' | 'conversationId' | 'goal'> &
  Partial<
    Pick<
      IAgentJob,
      | 'tenantId'
      | 'agent_id'
      | 'endpoint'
      | 'endpointType'
      | 'model'
      | 'spec'
      | 'maxSteps'
      | 'status'
    >
  >;

/** Fields recorded when a step finishes and the job's claim is released. */
export type RecordJobStepInput = {
  /** The step to append to the job's history. */
  step: IAgentJobStep;
  /** New job status after this step. */
  status: AgentJobStatus;
  /** Advance the pointer to this step index. */
  currentStep: number;
  /** Serializable working state carried into the next step. */
  checkpoint?: unknown;
  /** Error message when the step failed. */
  error?: string | null;
  /** Pending client op when the job needs a local file operation. */
  pendingClientOp?: IAgentJobClientOp | null;
};

export function createAgentJobMethods(mongoose: typeof import('mongoose')) {
  const getModel = () => mongoose.models.AgentJob as Model<IAgentJobDocument>;

  /** Creates a job owned by `data.user`. */
  async function createAgentJob(data: CreateAgentJobInput): Promise<IAgentJobDocument> {
    const AgentJob = getModel();
    return AgentJob.create(data);
  }

  /** Fetches a single owner-scoped job. */
  async function getAgentJobById(
    id: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ): Promise<IAgentJobDocument | null> {
    const AgentJob = getModel();
    return AgentJob.findOne({ _id: id, user: userId }).lean<IAgentJobDocument>();
  }

  /** Lists an owner's jobs, newest first. Optionally filter by status or conversation. */
  async function listAgentJobs(params: {
    userId: string | Types.ObjectId;
    tenantId?: string;
    statuses?: AgentJobStatus[];
    conversationId?: string;
  }): Promise<IAgentJobDocument[]> {
    const AgentJob = getModel();
    const filter: FilterQuery<IAgentJobDocument> = { user: params.userId };
    if (params.tenantId) {
      filter.tenantId = params.tenantId;
    }
    if (params.conversationId) {
      filter.conversationId = params.conversationId;
    }
    if (params.statuses && params.statuses.length > 0) {
      filter.status = { $in: params.statuses };
    }
    return AgentJob.find(filter).sort({ updatedAt: -1 }).lean<IAgentJobDocument[]>();
  }

  /**
   * Atomically claims a single runnable job for execution. Claims jobs that are
   * `queued` or `running` and either unlocked or whose lock has gone stale
   * (instance crashed mid-step). The atomic `findOneAndUpdate` guarantees two
   * worker instances never grab the same job.
   *
   * MUST be called inside a system (cross-tenant) context so the scan spans all
   * tenants; the step itself then switches into the owner's tenant.
   */
  async function claimDueJob(
    now: Date,
    instanceId: string,
    lockTtlMs: number,
  ): Promise<IAgentJobDocument | null> {
    const AgentJob = getModel();
    const staleBefore = new Date(now.getTime() - lockTtlMs);
    return AgentJob.findOneAndUpdate(
      {
        status: { $in: ['queued', 'running'] },
        $or: [{ lockedAt: null }, { lockedAt: { $lte: staleBefore } }],
      },
      { $set: { lockedAt: now, lockedBy: instanceId, status: 'running' } },
      { new: true, sort: { updatedAt: 1 } },
    ).lean<IAgentJobDocument>();
  }

  /**
   * Records the outcome of one step and releases the claim. Appends the step,
   * advances `currentStep`, updates status + checkpoint, and clears the lock so
   * the next tick can pick the job up again (or leaves it terminal).
   */
  async function recordJobStep(
    id: string | Types.ObjectId,
    result: RecordJobStepInput,
  ): Promise<void> {
    const AgentJob = getModel();
    const set: Record<string, unknown> = {
      status: result.status,
      currentStep: result.currentStep,
      lockedAt: null,
      lockedBy: null,
    };
    if (result.checkpoint !== undefined) {
      set.checkpoint = result.checkpoint;
    }
    if (result.error !== undefined) {
      set.lastError = result.error;
    }
    if (result.pendingClientOp !== undefined) {
      set.pendingClientOp = result.pendingClientOp;
    }
    await AgentJob.updateOne({ _id: id }, { $set: set, $push: { steps: result.step } });
  }

  /**
   * Owner-scoped cancel. Marks the job `canceled` and releases any claim so the
   * worker stops running further steps. Returns the updated doc or null.
   */
  async function cancelAgentJob(
    id: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ): Promise<IAgentJobDocument | null> {
    const AgentJob = getModel();
    return AgentJob.findOneAndUpdate(
      { _id: id, user: userId, status: { $nin: ['done', 'error', 'canceled'] } },
      { $set: { status: 'canceled', lockedAt: null, lockedBy: null } },
      { new: true },
    ).lean<IAgentJobDocument>();
  }

  return {
    createAgentJob,
    getAgentJobById,
    listAgentJobs,
    claimDueJob,
    recordJobStep,
    cancelAgentJob,
  };
}

export type AgentJobMethods = ReturnType<typeof createAgentJobMethods>;
