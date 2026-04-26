import { Providers } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import {
  Tools,
  Constants,
  ErrorTypes,
  EModelEndpoint,
  EToolResources,
  paramEndpoints,
  isAgentsEndpoint,
  replaceSpecialVars,
  providerEndpointMap,
} from 'librechat-data-provider';
import type {
  AgentToolResources,
  AgentToolOptions,
  TEndpointOption,
  TFile,
  Agent,
  TUser,
} from 'librechat-data-provider';
import type { GenericTool, LCToolRegistry, ToolMap, LCTool } from '@librechat/agents';
import type { Response as ServerResponse } from 'express';
import type { IMongoFile } from '@librechat/data-schemas';
import type { InitializeResultBase, ServerRequest, EndpointDbMethods } from '~/types';
import {
  optionalChainWithEmptyCheck,
  extractLibreChatParams,
  getModelMaxTokens,
  getThreadData,
} from '~/utils';
import { filterFilesByEndpointConfig } from '~/files';
import { generateArtifactsPrompt } from '~/prompts';
import { getProviderConfig } from '~/endpoints';
import {
  injectSkillCatalog,
  resolveManualSkills,
  resolveAlwaysApplySkills,
  unionPrimeAllowedTools,
  MAX_PRIMED_SKILLS_PER_TURN,
} from './skills';
import { registerCodeExecutionTools } from './tools';
import { primeResources } from './resources';
import type { ResolvedManualSkill, ResolvedAlwaysApplySkill } from './skills';
import type { TFilterFilesByAgentAccess } from './resources';

/**
 * Fraction of context budget reserved as headroom when no explicit maxContextTokens is set.
 * Reduced from 0.10 to 0.05 alongside the introduction of summarization, which actively
 * manages overflow. `createRun` can further override this via `SummarizationConfig.reserveRatio`.
 */
const DEFAULT_RESERVE_RATIO = 0.05;

/**
 * Extended agent type with additional fields needed after initialization
 */
export type InitializedAgent = Agent & {
  tools: GenericTool[];
  attachments: IMongoFile[];
  toolContextMap: Record<string, unknown>;
  maxContextTokens: number;
  /** Pre-ratio context budget (agentMaxContextNum - maxOutputTokensNum). Used by createRun to apply a configurable reserve ratio. */
  baseContextTokens?: number;
  useLegacyContent: boolean;
  resendFiles: boolean;
  tool_resources?: AgentToolResources;
  userMCPAuthMap?: Record<string, Record<string, string>>;
  /** Tool map for ToolNode to use when executing tools (required for PTC) */
  toolMap?: ToolMap;
  /** Tool registry for PTC and tool search (only present when MCP tools with env classification exist) */
  toolRegistry?: LCToolRegistry;
  /** Serializable tool definitions for event-driven execution */
  toolDefinitions?: LCTool[];
  /** Precomputed flag indicating if any tools have defer_loading enabled (for efficient runtime checks) */
  hasDeferredTools?: boolean;
  /** Whether the actions capability is enabled (resolved during tool loading) */
  actionsEnabled?: boolean;
  /** Maximum characters allowed in a single tool result before truncation. */
  maxToolResultChars?: number;
  /**
   * Whether the code-execution environment is available *for this agent*.
   * Narrower than the incoming `params.codeEnvAvailable` admin flag — this
   * is `admin_capability_enabled && agent.tools.includes('execute_code')`,
   * computed once here so downstream code (`injectSkillCatalog`,
   * `enrichWithSkillConfigurable`, `primeInvokedSkills`) doesn't have to
   * re-scan the tool list on every runtime handler invocation.
   * Authoritative for both persisted and ephemeral agents: the
   * ephemeral-agent toggle is reconciled into `agent.tools` upstream
   * (`packages/api/src/agents/added.ts`), so the check is uniform.
   */
  codeEnvAvailable: boolean;
  /** Accessible skill IDs for ACL checking at execute time */
  accessibleSkillIds?: import('mongoose').Types.ObjectId[];
  /** Number of skills in the catalog (used to determine if SkillTool should be registered) */
  skillCount?: number;
  /**
   * Skills the user manually invoked for this turn via the `$` popover, resolved
   * to their SKILL.md bodies. The AgentClient injects these as meta user
   * messages right before the latest user message in the LLM's formatted
   * message array — deterministic priming without a tool roundtrip.
   */
  manualSkillPrimes?: ResolvedManualSkill[];
  /**
   * Skills auto-primed this turn because their `always-apply` frontmatter
   * flag is set. Resolved against the same `accessibleSkillIds` set and
   * subjected to the same active-state / ACL filters as the catalog, then
   * handed to the AgentClient for splicing alongside manual primes. Their
   * `allowedTools` entries also union into the agent's effective tool set
   * via `unionPrimeAllowedTools` (same pipeline as manual primes).
   */
  alwaysApplySkillPrimes?: ResolvedAlwaysApplySkill[];
};

