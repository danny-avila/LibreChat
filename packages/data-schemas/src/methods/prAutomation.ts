import { randomUUID } from 'node:crypto';
import {
  MAX_SUBAGENT_DEPTH,
  MAX_PR_AUTOMATION_BOTS,
  PR_AUTOMATION_STOP_CODES,
  PR_AUTOMATION_TRUST_LEVELS,
  clampPRAutomationTrust,
} from 'librechat-data-provider';
import type { PRAutomationTrustLevel } from 'librechat-data-provider';
import type { PRAutomationStopCode } from 'librechat-data-provider';
import type { PRAutomationState } from 'librechat-data-provider';
import type { PipelineStage, Types } from 'mongoose';
import type * as t from '~/types/prAutomation';
import { isValidObjectIdString } from '~/utils/objectId';
import { createIndexesWithRetry } from '~/utils/retry';

const PROJECTION = '-_id -__v';
/** Records removed per write, so a cleanup never holds one unbounded `$in`. */
const DELETE_BATCH = 1000;
/** A full SHA-1 or SHA-256 commit id; anything else is refused before it is stored. */
const COMMIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const DUPLICATE_KEY = 11000;
/** Liveness checks the reaper runs at once within a page. */
const REAP_CONCURRENCY = 8;

/**
 * `owner_inactive` is an account deletion in progress, which can still be cancelled, so the
 * record is kept. `owner_gone` and `conversation_gone` can never run again.
 */
type Liveness = 'live' | 'conversation_gone' | 'owner_gone' | 'owner_inactive';
type Gone = Extract<Liveness, 'conversation_gone' | 'owner_gone'>;
/**
 * What a liveness check is judged against. `tenantId`, when the key is present, is the record's
 * tenant (`null` for one stored without one). `conversationRef` is the `_id` of the conversation
 * document the record was enabled for: a conversation deleted and saved again under the same id
 * is a different document, so a record of the old one does not belong to it.
 */
type LivenessScope = { tenantId?: string | null; conversationRef?: string };
const CLAIMABLE_STATES: PRAutomationState[] = ['idle', 'waiting'];
const SETTLEABLE_STATES: PRAutomationState[] = ['fixing', 'needs_user'];
const SETTLED_STATES: PRAutomationState[] = ['waiting', 'needs_user'];
/** Everything that belongs to one run on one pull request, under the given new epoch. */
const runReset = (epoch: string, fields: Record<string, unknown> = {}) => ({
  $set: { state: 'idle', round: 0, claimedHeads: [], epoch, ...fields },
  $unset: { stopCode: '', startedAt: '', lastHeadSha: '', runId: '' },
});
/**
 * Every write to a record goes through `$inc: { version: 1 }`. A write that acts on a record it
 * read first names the version it read, so any change in between, a stop or a trust change
 * included, makes it miss instead of being overwritten.
 */
const BUMP = { $inc: { version: 1 } };
/** GitHub compares `owner/name` without case, so records store and match the lower case form. */
const canonicalRepository = (repository: string) => repository.toLowerCase();
const LINK_FIELDS = [
  '_id',
  'conversationId',
  'user',
  'tenantId',
  'expiredAt',
  'subagentThread.rootConversationId',
  'subagentThread.parentConversationId',
];

/**
 * One aggregation that reads a conversation and up to `MAX_SUBAGENT_DEPTH` ancestors, one
 * `$lookup` per generation, so a liveness check is one round trip at any depth. `$graphLookup`
 * would be shorter but Amazon DocumentDB rejects it. Each lookup is served by the unique
 * `{ conversationId, user, tenantId }` index. Nested lookups bypass the tenant plugin, so
 * ownership, tenant and retention are all judged on the result. The first match is scoped by
 * the tenant plugin inside a tenant context; a caller without one, such as the reaper, names the
 * record's tenant, since the same user and conversation id may exist in more than one tenant.
 */
