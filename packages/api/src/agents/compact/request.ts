import { v4 as uuidv4 } from 'uuid';
import { logger } from '@librechat/data-schemas';
import {
  Constants,
  ViolationTypes,
  isAssistantsEndpoint,
  supportsBalanceCheck,
} from 'librechat-data-provider';
import type {
  Agent,
  TMessage,
  TModelsConfig,
  TResponseUsage,
  AgentModelParameters,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type {
  GetAgentFn,
  CompactionPass,
  CompactionResult,
  CompactionSkillDeps,
  CompactionUsage,
  GetFilesFn,
  GetUserKeyExpiryFn,
} from './summary';
import type { BulkWriteDeps, PricingFns } from '~/agents/transactions';
import type { ValidateAgentModelParams } from '~/agents/validation';
import type { CheckBalanceDeps } from '~/middleware/checkBalance';
import type { EndpointDbMethods, ServerRequest } from '~/types';
import type { EndpointTokenConfig } from '~/types/tokens';
import type { RecordUsageDeps } from '~/agents/usage';
import {
  compactConversation,
  resolveAgentModelParameters,
  selectBranchMessages,
  BilledCompactionError,
  NothingToCompactError,
  TranscriptTooLargeError,
  UnworkableContextError,
} from './summary';
import {
  checkAndIncrementPendingRequest,
  decrementPendingRequest,
  getViolationInfo,
} from '~/middleware/concurrency';
import { aggregateEmittedUsage, computeUsageCostUSD, recordCollectedUsage } from '~/agents/usage';
import { getBalanceConfig, getTransactionsConfig } from '~/app/config';
import { validateAgentModel } from '~/agents/validation';
import { checkBalance } from '~/middleware/checkBalance';
import { resolveSender } from '~/agents/sender';
import { acquireCompactionLock } from './lock';

/** Ceiling on how long a stale lease can wedge a conversation if the process
 *  dies mid-compaction. Comfortably above the summary call's own timeout. */
const COMPACT_LOCK_TTL_MS = 180_000;

export const CompactErrorCodes = {
  NOTHING_TO_COMPACT: 'NOTHING_TO_COMPACT',
  COMPACTION_DISABLED: 'COMPACTION_DISABLED',
  UNSUPPORTED_ENDPOINT: 'UNSUPPORTED_ENDPOINT',
  ALREADY_RUNNING: 'ALREADY_RUNNING',
  GENERATING: 'GENERATING',
  BRANCH_MOVED: 'BRANCH_MOVED',
  TRANSCRIPT_TOO_LARGE: 'TRANSCRIPT_TOO_LARGE',
  UNWORKABLE_CONTEXT: 'UNWORKABLE_CONTEXT',
  CONCURRENT_LIMIT: 'CONCURRENT_LIMIT',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  ILLEGAL_MODEL: 'ILLEGAL_MODEL',
  SAVE_FAILED: 'SAVE_FAILED',
  FAILED: 'FAILED',
} as const;

export type CompactErrorCode = (typeof CompactErrorCodes)[keyof typeof CompactErrorCodes];

/** What the HTTP adapter renders. Never an Express response itself, so the
 *  whole flow stays testable without standing up a server. */
export type CompactRequestResult =
  | { status: 201; message: TMessage }
  | { status: number; error: string; code: CompactErrorCode };

type MessageFilter = { conversationId: string; user: string; parentMessageId?: string };

/**
 * Persistence, pricing and policy seams, injected so `/api` keeps only its
 * Express adapter. Every function type is borrowed from the module that
 * consumes it, so a signature change upstream fails here rather than drifting.
 */
export interface CompactRequestDeps
  extends EndpointDbMethods,
    Pick<RecordUsageDeps, 'spendTokens' | 'spendStructuredTokens'>,
    Pick<
      CheckBalanceDeps,
      'findBalanceByUser' | 'createAutoRefillTransaction' | 'upsertBalanceFields'
    >,
    PricingFns,
    BulkWriteDeps {
  getMessages: (filter: MessageFilter, select?: string) => Promise<TMessage[] | null>;
  saveMessage: (
    ctx: { userId: string; isTemporary?: boolean; interfaceConfig?: AppConfig['interfaceConfig'] },
    message: Partial<TMessage> & { user: string },
    meta?: { context?: string },
  ) => Promise<TMessage | undefined>;
  deleteMessages: (filter: {
    conversationId: string;
    user: string;
    messageId: string;
  }) => Promise<unknown>;
  getModelsConfig: (req: ServerRequest) => Promise<TModelsConfig>;
  getJob: (streamId: string) => Promise<
    | {
        status?: string;
        /** Start of the generation this job belongs to. A job newer than the
         *  compaction means a turn began while it was running. */
        createdAt?: number;
        metadata?: { terminalPersistencePending?: boolean };
      }
    | null
    | undefined
  >;
  getFiles: GetFilesFn;
  /** Resolves the agents named in multi-agent history, for attribution. */
  getAgent?: GetAgentFn;
  /** Resolves historical skill bodies so the checkpoint records a manually
   *  invoked skill's constraints. Omitted when skills are disabled. */
  skills?: CompactionSkillDeps;
  /** Stored user-key expiry, so the freshness marker is resolved for the
   *  endpoint compaction runs on rather than taken from the request. */
  getUserKeyExpiry?: GetUserKeyExpiryFn;
  /** Widest shape both consumers accept: `checkBalance` types its request as
   *  `unknown` and passes a numeric score, `validateAgentModel` types the
   *  request narrowly and may pass a string one. */
  logViolation: (
    req: unknown,
    res: unknown,
    type: string,
    errorMessage: Record<string, unknown>,
    score?: number | string,
  ) => Promise<void>;
}

/** Express `res` surface `checkBalance` and `validateAgentModel` need for
 *  violation logging. Structural so a test can pass a stub. */
type ViolationResponse = ValidateAgentModelParams['res'];

export interface HandleCompactRequestParams {
  req: ServerRequest;
  res: ViolationResponse;
  signal?: AbortSignal;
}

/**
 * What to bill for one compaction, decided per call rather than all-or-nothing:
 * a gateway that reports usage for some passes and omits it for others would
 * otherwise leave the omitted ones unbilled.
 */
function billableUsages(
  passes: CompactionPass[],
  model?: string,
  provider?: string,
): CompactionUsage[] {
  return passes.map((pass) => pass.usage ?? { model, provider, ...pass.counted });
}

/**
 * True while another turn owns the conversation's branch tail.
 *
 * A terminal status is not the end of that ownership: the generation CASes
 * itself complete before its final message reaches the database, and during
 * that window the leaf this request would compact is still the OLD one. Same
 * three states `isParentActive` fences a subagent wakeup on, and `getJob`
 * already expires a pending flag left behind by a crash.
 *
 * `since` additionally rejects a job that STARTED after the compaction did,
 * whatever state it has reached: a job is created before its response is
 * saved, so a turn that began and even finished during the call is visible
 * here rather than only through a sibling row that may not be written yet.
 */
async function isGenerating(
  getJob: CompactRequestDeps['getJob'],
  conversationId: string,
  since?: number,
): Promise<boolean> {
  const job = await getJob(conversationId);
  if (job == null) {
    return false;
  }
  if (since != null && typeof job.createdAt === 'number' && job.createdAt >= since) {
    return true;
  }
  return (
    job.status === 'running' ||
    job.status === 'requires_action' ||
    job.metadata?.terminalPersistencePending === true
  );
}

/**
 * Instruction + tool-schema overhead observed on the branch's most recent
 * response. Same agent and model, so it is the right constant to fold into the
 * compacted baseline the client reads.
 */
function priorInstructionTokens(priorResponse?: TMessage): number {
  const snapshot = priorResponse?.metadata?.contextUsage as
    | { effectiveInstructionTokens?: number; breakdown?: { instructionTokens?: number } }
    | undefined;
  const tokens = snapshot?.effectiveInstructionTokens ?? snapshot?.breakdown?.instructionTokens;
  return typeof tokens === 'number' && tokens > 0 ? tokens : 0;
}

/**
 * Bills one compaction call and returns the rollup to persist on the message.
 * Billing failures are logged, never fatal: the provider call that produced
 * the summary already happened.
 */
async function recordCompactionUsage(
  deps: CompactRequestDeps,
  {
    userId,
    appConfig,
    conversationId,
    messageId,
    usages,
    model,
    endpointTokenConfig,
  }: {
    userId: string;
    appConfig?: AppConfig;
    conversationId: string;
    messageId: string;
    /** One record per provider call, passed through unsummed so each is priced
     *  against its own input count rather than the run's total. */
    usages: CompactionUsage[];
    model?: string;
    endpointTokenConfig?: EndpointTokenConfig;
  },
): Promise<TResponseUsage | null> {
  const pricing: PricingFns = {
    getMultiplier: deps.getMultiplier,
    getCacheMultiplier: deps.getCacheMultiplier,
  };
  await recordCollectedUsage(
    {
      pricing,
      spendTokens: deps.spendTokens,
      spendStructuredTokens: deps.spendStructuredTokens,
      bulkWriteOps: { insertMany: deps.insertMany, updateBalance: deps.updateBalance },
    },
    {
      user: userId,
      conversationId,
      messageId,
      collectedUsage: usages.map((usage) => ({ ...usage, usage_type: 'summarization' })),
      model,
      context: 'summarization',
      balance: getBalanceConfig(appConfig),
      transactions: getTransactionsConfig(appConfig),
      endpointTokenConfig,
    },
  ).catch((error) => {
    logger.error('[compact] Error recording usage', error);
  });

  const events: Array<CompactionUsage & { cost?: number }> = usages.map((usage) => {
    const event: CompactionUsage & { cost?: number } = { ...usage };
    if (appConfig?.interfaceConfig?.contextCost === true) {
      try {
        event.cost = computeUsageCostUSD(usage, pricing, endpointTokenConfig);
      } catch (error) {
        logger.warn('[compact] Could not price the compaction call', error);
      }
    }
    return event;
  });
  return aggregateEmittedUsage(events);
}

/**
 * Orchestrates one manual compaction: claim, authorize, summarize, bill,
 * persist. Returns a rendered result rather than writing to `res`, so the
 * Express layer stays a mapping of status codes.
 */
export async function handleCompactRequest(
  { req, res, signal }: HandleCompactRequestParams,
  deps: CompactRequestDeps,
): Promise<CompactRequestResult> {
  const body = req.body as Record<string, unknown>;
  /** Anything that claims this conversation from here on raced the compaction,
   *  whether or not it is still running when the tail is verified. */
  const startedAt = Date.now();
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const userId = req.user?.id ?? '';

  if (
    !conversationId ||
    conversationId === Constants.NEW_CONVO ||
    conversationId === Constants.PENDING_CONVO
  ) {
    return { status: 400, error: 'No conversation to compact', code: CompactErrorCodes.FAILED };
  }
  const appConfig = req.config as AppConfig | undefined;
  if (appConfig?.summarization?.enabled === false) {
    return {
      status: 403,
      error: 'Compaction is disabled',
      code: CompactErrorCodes.COMPACTION_DISABLED,
    };
  }
  /** An Assistants thread lives on the provider, so a summary inserted here
   *  would compact nothing, and its provider is not one `getProviderConfig`
   *  can resolve. Rejected outright rather than failing inside the model
   *  resolution. */
  if (isAssistantsEndpoint(endpoint)) {
    return {
      status: 400,
      error: 'Compaction is not supported for this endpoint',
      code: CompactErrorCodes.UNSUPPORTED_ENDPOINT,
    };
  }

  const lock = await acquireCompactionLock(conversationId, COMPACT_LOCK_TTL_MS);
  if (!lock) {
    return {
      status: 409,
      error: 'A compaction is already running',
      code: CompactErrorCodes.ALREADY_RUNNING,
    };
  }

  /** The compaction spends a provider call like any turn, so it takes the same
   *  per-user slot; the conversation lock only serializes one conversation. */
  let holdsSlot = false;
  try {
    if (await isGenerating(deps.getJob, conversationId)) {
      return {
        status: 409,
        error: 'A response is still generating',
        code: CompactErrorCodes.GENERATING,
      };
    }

    const concurrency = await checkAndIncrementPendingRequest(userId);
    if (!concurrency.allowed) {
      const violation = getViolationInfo(concurrency.pendingRequests, concurrency.limit);
      await deps
        .logViolation(
          req,
          res,
          ViolationTypes.CONCURRENT,
          violation as unknown as Record<string, unknown>,
          violation.score,
        )
        .catch(() => {});
      return {
        status: 429,
        error: 'Too many concurrent requests',
        code: CompactErrorCodes.CONCURRENT_LIMIT,
      };
    }
    holdsSlot = true;

    const endpointOption = body.endpointOption as
      | { agent?: Promise<Agent | null>; model_parameters?: Partial<AgentModelParameters> }
      | undefined;
    const [loadedAgent, allMessages, modelsConfig] = await Promise.all([
      endpointOption?.agent,
      deps.getMessages({ conversationId, user: userId }),
      deps.getModelsConfig(req),
    ]);

    if (!loadedAgent) {
      return { status: 404, error: 'Agent not found', code: CompactErrorCodes.AGENT_NOT_FOUND };
    }

    /** `endpointOption.agent` is the raw stored document, and the request's own
     *  resolved parameters (a model spec among them) live beside it. Merging
     *  them here, with the precedence `initializeAgent` uses for the initial
     *  agent, is what makes compaction run the same model and generation
     *  settings as the turns it is summarizing. The validation below then sees
     *  the model that will ACTUALLY be used. */
    const { modelOptions, maxContextTokens, resendFiles } = resolveAgentModelParameters(
      loadedAgent,
      endpointOption?.model_parameters,
    );
    /** `maxContextTokens` and `resendFiles` are LibreChat-only settings, kept
     *  off the provider parameters but carried through: a normal turn treats
     *  the first as its authoritative context budget and the second as
     *  permission to re-send earlier uploads, and compaction has to as well. */
    const agent: Agent & { maxContextTokens?: number; resendFiles?: boolean } = {
      ...loadedAgent,
      model: modelOptions.model ?? loadedAgent.model,
      model_parameters: modelOptions as Agent['model_parameters'],
      ...(maxContextTokens != null && { maxContextTokens }),
      resendFiles,
    };

    /** The ephemeral agent `buildEndpointOption` builds carries the request's
     *  own `model` verbatim, so without this a caller could compact against a
     *  model absent from their available list. Validated against the AGENT's
     *  model, leaving an administrator's `summarization.model` override alone. */
    const validation = await validateAgentModel({
      req,
      res,
      agent,
      modelsConfig,
      logViolation: deps.logViolation,
    });
    if (!validation.isValid) {
      return {
        status: 422,
        error: validation.error?.message ?? 'Invalid model',
        code: CompactErrorCodes.ILLEGAL_MODEL,
      };
    }

    const leafId =
      (typeof body.parentMessageId === 'string' ? body.parentMessageId : undefined) ??
      allMessages?.[allMessages.length - 1]?.messageId;
    const branch = selectBranchMessages(allMessages ?? [], leafId);
    if (branch.length === 0) {
      return {
        status: 400,
        error: 'No messages to compact',
        code: CompactErrorCodes.NOTHING_TO_COMPACT,
      };
    }

    /** Already known to be stale: another client advanced the conversation
     *  before this request arrived, so the summary could only ever land on a
     *  sibling. Detected from the messages already loaded, before spending. */
    if (allMessages?.some((message) => message.parentMessageId === leafId)) {
      return {
        status: 409,
        error: 'The conversation moved on during compaction',
        code: CompactErrorCodes.BRANCH_MOVED,
      };
    }

    /** Inherit the branch's own assistant identity so the compaction message
     *  carries the same name and avatar as the responses around it, and its
     *  instruction overhead so the persisted baseline matches the automatic
     *  path's. */
    let priorResponse: TMessage | undefined;
    for (let i = branch.length - 1; i >= 0 && !priorResponse; i--) {
      if (branch[i].isCreatedByUser === false) {
        priorResponse = branch[i];
      }
    }

    const balanceConfig = getBalanceConfig(appConfig);
    const messageId = uuidv4();
    const ids = { messageId, conversationId, parentMessageId: leafId };

    let result: CompactionResult;
    try {
      result = await compactConversation({
        req,
        agent,
        branch,
        ids,
        db: {
          getUserKey: deps.getUserKey,
          getUserKeyValues: deps.getUserKeyValues,
          getUserKeyExpiry: deps.getUserKeyExpiry,
        },
        getFiles: deps.getFiles,
        getAgent: deps.getAgent,
        skills: deps.skills,
        signal,
        /** Same gate `BaseClient` applies before a normal turn contacts the
         *  provider, so a spent-out user cannot compact repeatedly for free.
         *  Keyed on `endpointType ?? endpoint` exactly as `BaseClient` does:
         *  a custom endpoint's name is not a key in `supportsBalanceCheck`. */
        beforeInvoke: async ({
          promptTokens,
          passPromptTokens,
          model,
          endpoint: summarizerEndpoint,
          balanceEndpoint,
          endpointTokenConfig,
        }) => {
          /** `supportsBalanceCheck` is keyed by endpoint TYPE: a named custom
           *  endpoint (`Ollama`) lives under `custom` and Vertex AI under
           *  `google`, so looking either up by its own name silently skipped
           *  the gate on a call that is still billed. `balanceEndpoint`
           *  carries that resolved type. Pricing still uses the real endpoint
           *  name plus its token config. */
          const balanceKey = balanceEndpoint;
          if (
            balanceConfig?.enabled !== true ||
            supportsBalanceCheck[balanceKey as keyof typeof supportsBalanceCheck] !== true
          ) {
            return;
          }
          /**
           * Each pass is billed as its OWN call, at the tier its own input
           * selects, so the gate prices them the same way `recordCollectedUsage`
           * will. One `amount` at one rate cannot express that: the standard
           * rate approves a call that is then charged at the premium one, and
           * the premium rate rejects a user who can afford the real charge.
           */
          const tokenCost = passPromptTokens.reduce(
            (total, pass) =>
              total +
              pass *
                deps.getMultiplier({
                  model,
                  tokenType: 'prompt',
                  inputTokenCount: pass,
                  endpointTokenConfig,
                }),
            0,
          );
          await checkBalance(
            {
              req,
              res,
              txData: {
                model,
                user: userId,
                tokenType: 'prompt',
                amount: promptTokens,
                ...(passPromptTokens.length > 0 && { tokenCost }),
                endpoint: summarizerEndpoint,
                endpointTokenConfig,
              },
            },
            {
              balanceConfig,
              logViolation: deps.logViolation,
              getMultiplier: deps.getMultiplier,
              findBalanceByUser: deps.findBalanceByUser,
              createAutoRefillTransaction: deps.createAutoRefillTransaction,
              upsertBalanceFields: deps.upsertBalanceFields,
            },
          );
        },
      });
    } catch (error) {
      /** Provider calls that completed still cost money, whether the pass came
       *  back empty or a later pass threw; bill them before surfacing. */
      if (error instanceof BilledCompactionError) {
        await recordCompactionUsage(deps, {
          userId,
          appConfig,
          conversationId,
          messageId,
          usages: billableUsages(error.passes, error.model, error.provider),
          model: error.model,
          endpointTokenConfig: error.endpointTokenConfig,
        });
      }
      throw error;
    }

    /**
     * Real spend whether or not the summary lands, so bill before deciding.
     * A provider that reported no usage at all (some OpenAI-compatible
     * gateways) is billed from the locally counted prompt and summary sizes,
     * the same fallback `BaseClient` applies, so the call never goes unrecorded.
     */
    const usageRollup = await recordCompactionUsage(deps, {
      userId,
      appConfig,
      conversationId,
      messageId,
      usages: billableUsages(result.passes, result.model, result.provider),
      model: result.summary.model,
      endpointTokenConfig: result.endpointTokenConfig,
    });

    /**
     * Job FIRST, then the children. The two reads are not one operation, but
     * that order makes the pair sound: the terminal claim sets
     * `terminalPersistencePending` before the response is saved and clears it
     * only after, so a job that reads inactive here has already written any
     * child it was going to write, and the read that follows sees it. The
     * reverse order leaves the window where a turn saves and settles between
     * the two reads and neither observes it.
     */
    const tailMoved = async (): Promise<boolean> => {
      if (await isGenerating(deps.getJob, conversationId, startedAt)) {
        return true;
      }
      const children = await deps.getMessages(
        { conversationId, user: userId, parentMessageId: leafId },
        'messageId',
      );
      return (children?.length ?? 0) > 0;
    };

    /** A turn that started during the model call owns the tail, and writing
     *  under it would strand the paid-for summary on a sibling branch. */
    if (await tailMoved()) {
      return {
        status: 409,
        error: 'The conversation moved on during compaction',
        code: CompactErrorCodes.BRANCH_MOVED,
      };
    }

    const savedMessage = await deps.saveMessage(
      {
        userId,
        isTemporary: body.isTemporary === true,
        interfaceConfig: appConfig?.interfaceConfig,
      },
      {
        messageId,
        conversationId,
        parentMessageId: leafId,
        user: userId,
        isCreatedByUser: false,
        sender:
          priorResponse?.sender ??
          resolveSender({
            agent,
            specLabel: typeof body.spec === 'string' ? body.spec : undefined,
            endpointOption: {
              ...((body.endpointOption as Record<string, unknown>) ?? {}),
              model: agent.model_parameters?.model ?? agent.model,
            },
          }),
        endpoint,
        iconURL: priorResponse?.iconURL ?? (body.iconURL as string | undefined),
        model: agent.model_parameters?.model ?? agent.model,
        content: [result.summary],
        tokenCount: 0,
        unfinished: false,
        error: false,
        metadata: {
          /** Caps the client-side context estimate at the compacted baseline
           *  instead of re-summing the history the summary replaced. The client
           *  stops adding its own cached instruction overhead once this marker
           *  exists, so the marker has to carry that overhead the way
           *  `computeSummaryUsedTokens` does. */
          summaryUsedTokens:
            (result.summary.tokenCount ?? 0) + priorInstructionTokens(priorResponse),
          /** The context-usage UI rebuilds branch and session totals from each
           *  response message's `metadata.usage`, so a compaction the user was
           *  charged for is invisible in them without it. */
          ...(usageRollup ? { usage: usageRollup } : {}),
        },
      } as Partial<TMessage> & { user: string },
      { context: 'POST /api/agents/chat/compact' },
    );

    if (!savedMessage) {
      return {
        status: 500,
        error: 'Failed to save the compaction message',
        code: CompactErrorCodes.SAVE_FAILED,
      };
    }

    /** The check above and this insert are not one operation, so confirm the
     *  tail is still ours afterwards and roll back if a turn slipped in. The
     *  compensating delete is what makes the outcome atomic for the reader.
     *  Ordered as in `tailMoved`: the job read has to come first, or a turn
     *  that saves and settles between the two reads is seen by neither. */
    const racingTurn = await isGenerating(deps.getJob, conversationId, startedAt);
    const siblings = racingTurn
      ? undefined
      : await deps.getMessages(
          { conversationId, user: userId, parentMessageId: leafId },
          'messageId',
        );
    if (racingTurn || (siblings?.length ?? 0) > 1) {
      await deps.deleteMessages({ conversationId, user: userId, messageId }).catch((error) => {
        logger.error('[compact] Could not roll back a raced compaction message', error);
      });
      return {
        status: 409,
        error: 'The conversation moved on during compaction',
        code: CompactErrorCodes.BRANCH_MOVED,
      };
    }

    return { status: 201, message: savedMessage };
  } catch (error) {
    /** The branch already ends at a summary boundary, so there is nothing left
     *  for a second pass to fold in. Coded so the client can say so plainly
     *  instead of reporting a failure. */
    if (error instanceof NothingToCompactError) {
      return {
        status: 400,
        error: 'No messages to compact',
        code: CompactErrorCodes.NOTHING_TO_COMPACT,
      };
    }
    /** The summarizer's own window cannot fit a request at all. */
    if (error instanceof UnworkableContextError) {
      return {
        status: 422,
        error: 'The summarization model cannot fit a compaction request',
        code: CompactErrorCodes.UNWORKABLE_CONTEXT,
      };
    }
    /** Refused rather than silently summarizing part of the branch. */
    if (error instanceof TranscriptTooLargeError) {
      return {
        status: 413,
        error: 'This conversation is too long to compact in one pass',
        code: CompactErrorCodes.TRANSCRIPT_TOO_LARGE,
      };
    }
    logger.error('[compact] Error compacting conversation', error);
    return { status: 500, error: 'Failed to compact conversation', code: CompactErrorCodes.FAILED };
  } finally {
    if (holdsSlot) {
      await decrementPendingRequest(userId).catch(() => {});
    }
    await lock.release();
  }
}