export const DEFAULT_MAX_CONTEXT_TOKENS = 32000;

/**
 * Parameters for initializing an agent
 * Matches the CJS signature from api/server/services/Endpoints/agents/agent.js
 */
export interface InitializeAgentParams {
  /** Request object */
  req: ServerRequest;
  /** Response object */
  res: ServerResponse;
  /** Agent to initialize */
  agent: Agent;
  /** Conversation ID (optional) */
  conversationId?: string | null;
  /** Parent message ID for determining the current thread (optional) */
  parentMessageId?: string | null;
  /** Request files */
  requestFiles?: IMongoFile[];
  /** Function to load agent tools */
  loadTools?: (params: {
    req: ServerRequest;
    res: ServerResponse;
    provider: string;
    agentId: string;
    tools: string[];
    model: string | null;
    tool_options: AgentToolOptions | undefined;
    tool_resources: AgentToolResources | undefined;
  }) => Promise<{
    /** Full tool instances (only present when definitionsOnly=false) */
    tools?: GenericTool[];
    toolContextMap?: Record<string, unknown>;
    userMCPAuthMap?: Record<string, Record<string, string>>;
    toolRegistry?: LCToolRegistry;
    /** Serializable tool definitions for event-driven mode */
    toolDefinitions?: LCTool[];
    hasDeferredTools?: boolean;
    actionsEnabled?: boolean;
  } | null>;
  /** Endpoint option (contains model_parameters and endpoint info) */
  endpointOption?: Partial<TEndpointOption>;
  /** Set of allowed providers */
  allowedProviders: Set<string>;
  /** Whether this is the initial agent */
  isInitialAgent?: boolean;
  /** Accessible skill IDs for this user (pre-computed by the caller via ACL query) */
  accessibleSkillIds?: import('mongoose').Types.ObjectId[];
  /** Whether the code execution environment is available (execute_code capability enabled) */
  codeEnvAvailable?: boolean;
  /** Per-user skill active/inactive overrides for filtering the skill catalog. */
  skillStates?: Record<string, boolean>;
  /** Admin-configured default for shared skills (`true` = shared skills auto-activate). */
  defaultActiveOnShare?: boolean;
  /**
   * Skill names the user invoked manually for this turn via the `$` popover.
   * Resolved here (ACL + active-state filtered) and attached to the returned
   * InitializedAgent as `manualSkillPrimes` for the AgentClient to inject as
   * meta user messages before the LLM call.
   */
  manualSkills?: string[];
}

/**
 * Database methods required for agent initialization
 * Most methods come from data-schemas via createMethods()
 * getConvoFiles not yet in data-schemas but included here for consistency
 */