function lineagePipeline(
  { userId, conversationId }: t.PRAutomationKey,
  scope?: LivenessScope,
): PipelineStage[] {
  const tenant = scope != null && 'tenantId' in scope ? { tenantId: scope.tenantId ?? null } : {};
  const stages: PipelineStage[] = [
    { $match: { user: userId, conversationId, ...tenant } },
    { $limit: 1 },
    {
      $project: {
        _id: 0,
        l0: Object.fromEntries(LINK_FIELDS.map((field) => [field, `$${field}`])),
      },
    },
  ];
  for (let level = 1; level <= MAX_SUBAGENT_DEPTH; level++) {
    const as = `l${level}`;
    stages.push(
      {
        $lookup: {
          from: 'conversations',
          localField: `l${level - 1}.subagentThread.parentConversationId`,
          foreignField: 'conversationId',
          as,
        },
      },
      { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
    );
  }
  const keep: Record<string, 1> = {};
  for (let level = 0; level <= MAX_SUBAGENT_DEPTH; level++) {
    for (const field of LINK_FIELDS) {
      keep[`l${level}.${field}`] = 1;
    }
  }
  stages.push({ $project: { _id: 0, ...keep } });
  return stages;
}

const isGone = (liveness: Liveness): liveness is Gone =>
  liveness === 'conversation_gone' || liveness === 'owner_gone';

export function createPRAutomationMethods(mongoose: typeof import('mongoose')): {
  getPRAutomation: (key: t.PRAutomationKey) => Promise<t.IPRAutomation | null>;
  enablePRAutomation: (params: t.EnablePRAutomationParams) => Promise<t.EnablePRAutomationResult>;
  disablePRAutomation: (key: t.PRAutomationKey) => Promise<{ removed: boolean }>;
  claimPRAutomationRound: (
    params: t.ClaimPRAutomationRoundParams,
  ) => Promise<t.ClaimPRAutomationRoundResult>;
  settlePRAutomationRound: (
    params: t.SettlePRAutomationRoundParams,
  ) => Promise<t.IPRAutomation | null>;
  stopPRAutomation: {
    (key: t.PRAutomationKey, stopCode: 'user_stopped'): Promise<t.IPRAutomation | null>;
    (
      key: t.PRAutomationKey,
      stopCode: t.PRAutomationEventStopCode,
      fence: t.PRAutomationRunFence,
    ): Promise<t.IPRAutomation | null>;
  };
  deletePRAutomations: (
    userId: string,
    conversationIds?: string[],
    conversationRefs?: string[],
  ) => Promise<void>;
  reapPRAutomations: (params?: t.ReapPRAutomationsParams) => Promise<t.ReapPRAutomationsResult>;
  setPRAutomationTrust: (
    key: t.PRAutomationKey,
    trust: PRAutomationTrustLevel,
    maxTrust: PRAutomationTrustLevel,
  ) => Promise<t.IPRAutomation | null>;
  addPRAutomationBot: (
    key: t.PRAutomationKey,
    bot: t.IPRAutomationBot,
    maxBots: number,
    fence: t.PRAutomationBotFence,
  ) => Promise<t.PRAutomationBotResult>;
  removePRAutomationBot: (
    key: t.PRAutomationKey,
    botId: number,
    fence: t.PRAutomationBotFence,
  ) => Promise<t.IPRAutomation | null>;
} {
  let indexesPromise: Promise<void> | null = null;

  /**
   * The unique `{ user, tenantId, conversationId }` index is what keeps concurrent first-time enables
   * from inserting two records that are then claimed independently and exceed the round cap.
   * With `MONGO_AUTO_INDEX=false` the schema declaration alone never builds it, so it is
   * ensured before the first write.
   */
  function ensureIndexes(): Promise<void> {
    if (!indexesPromise) {
      indexesPromise = createIndexesWithRetry(mongoose.models.PRAutomation).catch((error) => {
        indexesPromise = null;
        throw error;
      });
    }
    return indexesPromise;
  }

  const keyFilter = ({ userId, conversationId }: t.PRAutomationKey) => ({
    user: userId,
    conversationId,
  });

  /**
   * Whether a round may run for this record right now: the owner exists and no account
   * deletion has started (the same durable marker agent triggers use), and the conversation
   * and every conversation that controls it still exist and are inside their retention. A
   * subagent thread is controlled by every ancestor up to its root, and a deletion removes
   * one generation before it discovers the next, so the whole parent chain is checked, read in
   * one aggregation. The chain is live only when every link belongs to the owner, is inside
   * its retention and the walk ends at the recorded root. The walk is bounded by
   * `MAX_SUBAGENT_DEPTH`; a longer chain fails closed.
   * Deletions do not fence the record; enable and claim ask this on both sides of their write
   * instead.
   */
  async function checkLiveness(key: t.PRAutomationKey, scope?: LivenessScope): Promise<Liveness> {
    return (await inspectLiveness(key, scope)).liveness;
  }

  /** `checkLiveness`, also naming the conversation document a live check found. */
  async function inspectLiveness(
    key: t.PRAutomationKey,
    scope?: LivenessScope,
  ): Promise<{ liveness: Liveness; conversationRef?: string }> {
    const judged = (liveness: Liveness) => ({ liveness });
    if (!isValidObjectIdString(key.userId)) {
      return judged('owner_inactive');
    }
    const Conversation = mongoose.models.Conversation;
    type Link = {
      _id?: unknown;
      conversationId: string;
      user: string;
      tenantId?: string | null;
      expiredAt?: Date | null;
      subagentThread?: { rootConversationId?: string; parentConversationId?: string };
    };
    const [owner, rows] = await Promise.all([
      mongoose.models.User.findById(key.userId)
        .select('agentTriggerDeletionStartedAt')
        .lean<{ agentTriggerDeletionStartedAt?: Date }>(),
      Conversation.aggregate<Record<string, Link | undefined>>(lineagePipeline(key, scope)),
    ]);
    if (owner == null) {
      return judged('owner_gone');
    }
    if (owner.agentTriggerDeletionStartedAt != null) {
      return judged('owner_inactive');
    }
    /**
     * Links of other users or other tenants never count: a lookup by `conversationId` is scoped
     * by neither. The first link came through the tenant-scoped `$match`, so it names the tenant.
     */
    const now = Date.now();
    const tenant = rows[0]?.l0?.tenantId ?? null;
    const links = new Map<string, Link>();
    for (const row of rows) {
      for (const link of Object.values(row)) {
        const active = link?.expiredAt == null || new Date(link.expiredAt).getTime() > now;
        const owned =
          link != null && String(link.user) === key.userId && (link.tenantId ?? null) === tenant;
        if (link != null && owned && active) {
          links.set(link.conversationId, link);
        }
      }
    }
    const conversation = links.get(key.conversationId);
    if (conversation == null) {
      return judged('conversation_gone');
    }
    let current: Link | undefined = conversation;
    for (let hops = 0; current?.subagentThread?.parentConversationId != null; hops++) {
      if (hops >= MAX_SUBAGENT_DEPTH) {
        return judged('conversation_gone');
      }
      current = links.get(current.subagentThread.parentConversationId);
    }
    const root = conversation.subagentThread?.rootConversationId;
    if (current == null || (root != null && current.conversationId !== root)) {
      return judged('conversation_gone');
    }
    const conversationRef = String(conversation._id);
    if (scope?.conversationRef != null && scope.conversationRef !== conversationRef) {
      return judged('conversation_gone');
    }
    return { liveness: 'live', conversationRef };
  }

  /** A missing owner reads as inactive to callers; the distinction only decides removal. */
  const goneCode = (liveness: Gone) =>
    liveness === 'owner_gone' ? 'owner_inactive' : 'conversation_gone';

  /**
   * A record whose conversation or owner is gone can never run again, so it is removed. This
   * also converges a cleanup that failed after the delete committed. The delete names the
   * version read before the liveness check, so a record renewed after the check is kept; without
   * one nothing is removed and the reaper decides later.
   */
  async function refuseClaim(
    key: t.PRAutomationKey,
    liveness: Exclude<Liveness, 'live'>,
    version: number | undefined,
  ): Promise<t.ClaimPRAutomationRoundResult> {
    if (!isGone(liveness)) {
      return { ok: false, error: { code: liveness } };
    }
    const removed =
      version == null
        ? { deletedCount: 0 }
        : await mongoose.models.PRAutomation.deleteOne({ ...keyFilter(key), version });
    return {
      ok: false,
      error: { code: removed.deletedCount > 0 ? goneCode(liveness) : 'not_found' },
    };
  }

  /**
   * Clamps a valid level to the administrator ceiling. An unknown level is refused rather than
   * narrowed, so a malformed request fails loudly instead of being stored as something else.
   */
  function boundTrust(
    trust: PRAutomationTrustLevel,
    maxTrust: PRAutomationTrustLevel,
  ): PRAutomationTrustLevel {
    if (!PR_AUTOMATION_TRUST_LEVELS.includes(trust)) {
      throw new RangeError('Unknown PR automation trust level');
    }
    return clampPRAutomationTrust(trust, maxTrust);
  }

  function assertStopCode(stopCode: PRAutomationStopCode): void {
    if (!PR_AUTOMATION_STOP_CODES.includes(stopCode)) {
      throw new RangeError('A stopped PR automation needs a known stop code');
    }
  }

  /** Absence is a normal answer here; a query failure throws. */
  async function getPRAutomation(key: t.PRAutomationKey): Promise<t.IPRAutomation | null> {
    const PRAutomation = mongoose.models.PRAutomation;
    return PRAutomation.findOne(keyFilter(key)).select(PROJECTION).lean<t.IPRAutomation>();
  }

  /**
   * Idempotent. An existing active record is returned unchanged. A stopped
   * record is the user explicitly turning the automation back on, so it starts
   * a fresh run: the round counter, the time window, the claimed heads and the
   * run identity reset, which they could not do from a webhook-triggered turn.
   *
   * `binding` names the pull request. Each case below is one conditional write that
   * carries the whole pair and the run reset together, so concurrent requests cannot
   * leave a pair nobody asked for, and a stopped record is revived only by the write
   * that binds it: a binding that is rejected leaves it stopped. A different repository
   * clears the approved bots, which belong to one repository, and starts a fresh run.
   * A different pull request in the same repository keeps the bots and starts a fresh
   * run, because the round count, the time window and the claimed heads describe the
   * previous pull request.
   *
   * Liveness is checked on both sides of the writes, like a claim. An enable for a conversation
   * or owner that is already gone writes nothing. One that passed the first check but lost a
   * race with the deletion and its cleanup removes the record it wrote, so a late enable cannot
   * recreate a record nobody will clean up.
   *
   * `maxTrust` is the administrator ceiling, resolved by the caller. A requested trust level
   * is clamped to it before any write, and a stored level above it is narrowed, so an enabled
   * record never keeps a level the deployment now forbids.
   */
  async function enablePRAutomation({
    trust: requestedTrust,
    maxTrust,
    binding: requested,
    ...key
  }: t.EnablePRAutomationParams): Promise<t.EnablePRAutomationResult> {
    const binding =
      requested == null
        ? undefined
        : { ...requested, repository: canonicalRepository(requested.repository) };
    const trust = requestedTrust == null ? undefined : boundTrust(requestedTrust, maxTrust);
    const { liveness: before, conversationRef } = await inspectLiveness(key);
    if (before !== 'live') {
      return { ok: false, error: { code: isGone(before) ? goneCode(before) : before } };
    }
    await ensureIndexes();
    const PRAutomation = mongoose.models.PRAutomation;
    const filter = keyFilter(key);
    /**
     * The enable reads the record once and makes at most one write, fenced on the version it
     * read, so a stop, a trust change or another enable that lands in between makes it report a
     * retryable `conflict` instead of reviving or overwriting what that change left. The write
     * marks the record `pending` with the attempt, and nothing claims a pending record. Only an
     * attempt that passes its second liveness check clears the mark; one that sees an account
     * deletion start puts the record back as it read it, fenced on the version it wrote. A
     * preimage another rejected attempt left is still pending when it is restored, so two
     * enables crossing the same deletion leave nothing claimable.
     */
    const attempt = randomUUID();
    const observed = await PRAutomation.findOne(filter).lean<t.IPRAutomation & { _id: unknown }>();
    let written: number;
    let restartedRun = true;
    const fresh = (version: number) => ({
      ...filter,
      state: 'idle',
      round: 0,
      trustedBots: [],
      claimedHeads: [],
      epoch: attempt,
      pending: attempt,
      version,
      conversationRef,
      trust: clampPRAutomationTrust(trust, maxTrust),
      ...binding,
    });
    /** A record of an earlier conversation saved under the same id starts over for this one. */
    const replaced =
      observed?.conversationRef != null && observed.conversationRef !== conversationRef;
    if (observed == null) {
      written = 1;
      try {
        await PRAutomation.create(fresh(written));
      } catch (error) {
        if ((error as { code?: number }).code === DUPLICATE_KEY) {
          return { ok: false, error: { code: 'conflict' } };
        }
        throw error;
      }
    } else if (replaced) {
      written = observed.version + 1;
      const applied = await PRAutomation.replaceOne(
        { ...filter, version: observed.version },
        {
          ...fresh(written),
          ...(observed.tenantId != null && { tenantId: observed.tenantId }),
        },
        { runValidators: true },
      );
      if (applied.matchedCount === 0) {
        return { ok: false, error: { code: 'conflict' } };
      }
    } else {
      written = observed.version + 1;
      const restart = enableRestart(observed, attempt, binding, trust ?? observed.trust, maxTrust);
      restartedRun = restart != null;
      /** An enable also narrows a stored level the current ceiling no longer allows. */
      const narrowed = clampPRAutomationTrust(observed.trust, maxTrust);
      const update: { $set?: Record<string, unknown>; $unset?: Record<string, string> } =
        restart ?? (narrowed === observed.trust ? {} : { $set: { trust: narrowed } });
      const applied = await PRAutomation.updateOne(
        { ...filter, version: observed.version },
        { ...update, $set: { ...update.$set, conversationRef }, ...BUMP },
        { runValidators: true },
      );
      if (applied.matchedCount === 0) {
        return { ok: false, error: { code: 'conflict' } };
      }
    }
    const after = await checkLiveness(key, { conversationRef });
    if (isGone(after)) {
      await PRAutomation.deleteOne({ ...filter, version: written });
      return { ok: false, error: { code: goneCode(after) } };
    }
    if (after !== 'live') {
      if (restartedRun) {
        await undoEnable(filter, written, observed);
      }
      return { ok: false, error: { code: after } };
    }
    if (restartedRun) {
      const committed = await PRAutomation.updateOne(
        { ...filter, version: written, pending: attempt },
        { $unset: { pending: '' }, ...BUMP },
      );
      if (committed.matchedCount === 0) {
        return { ok: false, error: { code: 'conflict' } };
      }
    }
    const record = await getPRAutomation(key);
    if (record == null) {
      throw new Error('PR automation record missing after enable');
    }
    return { ok: true, value: record };
  }

  /**
   * The run-starting write an enable makes on an existing record, or `null` when the record is
   * already running on the requested binding. A stopped record, a different binding, or a record
   * another attempt left pending starts a fresh run under the attempt's epoch. A different
   * repository also clears the approved bots, which belong to one repository. The run starts
   * with the requested trust, or the stored one, clamped to the current ceiling.
   */
  function enableRestart(
    current: t.IPRAutomation,
    attempt: string,
    binding: t.PRAutomationBinding | undefined,
    trust: PRAutomationTrustLevel,
    maxTrust: PRAutomationTrustLevel,
  ): ReturnType<typeof runReset> | null {
    const otherRepository = binding != null && current.repository !== binding.repository;
    const restart =
      current.state === 'stopped' ||
      current.pending != null ||
      otherRepository ||
      (binding != null && current.pullNumber !== binding.pullNumber);
    if (!restart) {
      return null;
    }
    return runReset(attempt, {
      trust: clampPRAutomationTrust(trust, maxTrust),
      ...binding,
      ...(otherRepository && { trustedBots: [] }),
      pending: attempt,
    });
  }

  /**
   * Puts the record back as the enable read it when an account deletion started during the
   * write, which can still be cancelled. It applies only while the record still carries the
   * version the enable wrote, so anything that changed it since, a stop, a trust change or a
   * later enable, is kept, and the record then stays pending, which nothing claims.
   */
  async function undoEnable(
    key: ReturnType<typeof keyFilter>,
    written: number,
    previous: (t.IPRAutomation & { _id: unknown }) | null,
  ): Promise<void> {
    const PRAutomation = mongoose.models.PRAutomation;
    const guard = { ...key, version: written };
    if (previous == null) {
      await PRAutomation.deleteOne(guard);
      return;
    }
    await PRAutomation.replaceOne(guard, { ...previous, version: written + 1 });
  }

  async function disablePRAutomation(key: t.PRAutomationKey): Promise<{ removed: boolean }> {
    const PRAutomation = mongoose.models.PRAutomation;
    const result = await PRAutomation.deleteOne(keyFilter(key));
    return { removed: result.deletedCount > 0 };
  }

  /**
   * Starts one fix round, atomically. The round count, the time window, the
   * state and the head are all conditions of a single `findOneAndUpdate`, so two
   * deliveries racing for the same record cannot both pass the cap. A head that
   * any earlier round already claimed is rejected, so a delayed delivery of a
   * superseded commit cannot spend the budget. The persisted counter is what
   * stops a new turn from resetting the cap. Each claim gets a `runId`, which
   * the round must present to settle. The delivery names the pull request it is
   * for, and the claim applies only while the record is still bound to it, so an
   * event that arrives after a rebind cannot spend the new pull request's budget.
   *
   * A force-push back to an earlier SHA is rejected the same way; the user
   * restarts the automation to work on it.
   */
  async function claimPRAutomationRound({
    binding,
    maxRounds,
    maxMinutes,
    headSha: rawHeadSha,
    now = new Date(),
    ...key
  }: t.ClaimPRAutomationRoundParams): Promise<t.ClaimPRAutomationRoundResult> {
    if (!COMMIT_SHA.test(rawHeadSha)) {
      throw new RangeError('headSha must be a full commit SHA');
    }
    /** One Git object, one identity: hex case must not let a commit spend two rounds. */
    const headSha = rawHeadSha.toLowerCase();
    const PRAutomation = mongoose.models.PRAutomation;
    const repository = canonicalRepository(binding.repository);
    const filter = {
      ...keyFilter(key),
      repository,
      pullNumber: binding.pullNumber,
      epoch: binding.epoch,
    };
    const cutoff = new Date(now.getTime() - maxMinutes * 60_000);
    const runId = randomUUID();

    /**
     * Conversations also leave through the retention index, which never runs
     * `deleteConvos`, so liveness is checked here rather than trusted to a cascade.
     */
    const seen = await PRAutomation.findOne(keyFilter(key))
      .select({ _id: 0, version: 1, conversationRef: 1 })
      .lean<{ version: number; conversationRef?: string }>();
    const before = await checkLiveness(key, { conversationRef: seen?.conversationRef });
    if (before !== 'live') {
      return refuseClaim(key, before, seen?.version);
    }

    /**
     * The window opens with the first round that is actually claimed. `$min` sets `startedAt`
     * only when it is missing and keeps the earlier time otherwise, so the window is part of the
     * same atomic write: a claim that fails or is abandoned leaves nothing behind to count
     * against `maxMinutes`.
     */
    const claimed = await PRAutomation.findOneAndUpdate(
      {
        ...filter,
        state: { $in: CLAIMABLE_STATES },
        pending: { $exists: false },
        round: { $lt: maxRounds },
        $or: [{ startedAt: { $exists: false } }, { startedAt: { $gte: cutoff } }],
        claimedHeads: { $ne: headSha },
      },
      {
        $min: { startedAt: now },
        $inc: { round: 1, version: 1 },
        $set: { state: 'fixing', lastHeadSha: headSha, runId },
        $push: { claimedHeads: headSha },
        $unset: { stopCode: '' },
      },
      { new: true, select: PROJECTION },
    ).lean<t.IPRAutomation>();
    if (claimed != null) {
      /**
       * A deletion that started between the first check and the write is seen here. The
       * whole claim is undone under its own run id, so it never starts work and a cancelled
       * deletion leaves the record as it was: the round, the window and the head are not
       * spent. Rounds and heads are claimed one for one and the window opens with the first
       * round, so the state before the claim follows from the claimed record. A record whose
       * conversation or owner is gone is removed.
       */
      let after: Liveness;
      try {
        after = await checkLiveness(key, { conversationRef: claimed.conversationRef });
      } catch (error) {
        /** A check that fails leaves no answer to act on, so the round is handed back. */
        await releaseClaim(key, claimed, runId).catch(() => undefined);
        throw error;
      }
      if (after === 'live') {
        return { ok: true, value: { ...claimed, runId } };
      }
      const released = await releaseClaim(key, claimed, runId);
      /** Only a claim that undid itself knows the version it left; otherwise the reaper decides. */
      return refuseClaim(key, after, released?.version);
    }

    const current = await getPRAutomation(key);
    if (current == null) {
      return { ok: false, error: { code: 'not_found' } };
    }
    if (
      current.repository !== repository ||
      current.pullNumber !== binding.pullNumber ||
      current.epoch !== binding.epoch
    ) {
      return { ok: false, error: { code: 'binding_mismatch' } };
    }
    if (!CLAIMABLE_STATES.includes(current.state)) {
      return { ok: false, error: { code: 'not_active' } };
    }
    if (current.round >= maxRounds) {
      return { ok: false, error: { code: 'round_cap' } };
    }
    if (current.startedAt != null && current.startedAt < cutoff) {
      return { ok: false, error: { code: 'time_cap' } };
    }
    if (current.pending != null) {
      /** An enable is still deciding; it either commits this run or replaces it. */
      return { ok: false, error: { code: 'conflict' } };
    }
    if (current.claimedHeads.includes(headSha)) {
      return { ok: false, error: { code: 'stale_head' } };
    }
    /** Every condition passes now, so the record changed between the write and this read. */
    return { ok: false, error: { code: 'conflict' } };
  }

  /**
   * Undoes a claim that will not run. It is fenced on the claim's own run identity rather than
   * the version: a trust or bot change made meanwhile touches nothing the claim owns, and must
   * not strand the round. Rounds and heads are claimed one for one and the window opens with the
   * first round, so the state before the claim follows from the claimed record.
   */
  async function releaseClaim(
    key: t.PRAutomationKey,
    claimed: t.IPRAutomation,
    runId: string,
  ): Promise<{ version: number } | null> {
    const previousHeads = claimed.claimedHeads.slice(0, -1);
    const lastHeadSha = previousHeads[previousHeads.length - 1];
    return mongoose.models.PRAutomation.findOneAndUpdate(
      { ...keyFilter(key), runId, state: 'fixing', round: claimed.round },
      {
        ...BUMP,
        $set: {
          state: lastHeadSha == null ? 'idle' : 'waiting',
          round: claimed.round - 1,
          claimedHeads: previousHeads,
          ...(lastHeadSha != null && { lastHeadSha }),
        },
        $unset: {
          runId: '',
          ...(lastHeadSha == null && { startedAt: '', lastHeadSha: '' }),
        },
      },
      { new: true, projection: { _id: 0, version: 1 } },
    ).lean<{ version: number }>();
  }

  /**
   * Reports where the round that owns the record ended up. The transition only
   * applies while that round is still the current one, identified by its
   * `runId`, so a completion that is retried after a later round was claimed, or
   * after the run was stopped, restarted or rebound, cannot move the newer run
   * to `waiting` and open the way for an overlapping claim. Returns `null` when
   * nothing changed: no record, a stopped record, or a round that is not the
   * current one.
   */
  async function settlePRAutomationRound({
    round,
    runId,
    state,
    ...key
  }: t.SettlePRAutomationRoundParams): Promise<t.IPRAutomation | null> {
    if (!SETTLED_STATES.includes(state)) {
      throw new RangeError(
        'A round settles as waiting or needs_user; use stopPRAutomation to stop',
      );
    }
    const PRAutomation = mongoose.models.PRAutomation;
    return PRAutomation.findOneAndUpdate(
      { ...keyFilter(key), state: { $in: SETTLEABLE_STATES }, round, runId },
      { $set: { state }, ...BUMP },
      { new: true, select: PROJECTION },
    ).lean<t.IPRAutomation>();
  }

  /**
   * Stops the automation whatever round is running. A stop code is required: the client
   * maps it to the reason it shows. The first stop wins, and a stopped record leaves that
   * state only through `enablePRAutomation`.
   *
   * A user stop is unconditional, so it is never lost to a race; any fence passed with it is
   * ignored. Every other code comes from an event about one run, and a delayed one must not
   * stop the run that replaced it, so it names the pull request and the epoch it saw and
   * applies only while both are current. A restart on the same pull request starts a new
   * epoch, so a stop meant for the previous run cannot end the new one.
   */
  async function stopPRAutomation(
    key: t.PRAutomationKey,
    stopCode: PRAutomationStopCode,
    fence?: t.PRAutomationRunFence,
  ): Promise<t.IPRAutomation | null> {
    assertStopCode(stopCode);
    const user = stopCode === 'user_stopped';
    if (!user && (fence?.repository == null || fence.pullNumber == null || !fence.epoch)) {
      throw new RangeError('An event-driven stop must name the pull request and run it is for');
    }
    const condition =
      user || fence == null
        ? {}
        : {
            repository: canonicalRepository(fence.repository),
            pullNumber: fence.pullNumber,
            epoch: fence.epoch,
          };
    const PRAutomation = mongoose.models.PRAutomation;
    return PRAutomation.findOneAndUpdate(
      { ...keyFilter(key), ...condition, state: { $ne: 'stopped' } },
      { $set: { state: 'stopped', stopCode }, ...BUMP },
      { new: true, select: PROJECTION },
    ).lean<t.IPRAutomation>();
  }

  /**
   * Removes every record of a user, or of the listed conversations, in bounded batches.
   * Cleanup only: it creates nothing, so a deployment that never used the feature pays one
   * indexed delete that matches no document. `conversationRefs`, aligned with
   * `conversationIds`, names the conversation documents that were deleted, so a record enabled
   * for a conversation saved again under the same id meanwhile is kept.
   */
  async function deletePRAutomations(
    userId: string,
    conversationIds?: string[],
    conversationRefs?: string[],
  ): Promise<void> {
    const PRAutomation = mongoose.models.PRAutomation;
    if (PRAutomation == null || conversationIds?.length === 0) {
      return;
    }
    if (conversationIds == null) {
      await PRAutomation.deleteMany({ user: userId });
      return;
    }
    for (let start = 0; start < conversationIds.length; start += DELETE_BATCH) {
      const refs = conversationRefs?.slice(start, start + DELETE_BATCH);
      await PRAutomation.deleteMany({
        user: userId,
        conversationId: { $in: conversationIds.slice(start, start + DELETE_BATCH) },
        ...(refs != null && {
          $or: [{ conversationRef: { $in: refs } }, { conversationRef: { $exists: false } }],
        }),
      });
    }
  }

  /**
   * Removes records whose conversation, an ancestor of it, or owner is gone, one page at a time
   * in `_id` order. The retention index deletes conversations without running `deleteConvos`,
   * so an idle record would otherwise outlive its conversation; this is the periodic pass that
   * catches it. A deletion in progress keeps its records, as it does for a claim.
   */
  async function reapPRAutomations({
    after,
    limit = 100,
  }: t.ReapPRAutomationsParams = {}): Promise<t.ReapPRAutomationsResult> {
    const PRAutomation = mongoose.models.PRAutomation;
    const page = await PRAutomation.find(after == null ? {} : { _id: { $gt: after } })
      .sort({ _id: 1 })
      .limit(limit)
      .select({ _id: 1, user: 1, tenantId: 1, conversationId: 1, conversationRef: 1, version: 1 })
      .lean<
        Array<{
          _id: Types.ObjectId;
          user: string;
          tenantId?: string;
          conversationId: string;
          conversationRef?: string;
          version: number;
        }>
      >();
    const reap = async (record: (typeof page)[number]): Promise<number> => {
      const key = { userId: String(record.user), conversationId: record.conversationId };
      const scope = { tenantId: record.tenantId, conversationRef: record.conversationRef };
      if (!isGone(await checkLiveness(key, scope))) {
        return 0;
      }
      /** A record written after the check, a renewed enable included, has a new version. */
      const result = await PRAutomation.deleteOne({
        _id: record._id,
        ...keyFilter(key),
        version: record.version,
      });
      return result.deletedCount;
    };
    let removed = 0;
    /** A few checks at a time, so a large page neither runs serially nor floods the database. */
    for (let start = 0; start < page.length; start += REAP_CONCURRENCY) {
      const counts = await Promise.all(page.slice(start, start + REAP_CONCURRENCY).map(reap));
      for (const count of counts) {
        removed += count;
      }
    }
    const last = page.length === limit ? page[page.length - 1] : undefined;
    return {
      scanned: page.length,
      removed,
      ...(last == null ? {} : { next: String(last._id) }),
    };
  }

  /** `maxTrust` is the administrator ceiling; a wider request is stored as the ceiling. */
  async function setPRAutomationTrust(
    key: t.PRAutomationKey,
    trust: PRAutomationTrustLevel,
    maxTrust: PRAutomationTrustLevel,
  ): Promise<t.IPRAutomation | null> {
    const PRAutomation = mongoose.models.PRAutomation;
    return PRAutomation.findOneAndUpdate(
      keyFilter(key),
      { $set: { trust: boundTrust(trust, maxTrust) }, ...BUMP },
      { new: true, select: PROJECTION, runValidators: true },
    ).lean<t.IPRAutomation>();
  }

  /**
   * Idempotent by numeric id. The limit is the configured `maxBots`, resolved by
   * the caller, and cannot exceed the schema ceiling. A login is stored for
   * display only. The approval names the repository and the epoch it was authorized
   * against and applies only while both are current, so an approval that overlaps a
   * rebind, including one away and back to the same repository that cleared the list,
   * cannot add a bot nobody approved for the current binding.
   */
  async function addPRAutomationBot(
    key: t.PRAutomationKey,
    bot: t.IPRAutomationBot,
    maxBots: number,
    fence: t.PRAutomationBotFence,
  ): Promise<t.PRAutomationBotResult> {
    const repository = canonicalRepository(fence.repository);
    const { epoch } = fence;
    if (!Number.isInteger(maxBots) || maxBots < 1 || maxBots > MAX_PR_AUTOMATION_BOTS) {
      throw new RangeError(`maxBots must be an integer from 1 to ${MAX_PR_AUTOMATION_BOTS}`);
    }
    const PRAutomation = mongoose.models.PRAutomation;
    const updated = await PRAutomation.findOneAndUpdate(
      {
        ...keyFilter(key),
        repository,
        epoch,
        'trustedBots.id': { $ne: bot.id },
        [`trustedBots.${maxBots - 1}`]: { $exists: false },
      },
      { $push: { trustedBots: bot }, ...BUMP },
      { new: true, select: PROJECTION, runValidators: true },
    ).lean<t.IPRAutomation>();
    if (updated != null) {
      return { ok: true, value: updated };
    }

    const current = await getPRAutomation(key);
    if (current == null) {
      return { ok: false, error: { code: 'not_found' } };
    }
    if (current.repository !== repository || current.epoch !== epoch) {
      return { ok: false, error: { code: 'binding_mismatch' } };
    }
    if (current.trustedBots.some((existing) => existing.id === bot.id)) {
      return { ok: true, value: current };
    }
    return { ok: false, error: { code: 'bot_limit' } };
  }

  /**
   * Names the repository and epoch like an approval does, so a delayed removal cannot delete
   * an approval made for a later binding, including one away and back to the same repository.
   */
  async function removePRAutomationBot(
    key: t.PRAutomationKey,
    botId: number,
    { repository, epoch }: t.PRAutomationBotFence,
  ): Promise<t.IPRAutomation | null> {
    const PRAutomation = mongoose.models.PRAutomation;
    return PRAutomation.findOneAndUpdate(
      { ...keyFilter(key), repository: canonicalRepository(repository), epoch },
      { $pull: { trustedBots: { id: botId } }, ...BUMP },
      { new: true, select: PROJECTION },
    ).lean<t.IPRAutomation>();
  }

  return {
    getPRAutomation,
    enablePRAutomation,
    disablePRAutomation,
    claimPRAutomationRound,
    settlePRAutomationRound,
    stopPRAutomation,
    deletePRAutomations,
    reapPRAutomations,
    setPRAutomationTrust,
    addPRAutomationBot,
    removePRAutomationBot,
  };
}

export type PRAutomationMethods = ReturnType<typeof createPRAutomationMethods>;