export interface InitializeAgentDbMethods extends EndpointDbMethods {
  /** Update usage tracking for multiple files */
  updateFilesUsage: (files: Array<{ file_id: string }>, fileIds?: string[]) => Promise<unknown[]>;
  /** Get files from database */
  getFiles: (filter: unknown, sort: unknown, select: unknown) => Promise<unknown[]>;
  /** Filter files by agent access permissions (ownership or agent attachment) */
  filterFilesByAgentAccess?: TFilterFilesByAgentAccess;
  /** Get tool files by IDs (user-uploaded files only, code files handled separately) */
  getToolFilesByIds: (fileIds: string[], toolSet: Set<EToolResources>) => Promise<unknown[]>;
  /** Get conversation file IDs */
  getConvoFiles: (conversationId: string) => Promise<string[] | null>;
  /** Get code-generated files by conversation ID and optional message IDs */
  getCodeGeneratedFiles?: (conversationId: string, messageIds?: string[]) => Promise<unknown[]>;
  /** Get user-uploaded execute_code files by file IDs (from message.files in thread) */
  getUserCodeFiles?: (fileIds: string[]) => Promise<unknown[]>;
  /** Get messages for a conversation (supports select for field projection) */
  getMessages?: (
    filter: { conversationId: string },
    select?: string,
  ) => Promise<Array<{
    messageId: string;
    parentMessageId?: string;
    files?: Array<{ file_id: string }>;
  }> | null>;
  /** List skill summaries for catalog injection (paginated, omits body/frontmatter) */
  listSkillsByAccess?: (params: {
    accessibleIds: import('mongoose').Types.ObjectId[];
    limit: number;
    cursor?: string | null;
  }) => Promise<{
    skills: Array<{
      _id: import('mongoose').Types.ObjectId;
      name: string;
      description: string;
      author: import('mongoose').Types.ObjectId;
      /**
       * When `true`, the skill is excluded from the catalog injected into
       * the agent's additional_instructions and the model cannot invoke it
       * via the `skill` tool. Manual `$` invocation is unaffected.
       */
      disableModelInvocation?: boolean;
      /**
       * When `false`, the skill is hidden from the `$` popover and rejected
       * by the manual-invocation resolver. Defaults to `true`.
       */
      userInvocable?: boolean;
    }>;
    has_more?: boolean;
    after?: string | null;
  }>;
  /**
   * Load a single skill by name, constrained to an ACL-accessible ID set.
   * Returns the full document (including `body`) so manual invocation can
   * prime SKILL.md without a second DB round-trip.
   *
   * `preferUserInvocable` (manual paths): on a same-name collision,
   * prefer the newest doc with `userInvocable !== false`.
   * `preferModelInvocable` (model paths — `skill` / `read_file`): on a
   * same-name collision, prefer the newest doc with
   * `disableModelInvocation !== true`. Both fall back to the newest match
   * so the explicit-rejection error paths still fire when only the
   * non-preferred variant exists.
   */
  getSkillByName?: (
    name: string,
    accessibleIds: import('mongoose').Types.ObjectId[],
    options?: { preferUserInvocable?: boolean; preferModelInvocable?: boolean },
  ) => Promise<{
    _id: import('mongoose').Types.ObjectId;
    name: string;
    body: string;
    author: import('mongoose').Types.ObjectId;
    /**
     * Skill-declared tool allowlist, forwarded verbatim from the skill doc.
     * Surfaced so the resolver can carry it onto `ResolvedManualSkill` for
     * future runtime enforcement without a second round-trip.
     */
    allowedTools?: string[];
    /**
     * Set when the skill was authored with `disable-model-invocation: true`.
     * The skill tool handler short-circuits on this so a model that names
     * such a skill (e.g. via hallucination or stale catalog) gets a clear
     * rejection instead of silently executing.
     */
    disableModelInvocation?: boolean;
    /**
     * Set when the skill was authored with `user-invocable: false`. The
     * manual-invocation resolver skips with a warn log so an API-direct
     * caller can't bypass the popover-side filter.
     */
    userInvocable?: boolean;
  } | null>;
  /**
   * Load accessible skills with `alwaysApply: true`, eagerly including
   * `body` so the priming pipeline can splice at turn start without a
   * per-skill round-trip. Cursor-paginated so the resolver can fill its
   * active-state budget even when early-sorted rows are inactive for
   * the current user.
   */
  listAlwaysApplySkills?: (params: {
    accessibleIds: import('mongoose').Types.ObjectId[];
    limit: number;
    cursor?: string | null;
  }) => Promise<{
    skills: Array<{
      _id: import('mongoose').Types.ObjectId;
      name: string;
      body: string;
      author: import('mongoose').Types.ObjectId;
      allowedTools?: string[];
    }>;
    has_more?: boolean;
    after?: string | null;
  }>;
}

/**
 * Initializes an agent for use in requests.
 * Handles file processing, tool loading, provider configuration, and context token calculations.
 *
 * This function is exported from @librechat/api and replaces the CJS version from
 * api/server/services/Endpoints/agents/agent.js
 *
 * @param params - Initialization parameters
 * @param deps - Optional dependency injection for testing
 * @returns Promise resolving to initialized agent with tools and configuration
 * @throws Error if agent provider is not allowed or if required dependencies are missing
 */
export async function initializeAgent(
  params: InitializeAgentParams,
  db?: InitializeAgentDbMethods,
): Promise<InitializedAgent> {
  const {
    req,
    res,
    agent,
    loadTools,
    requestFiles = [],
    conversationId,
    endpointOption,
    parentMessageId,
    allowedProviders,
    isInitialAgent = false,
  } = params;

  if (!db) {
    throw new Error('initializeAgent requires db methods to be passed');
  }

  if (
    isAgentsEndpoint(endpointOption?.endpoint) &&
    allowedProviders.size > 0 &&
    !allowedProviders.has(agent.provider)
  ) {
    throw new Error(
      `{ "type": "${ErrorTypes.INVALID_AGENT_PROVIDER}", "info": "${agent.provider}" }`,
    );
  }

  let currentFiles: IMongoFile[] | undefined;

  const _modelOptions = structuredClone(
    Object.assign(
      { model: agent.model },
      agent.model_parameters ?? { model: agent.model },
      isInitialAgent === true ? endpointOption?.model_parameters : {},
    ),
  );

  const { resendFiles, maxContextTokens, modelOptions } = extractLibreChatParams(
    _modelOptions as Record<string, unknown>,
  );

  const provider = agent.provider;
  agent.endpoint = provider;

  /**
   * Load conversation files for ALL agents, not just the initial agent.
   * This enables handoff agents to access files that were uploaded earlier
   * in the conversation. Without this, file_search and execute_code tools
   * on handoff agents would fail to find previously attached files.
   */
  if (conversationId != null && resendFiles) {
    const fileIds = (await db.getConvoFiles(conversationId)) ?? [];
    const toolResourceSet = new Set<EToolResources>();
    for (const tool of agent.tools ?? []) {
      if (EToolResources[tool as keyof typeof EToolResources]) {
        toolResourceSet.add(EToolResources[tool as keyof typeof EToolResources]);
      }
    }

    const toolFiles = (await db.getToolFilesByIds(fileIds, toolResourceSet)) as IMongoFile[];

    /**
     * Retrieve execute_code files filtered to the current thread.
     * This includes both code-generated files and user-uploaded execute_code files.
     */
    let codeGeneratedFiles: IMongoFile[] = [];
    let userCodeFiles: IMongoFile[] = [];

    if (toolResourceSet.has(EToolResources.execute_code)) {
      let threadMessageIds: string[] | undefined;
      let threadFileIds: string[] | undefined;

      if (parentMessageId && parentMessageId !== Constants.NO_PARENT && db.getMessages) {
        /** Only select fields needed for thread traversal */
        const messages = await db.getMessages(
          { conversationId },
          'messageId parentMessageId files',
        );
        if (messages && messages.length > 0) {
          /** Single O(n) pass: build Map, traverse thread, collect both IDs */
          const threadData = getThreadData(messages, parentMessageId);
          threadMessageIds = threadData.messageIds;
          threadFileIds = threadData.fileIds;
        }
      }

      /** Code-generated files (context: execute_code) filtered by messageId */
      if (db.getCodeGeneratedFiles) {
        codeGeneratedFiles = (await db.getCodeGeneratedFiles(
          conversationId,
          threadMessageIds,
        )) as IMongoFile[];
      }

      /** User-uploaded execute_code files (context: agents/message_attachment) from thread messages */
      if (db.getUserCodeFiles && threadFileIds && threadFileIds.length > 0) {
        userCodeFiles = (await db.getUserCodeFiles(threadFileIds)) as IMongoFile[];
      }
    }

    const allToolFiles = toolFiles.concat(codeGeneratedFiles, userCodeFiles);
    if (requestFiles.length || allToolFiles.length) {
      currentFiles = (await db.updateFilesUsage(requestFiles.concat(allToolFiles))) as IMongoFile[];
    }
  } else if (requestFiles.length) {
    currentFiles = (await db.updateFilesUsage(requestFiles)) as IMongoFile[];
  }

  if (currentFiles && currentFiles.length) {
    let endpointType: EModelEndpoint | undefined;
    if (!paramEndpoints.has(agent.endpoint ?? '')) {
      endpointType = EModelEndpoint.custom;
    }

    currentFiles = filterFilesByEndpointConfig(req, {
      files: currentFiles,
      endpoint: agent.endpoint ?? '',
      endpointType,
    });
  }

  const { attachments: primedAttachments, tool_resources } = await primeResources({
    req: req as never,
    getFiles: db.getFiles as never,
    filterFiles: db.filterFilesByAgentAccess,
    appConfig: req.config,
    agentId: agent.id,
    attachments: currentFiles
      ? (Promise.resolve(currentFiles) as unknown as Promise<TFile[]>)
      : undefined,
    tool_resources: agent.tool_resources,
    requestFileSet: new Set(requestFiles?.map((file) => file.file_id)),
  });

  /**
   * Pre-resolve manually-invoked + always-apply skill primes so their
   * `allowed-tools` can be unioned into the agent's effective tool set
   * BEFORE `loadTools` runs. Single load is correctness-critical: a
   * second `loadTools` pass would compute its own `userMCPAuthMap` /
   * `toolContextMap` / OAuth flow state that the InitializedAgent never
   * sees, so an MCP tool added via `allowed-tools` would be visible to
   * the model but fail at execution time without its per-user auth
   * context.
   *
   * Resolution uses `params.accessibleSkillIds` (not the active-filtered
   * subset that `injectSkillCatalog` will produce later) — see
   * `resolveManualSkills` doc for why a skill outside the catalog cap can
   * still be authorizable for direct manual invocation.
   *
   * Manual + always-apply primes feed the same `unionPrimeAllowedTools`
   * call — the helper is pure / set-based, so concatenating the two
   * lists gives the right union with no double-counting. Manual primes
   * go first so their names win on dedup (primes earlier in the list
   * contribute before the same name gets deduped on a later prime).
   */
  const hasSkillAccess = params.accessibleSkillIds && params.accessibleSkillIds.length > 0;
  let manualSkillPrimes: ResolvedManualSkill[] | undefined;
  let alwaysApplySkillPrimes: ResolvedAlwaysApplySkill[] | undefined;
  let extraAllowedToolNames: string[] = [];
  let perSkillExtras: Map<string, string[]> = new Map();
  if (hasSkillAccess) {
    const [manualPrimesResult, alwaysApplyPrimesResult] = await Promise.all([
      params.manualSkills?.length && db.getSkillByName
        ? resolveManualSkills({
            names: params.manualSkills,
            getSkillByName: db.getSkillByName,
            accessibleSkillIds: params.accessibleSkillIds!,
            userId: req.user?.id,
            skillStates: params.skillStates,
            defaultActiveOnShare: params.defaultActiveOnShare,
          })
        : Promise.resolve<ResolvedManualSkill[] | undefined>(undefined),
      db.listAlwaysApplySkills
        ? resolveAlwaysApplySkills({
            listAlwaysApplySkills: db.listAlwaysApplySkills,
            accessibleSkillIds: params.accessibleSkillIds!,
            userId: req.user?.id,
            skillStates: params.skillStates,
            defaultActiveOnShare: params.defaultActiveOnShare,
          })
        : Promise.resolve<ResolvedAlwaysApplySkill[] | undefined>(undefined),
    ]);

    manualSkillPrimes = manualPrimesResult;
    alwaysApplySkillPrimes = alwaysApplyPrimesResult;

    /**
     * Cross-list dedup: when a user `$`-invokes a skill that is also
     * marked `always-apply`, the always-apply copy is dropped here so
     * the same SKILL.md body isn't primed twice in the same turn.
     * Manual wins because it sits closer to the user message and
     * carries explicit intent. Done at the initializer (not just at
     * splice time in `injectSkillPrimes`) so persisted user-bubble
     * `alwaysAppliedSkills` pills reflect the post-dedup set and the
     * tool-union step below doesn't bill allowed-tools to the dropped
     * always-apply entry.
     */
    if (
      alwaysApplySkillPrimes &&
      alwaysApplySkillPrimes.length > 0 &&
      manualSkillPrimes &&
      manualSkillPrimes.length > 0
    ) {
      const manualNames = new Set(manualSkillPrimes.map((p) => p.name));
      const deduped = alwaysApplySkillPrimes.filter((p) => !manualNames.has(p.name));
      const removed = alwaysApplySkillPrimes.length - deduped.length;
      if (removed > 0) {
        logger.info(
          `[initializeAgent] Dropped ${removed} always-apply prime(s) already present in the manual list; same-named skills prime only once per turn.`,
        );
        alwaysApplySkillPrimes = deduped;
      }
    }

    /**
     * Enforce the combined `MAX_PRIMED_SKILLS_PER_TURN` ceiling up-front
     * so persisted user-bubble `alwaysAppliedSkills` pills stay in sync
     * with what actually gets primed. `injectSkillPrimes` re-applies the
     * cap as defense-in-depth at splice time. Always-apply primes are
     * truncated first — manual invocation is explicit user intent and
     * should never be silently dropped.
     */
    const manualCount = manualSkillPrimes?.length ?? 0;
    const alwaysApplyCount = alwaysApplySkillPrimes?.length ?? 0;
    if (alwaysApplySkillPrimes && manualCount + alwaysApplyCount > MAX_PRIMED_SKILLS_PER_TURN) {
      const budgetForAlwaysApply = Math.max(0, MAX_PRIMED_SKILLS_PER_TURN - manualCount);
      const dropped = alwaysApplyCount - budgetForAlwaysApply;
      logger.warn(
        `[initializeAgent] Combined primes (${manualCount} manual + ${alwaysApplyCount} always-apply) exceeds MAX_PRIMED_SKILLS_PER_TURN (${MAX_PRIMED_SKILLS_PER_TURN}); truncating ${dropped} always-apply prime(s) so persisted user-message pills stay in sync with what got primed.`,
      );
      alwaysApplySkillPrimes = alwaysApplySkillPrimes.slice(0, budgetForAlwaysApply);
    }

    const primesForUnion = [...(manualSkillPrimes ?? []), ...(alwaysApplySkillPrimes ?? [])];
    if (primesForUnion.length > 0) {
      const union = unionPrimeAllowedTools({
        primes: primesForUnion,
        agentToolNames: agent.tools ?? [],
      });
      extraAllowedToolNames = union.extraToolNames;
      perSkillExtras = union.perSkillExtras;
    }
  }

  const baseToolNames = agent.tools ?? [];
  const requestedToolNames =
    extraAllowedToolNames.length > 0 ? [...baseToolNames, ...extraAllowedToolNames] : baseToolNames;

  /**
   * `loadTools` failures take two forms:
   *   1. The wrapper throws — rare; only when something around the
   *      try/catch in `createToolLoader` itself fails.
   *   2. The wrapper returns `undefined` — the typical CJS path: every
   *      production loader (`createToolLoader` in `initialize.js`,
   *      `openai.js`, `responses.js`) catches `loadAgentTools` errors and
   *      returns `undefined`. Without explicit handling, the empty
   *      fallback object below would silently drop the agent's baseline
   *      tools for the turn (not just the skill-added extras).
   *
   * If a skill-contributed `allowed-tools` entry is the culprit, retry
   * with just `agent.tools` so the agent's own tools still load (the
   * dropped-tools debug log below picks up which extras vanished). If
   * the retry-without-extras also fails, propagate / fall through with
   * the empty fallback — the agent's own tools are the problem.
   */
  const callLoadTools = async (tools: string[]) =>
    loadTools?.({
      req,
      res,
      provider,
      agentId: agent.id,
      tools,
      model: agent.model,
      tool_options: agent.tool_options,
      tool_resources,
    });

  let loadToolsResult;
  const initialFailedSilently = (result: unknown) =>
    result == null && extraAllowedToolNames.length > 0;
  try {
    loadToolsResult = await callLoadTools(requestedToolNames);
  } catch (err) {
    if (extraAllowedToolNames.length > 0) {
      logger.warn(
        `[allowedTools] loadTools threw with skill-added extras [${extraAllowedToolNames.join(', ')}]; retrying without them:`,
        err instanceof Error ? err.message : err,
      );
      loadToolsResult = await callLoadTools(baseToolNames);
    } else {
      throw err;
    }
  }
  if (initialFailedSilently(loadToolsResult)) {
    /* Production loaders swallow errors and return undefined. Treat that
       the same as a throw when extras were requested — the agent's own
       tools must still load. */
    logger.warn(
      `[allowedTools] loadTools returned no result with skill-added extras [${extraAllowedToolNames.join(', ')}]; retrying without them.`,
    );
    loadToolsResult = await callLoadTools(baseToolNames);
  }

  const {
    toolRegistry,
    toolContextMap,
    userMCPAuthMap,
    toolDefinitions: loadedToolDefinitions,
    hasDeferredTools,
    actionsEnabled,
    tools: structuredTools,
  } = loadToolsResult ?? {
    tools: [],
    toolContextMap: {},
    userMCPAuthMap: undefined,
    toolRegistry: undefined,
    toolDefinitions: [],
    hasDeferredTools: false,
    actionsEnabled: undefined,
  };

  let toolDefinitions = loadedToolDefinitions;

  /**
   * Tolerant filter: anything `loadTools` couldn't resolve (capability
   * disabled, plugin missing, name unknown to the registry) is silently
   * dropped with an attributed debug log. Cross-ecosystem skills authored
   * against tools LibreChat hasn't shipped yet (Claude Code's `edit_file`,
   * etc.) import without breaking — they light up automatically once
   * support lands. Skips when there were no extras to begin with.
   */
  if (extraAllowedToolNames.length > 0) {
    const loadedNames = new Set((toolDefinitions ?? []).map((d) => d.name));
    const dropped = extraAllowedToolNames.filter((n) => !loadedNames.has(n));
    if (dropped.length > 0) {
      const sources: string[] = [];
      for (const [skillName, names] of perSkillExtras) {
        const droppedFromSkill = names.filter((n) => !loadedNames.has(n));
        if (droppedFromSkill.length > 0) {
          sources.push(`"${skillName}" → [${droppedFromSkill.join(', ')}]`);
        }
      }
      logger.debug(
        `[allowedTools] Dropped unrecognized tool names: ${
          sources.length > 0 ? sources.join('; ') : dropped.join(', ')
        }`,
      );
    }
  }

  const { getOptions, overrideProvider, customEndpointConfig } = getProviderConfig({
    provider,
    appConfig: req.config,
  });
  if (overrideProvider !== agent.provider) {
    agent.provider = overrideProvider;
  }

  const finalModelOptions = {
    ...modelOptions,
    model: agent.model,
  };

  const options: InitializeResultBase = await getOptions({
    req,
    endpoint: provider,
    model_parameters: finalModelOptions,
    db,
  });

  const llmConfig = options.llmConfig as Record<string, unknown>;
  const tokensModel =
    agent.provider === EModelEndpoint.azureOpenAI ? agent.model : (llmConfig?.model as string);
  const maxOutputTokens = optionalChainWithEmptyCheck(
    llmConfig?.maxOutputTokens as number | undefined,
    llmConfig?.maxTokens as number | undefined,
    0,
  );
  const agentMaxContextTokens = optionalChainWithEmptyCheck(
    maxContextTokens,
    getModelMaxTokens(
      tokensModel ?? '',
      providerEndpointMap[overrideProvider as keyof typeof providerEndpointMap],
      options.endpointTokenConfig,
    ),
    DEFAULT_MAX_CONTEXT_TOKENS,
  );

  if (
    agent.endpoint === EModelEndpoint.azureOpenAI &&
    (llmConfig?.azureOpenAIApiInstanceName as string | undefined) == null
  ) {
    agent.provider = Providers.OPENAI;
  }

  if (options.provider != null) {
    agent.provider = options.provider;
  }

  /**
   * Unify code-execution tools around `bash_tool` + `read_file` when the
   * agent explicitly lists `execute_code` in its tools and the admin
   * capability is enabled for the run. The legacy `execute_code` tool
   * (backed by `CodeExecutionToolDefinition` + `primeCodeFiles`) is no
   * longer registered; the string `execute_code` on the agent document
   * stays as the capability-trigger marker but expands into the
   * skill-flavored tool pair here.
   *
   * `effectiveCodeEnvAvailable` is the per-agent truth: the admin-level
   * `params.codeEnvAvailable` AND the agent actually asking for code
   * execution. Computed once and reused by the expansion block below,
   * the `injectSkillCatalog` call, and the returned `InitializedAgent`.
   * Downstream handlers (runtime `configurable`, `primeInvokedSkills`)
   * read it from the stored per-agent value so a skills-only agent
   * never accidentally registers `bash_tool` or primes sandbox files
   * just because the admin globally enabled code execution.
   *
   * Done BEFORE the `hasAgentTools` / GOOGLE_TOOL_CONFLICT gate so
   * execute-code-only agents on Google/Vertex still trip the conflict
   * guard when provider-specific tools are also configured. Also before
   * `injectSkillCatalog` so the skill path's own
   * `registerCodeExecutionTools` call becomes a no-op via the registry
   * `.has()` dedupe — exactly one copy of each tool reaches the LLM.
   */
  const agentRequestsCodeExec = (agent.tools ?? []).includes(Tools.execute_code);
  const effectiveCodeEnvAvailable = params.codeEnvAvailable === true && agentRequestsCodeExec;
  if (effectiveCodeEnvAvailable) {
    const codeExecResult = registerCodeExecutionTools({
      toolRegistry,
      toolDefinitions,
      includeBash: true,
      enableToolOutputReferences: effectiveCodeEnvAvailable,
    });
    toolDefinitions = codeExecResult.toolDefinitions;
  } else if (agentRequestsCodeExec) {
    /**
     * Agent asked for `execute_code` but the admin-level gate is off —
     * surface a debug log so operators tracing "why isn't code
     * interpreter working?" get a clear signal. The event-driven tool
     * loader (`loadToolDefinitionsWrapper`) doesn't log capability-
     * disabled warnings for the definitions-only path, so without this,
     * the tool silently vanishes from the LLM's definitions with no trace.
     */
    logger.debug(
      `[initializeAgent] Agent "${agent.id}" requests execute_code but codeEnvAvailable=${String(params.codeEnvAvailable)}; skipping bash_tool + read_file registration.`,
    );
  }

  /** Check for tool presence from either full instances or definitions (event-driven mode) */
  const hasAgentTools = (structuredTools?.length ?? 0) > 0 || (toolDefinitions?.length ?? 0) > 0;

  let tools: GenericTool[] = options.tools?.length
    ? (options.tools as GenericTool[])
    : (structuredTools ?? []);

  if (
    (agent.provider === Providers.GOOGLE || agent.provider === Providers.VERTEXAI) &&
    options.tools?.length &&
    hasAgentTools
  ) {
    throw new Error(`{ "type": "${ErrorTypes.GOOGLE_TOOL_CONFLICT}"}`);
  } else if (
    (agent.provider === Providers.OPENAI ||
      agent.provider === Providers.AZURE ||
      agent.provider === Providers.ANTHROPIC) &&
    options.tools?.length &&
    structuredTools?.length
  ) {
    tools = structuredTools.concat(options.tools as GenericTool[]);
  }

  agent.model_parameters = { ...options.llmConfig } as Agent['model_parameters'];
  if (options.configOptions) {
    (agent.model_parameters as Record<string, unknown>).configuration = options.configOptions;
  }

  if (agent.instructions && agent.instructions !== '') {
    agent.instructions = replaceSpecialVars({
      text: agent.instructions,
      user: req.user ? (req.user as unknown as TUser) : null,
    });
  }

  if (typeof agent.artifacts === 'string' && agent.artifacts !== '') {
    const artifactsPromptResult = generateArtifactsPrompt({
      endpoint: agent.provider,
      artifacts: agent.artifacts as never,
    });
    agent.additional_instructions = artifactsPromptResult ?? undefined;
  }

  let skillCount = 0;
  /**
   * IDs authorized for runtime skill execution — starts as the ACL-scoped set
   * and gets replaced with the active-filtered subset after catalog injection.
   * Ensures `getSkillByName` cannot resolve a deactivated skill even if the
   * LLM (or a direct-invocation path) names one.
   */
  let executableSkillIds = params.accessibleSkillIds;
  const { accessibleSkillIds } = params;
  if (accessibleSkillIds && accessibleSkillIds.length > 0) {
    const skillResult = await injectSkillCatalog({
      agent,
      toolDefinitions,
      toolRegistry,
      accessibleSkillIds,
      contextWindowTokens: Number(agentMaxContextTokens) || 200_000,
      listSkillsByAccess: db?.listSkillsByAccess,
      codeEnvAvailable: effectiveCodeEnvAvailable,
      userId: req.user?.id,
      skillStates: params.skillStates,
      defaultActiveOnShare: params.defaultActiveOnShare,
    });
    toolDefinitions = skillResult.toolDefinitions;
    skillCount = skillResult.skillCount;
    executableSkillIds = skillResult.activeSkillIds;
  }

  const agentMaxContextNum = Number(agentMaxContextTokens) || DEFAULT_MAX_CONTEXT_TOKENS;
  const maxOutputTokensNum = Number(maxOutputTokens) || 0;
  const baseContextTokens = Math.max(0, agentMaxContextNum - maxOutputTokensNum);

  const finalAttachments: IMongoFile[] = (primedAttachments ?? [])
    .filter((a): a is TFile => a != null)
    .map((a) => a as unknown as IMongoFile);

  const endpointConfigs = req.config?.endpoints;
  const providerConfig =
    customEndpointConfig ?? endpointConfigs?.[agent.provider as keyof typeof endpointConfigs];
  const providerMaxToolResultChars =
    providerConfig != null &&
    typeof providerConfig === 'object' &&
    !Array.isArray(providerConfig) &&
    'maxToolResultChars' in providerConfig
      ? (providerConfig.maxToolResultChars as number | undefined)
      : undefined;
  const maxToolResultCharsResolved =
    providerMaxToolResultChars ?? endpointConfigs?.all?.maxToolResultChars;

  const initializedAgent: InitializedAgent = {
    ...agent,
    resendFiles,
    toolRegistry,
    tool_resources,
    userMCPAuthMap,
    toolDefinitions,
    hasDeferredTools,
    actionsEnabled,
    baseContextTokens,
    codeEnvAvailable: effectiveCodeEnvAvailable,
    skillCount,
    accessibleSkillIds: executableSkillIds,
    manualSkillPrimes,
    alwaysApplySkillPrimes,
    attachments: finalAttachments,
    toolContextMap: toolContextMap ?? {},
    useLegacyContent: !!options.useLegacyContent,
    tools: (tools ?? []) as GenericTool[] & string[],
    maxToolResultChars: maxToolResultCharsResolved,
    maxContextTokens:
      maxContextTokens != null && maxContextTokens > 0
        ? maxContextTokens
        : Math.max(1024, Math.round(baseContextTokens * (1 - DEFAULT_RESERVE_RATIO))),
  };

  return initializedAgent;
}
