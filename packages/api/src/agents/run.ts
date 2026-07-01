import { logger } from '@librechat/data-schemas';
import { Run, Providers, Constants } from '@librechat/agents';
import {
  KnownEndpoints,
  EModelEndpoint,
  MAX_SUBAGENT_DEPTH,
  MAX_SUBAGENT_RUN_CONFIGS,
  extractEnvVariable,
  providerEndpointMap,
  normalizeEndpointName,
} from 'librechat-data-provider';
import type {
  SummarizationConfig as AgentSummarizationConfig,
  MultiAgentGraphConfig,
  ContextPruningConfig,
  OpenAIClientOptions,
  StandardGraphConfig,
  LCToolRegistry,
  SubagentConfig,
  AgentInputs,
  GenericTool,
  RunConfig,
  IState,
  LCTool,
} from '@librechat/agents';
import type {
  Agent,
  AgentModelParameters,
  AgentSubagentsConfig,
  ReasoningResponseKey,
  SummarizationConfig,
} from 'librechat-data-provider';
import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type { AppConfig, IUser } from '@librechat/data-schemas';
import type { SubagentUsageEvent } from '~/agents/usage';
import type * as t from '~/types';
import { getLLMConfig as getAnthropicLLMConfig } from '~/endpoints/anthropic/llm';
import { CREATE_FILE_TOOL_NAME, EDIT_FILE_TOOL_NAME } from '~/agents/tools';
import { getProviderConfig } from '~/endpoints/config/providers';
import { resolveToolApprovalPolicy } from '~/agents/hitl/policy';
import { extractDefaultParams } from '~/endpoints/openai/llm';
import { resolveHeaders, createSafeUser } from '~/utils/env';
import { getAgentCheckpointer } from '~/agents/checkpointer';
import { getOpenAIConfig } from '~/endpoints/openai/config';
import { buildHITLRunWiring } from '~/agents/hitl/runtime';
import { buildLangfuseConfig } from '~/langfuse/config';
import { resolveConfigHeaders } from '~/utils/headers';
import { applyTestRunHook } from '~/agents/testHook';
import { isUserProvided } from '~/utils/common';

/** Expected shape of JSON tool search results */
interface ToolSearchJsonResult {
  found?: number;
  tools?: Array<{ name: string }>;
}

/**
 * Parses tool names from JSON-formatted tool_search output.
 * Format: { "found": N, "tools": [{ "name": "tool_name", ... }], ... }
 *
 * @param content - The JSON string content
 * @param discoveredTools - Set to add discovered tool names to
 * @returns true if parsing succeeded, false otherwise
 */
function parseToolSearchJson(content: string, discoveredTools: Set<string>): boolean {
  try {
    const parsed = JSON.parse(content) as ToolSearchJsonResult;
    if (!parsed.tools || !Array.isArray(parsed.tools)) {
      return false;
    }
    for (const tool of parsed.tools) {
      if (tool.name && typeof tool.name === 'string') {
        discoveredTools.add(tool.name);
      }
    }
    return parsed.tools.length > 0;
  } catch {
    return false;
  }
}

/**
 * Parses tool names from legacy text-formatted tool_search output.
 * Format: "- tool_name (score: X.XX)"
 *
 * @param content - The text content
 * @param discoveredTools - Set to add discovered tool names to
 */
function parseToolSearchLegacy(content: string, discoveredTools: Set<string>): void {
  const toolNameRegex = /^- ([^\s(]+)\s*\(score:/gm;
  let match: RegExpExecArray | null;
  while ((match = toolNameRegex.exec(content)) !== null) {
    const toolName = match[1];
    if (toolName) {
      discoveredTools.add(toolName);
    }
  }
}

/**
 * Extracts discovered tool names from message history by parsing tool_search results.
 * When the LLM calls tool_search, the result contains tool names that were discovered.
 * These tools should have defer_loading overridden to false on subsequent turns.
 *
 * Supports both:
 * - New JSON format: { "tools": [{ "name": "tool_name" }] }
 * - Legacy text format: "- tool_name (score: X.XX)"
 *
 * @param messages - The conversation message history
 * @returns Set of tool names that were discovered via tool_search
 */
export function extractDiscoveredToolsFromHistory(messages: BaseMessage[]): Set<string> {
  const discoveredTools = new Set<string>();

  for (const message of messages) {
    const msgType = message._getType?.() ?? message.constructor?.name ?? '';
    if (msgType !== 'tool') {
      continue;
    }

    const name = (message as { name?: string }).name;
    if (name !== Constants.TOOL_SEARCH) {
      continue;
    }

    const content = message.content;
    if (typeof content !== 'string') {
      continue;
    }

    /** Try JSON format first (new), fall back to regex (legacy) */
    if (!parseToolSearchJson(content, discoveredTools)) {
      parseToolSearchLegacy(content, discoveredTools);
    }
  }

  return discoveredTools;
}

/**
 * Extracts skill names that were invoked in previous turns from raw message payload.
 * Scans assistant messages for tool_call content parts where name === 'skill'.
 * Works with TPayload (raw message objects) so it can run before formatAgentMessages.
 *
 * @param payload - The raw conversation message payload
 * @returns Set of skill names that were previously invoked
 */
export function extractInvokedSkillsFromPayload(
  payload: Array<Partial<{ role: string; content: unknown }>>,
): Set<string> {
  const invokedSkills = new Set<string>();

  for (const message of payload) {
    if (message.role !== 'assistant') {
      continue;
    }

    const content = message.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (
        part == null ||
        typeof part !== 'object' ||
        (part as { type?: string }).type !== 'tool_call'
      ) {
        continue;
      }
      const toolCall = (part as { tool_call?: { name?: string; args?: unknown } }).tool_call;
      if (toolCall?.name !== Constants.SKILL_TOOL) {
        continue;
      }
      const rawArgs = toolCall.args;
      const args =
        typeof rawArgs === 'string'
          ? (() => {
              try {
                return JSON.parse(rawArgs) as Record<string, unknown>;
              } catch {
                return {};
              }
            })()
          : (rawArgs as Record<string, unknown> | undefined);
      const skillName = args?.skillName;
      if (typeof skillName === 'string' && skillName.length > 0) {
        invokedSkills.add(skillName);
      }
    }
  }

  return invokedSkills;
}

/**
 * Overrides defer_loading to false for tools that were already discovered via tool_search.
 * This prevents the LLM from having to re-discover tools on every turn.
 *
 * @param toolRegistry - The tool registry to modify (mutated in place)
 * @param discoveredTools - Set of tool names that were previously discovered
 * @returns Number of tools that had defer_loading overridden
 */
export function overrideDeferLoadingForDiscoveredTools(
  toolRegistry: LCToolRegistry,
  discoveredTools: Set<string>,
): number {
  let overrideCount = 0;
  for (const toolName of discoveredTools) {
    const toolDef = toolRegistry.get(toolName);
    if (toolDef && toolDef.defer_loading === true) {
      toolDef.defer_loading = false;
      overrideCount++;
    }
  }
  return overrideCount;
}

const customProviders = new Set([
  Providers.XAI,
  Providers.DEEPSEEK,
  Providers.MOONSHOT,
  Providers.OPENROUTER,
  KnownEndpoints.ollama,
]);

type AgentReasoningKey = 'reasoning_content' | 'reasoning';

function includesOpenRouter(value?: string | null): boolean {
  return typeof value === 'string' && value.toLowerCase().includes(KnownEndpoints.openrouter);
}

export function getReasoningKey(
  provider: Providers,
  llmConfig: t.RunLLMConfig,
  agentEndpoint?: string | null,
  customReasoningKey?: ReasoningResponseKey,
): AgentReasoningKey {
  if (customReasoningKey) {
    return customReasoningKey as AgentReasoningKey;
  }

  let reasoningKey: AgentReasoningKey = 'reasoning_content';
  if (provider === Providers.GOOGLE) {
    reasoningKey = 'reasoning';
  } else if (
    includesOpenRouter(llmConfig.configuration?.baseURL) ||
    includesOpenRouter(agentEndpoint)
  ) {
    reasoningKey = 'reasoning';
  } else if (
    (llmConfig as OpenAIClientOptions).useResponsesApi === true &&
    (provider === Providers.OPENAI || provider === Providers.AZURE)
  ) {
    reasoningKey = 'reasoning';
  }
  return reasoningKey;
}

const DEEPSEEK_MODEL_PATTERN = /^deepseek(?:[-/]|$)/i;
const OPENROUTER_LATEST_ROUTING_PREFIX = /^~/;

function matchesDeepSeekModel(model?: string | null): boolean {
  if (typeof model !== 'string' || model.length === 0) {
    return false;
  }
  return DEEPSEEK_MODEL_PATTERN.test(model.replace(OPENROUTER_LATEST_ROUTING_PREFIX, ''));
}

/**
 * Whether the (provider, model) pair targets DeepSeek's thinking-mode
 * tool-calling contract, which requires `reasoning_content` to be replayed
 * on every prior assistant message that emitted `tool_calls`.
 * @see https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
 */
export function isDeepSeekReasoningProvider(
  provider: string | Providers | undefined | null,
  model?: string | null,
): boolean {
  if (typeof provider === 'string' && provider.length > 0) {
    const normalized = provider.toLowerCase();
    if (normalized === Providers.DEEPSEEK) {
      return true;
    }
    if (normalized === Providers.OPENROUTER) {
      return matchesDeepSeekModel(model);
    }
  }
  return matchesDeepSeekModel(model);
}

/**
 * Whether prior assistant tool-call messages should have `reasoning_content`
 * reconstructed when reformatting persisted history (cross-turn replay): either
 * DeepSeek thinking-mode (#13366) or a custom OpenAI-compatible endpoint that
 * opted in via `customParams.includeReasoningHistory` (e.g. Xiaomi MiMo, Kimi).
 */
export function shouldReplayReasoningContent(
  agent?: {
    provider?: string | Providers | null;
    model?: string | null;
    model_parameters?: { model?: string | null } | null;
    includeReasoningHistory?: boolean | null;
  } | null,
): boolean {
  if (agent == null) {
    return false;
  }
  if (agent.includeReasoningHistory === true) {
    return true;
  }
  return isDeepSeekReasoningProvider(agent.provider, agent.model_parameters?.model ?? agent.model);
}

type RunAgent = Omit<Agent, 'tools'> & {
  tools?: GenericTool[];
  maxContextTokens?: number;
  /** Pre-ratio context budget from initializeAgent. */
  baseContextTokens?: number;
  useLegacyContent?: boolean;
  toolContextMap?: Record<string, unknown>;
  dynamicToolContextMap?: Record<string, unknown>;
  toolRegistry?: LCToolRegistry;
  /** Serializable tool definitions for event-driven execution */
  toolDefinitions?: LCTool[];
  /** Precomputed flag indicating if any tools have defer_loading enabled */
  hasDeferredTools?: boolean;
  /**
   * Per-agent codeenv gate set by `initializeAgent`: admin-level
   * `execute_code` capability AND the agent actually requested
   * `execute_code` in its tools. Used here to enable
   * `RunConfig.toolOutputReferences` only on runs where the bash tool
   * is actually registered.
   */
  codeEnvAvailable?: boolean;
  /** Optional per-agent summarization overrides */
  summarization?: SummarizationConfig;
  /** Response field to read model reasoning from for custom OpenAI-compatible endpoints. */
  reasoningKey?: ReasoningResponseKey;
  /** Whether to reconstruct `reasoning_content` from persisted history across turns. */
  includeReasoningHistory?: boolean;
  /**
   * Maximum characters allowed in a single tool result before truncation.
   * Overrides the default computed from maxContextTokens.
   */
  maxToolResultChars?: number;
  /** Initialized subagent configs (loaded by initialize.js from agent.subagents.agent_ids). */
  subagentAgentConfigs?: RunAgent[];
  /** Source subagent spawning configuration (enabled / allowSelf / agent_ids). */
  subagents?: AgentSubagentsConfig;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const UNRESOLVED_ENV_VAR_PLACEHOLDER = /\$\{[^}]+\}/;

function hasUnresolvedPlaceholder(value: string): boolean {
  return UNRESOLVED_ENV_VAR_PLACEHOLDER.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

const nullableAgentModelParameterKeys = [
  'temperature',
  'maxContextTokens',
  'max_context_tokens',
  'max_output_tokens',
  'top_p',
  'frequency_penalty',
  'presence_penalty',
] satisfies Array<keyof AgentModelParameters>;

function normalizeAgentModelParameters(
  modelParameters: AgentModelParameters | undefined,
): Partial<AgentModelParameters> | undefined {
  if (!modelParameters) {
    return undefined;
  }
  const normalized: Partial<AgentModelParameters> = { ...modelParameters };
  for (const key of nullableAgentModelParameterKeys) {
    if (normalized[key] === null) {
      delete normalized[key];
    }
  }
  return normalized;
}

/**
 * Merges user-supplied summarization parameters on top of endpoint-resolved
 * overrides. User params win for top-level keys; `configuration` is
 * deep-merged so user additions (e.g. `defaultQuery`) don't wipe out the
 * resolved `baseURL`/`defaultHeaders`/`fetchOptions`.
 */
function mergeParameters(
  overrides: SummarizationClientOverrides,
  userParams: SummarizationConfig['parameters'],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...overrides, ...(userParams ?? {}) };
  const userConfiguration = (userParams as Record<string, unknown> | undefined)?.configuration;
  if (isPlainObject(overrides.configuration) && isPlainObject(userConfiguration)) {
    merged.configuration = { ...overrides.configuration, ...userConfiguration };
  }
  return merged;
}

/**
 * Mirrors `getOpenAIConfig`'s `llmConfig` shape (plus its `configOptions`
 * assigned to `configuration`). Index signature covers fields that the
 * helper emits dynamically per provider variant.
 */
interface SummarizationClientOverrides {
  apiKey?: string;
  streaming?: boolean;
  configuration?: t.OpenAIConfiguration;
  [key: string]: unknown;
}

/**
 * Resolves a summarization provider string (which may be a custom-endpoint name
 * like "Ollama") into the SDK-recognized provider and any client-option
 * overrides required to talk to that endpoint.
 *
 * Without this step, a `summarization.provider: "Ollama"` entry in
 * `librechat.yaml` flows verbatim to the agents SDK, which only knows a fixed
 * set of provider names and throws "Unsupported LLM provider: Ollama".
 */
function resolveSummarizationProvider(
  rawProvider: string,
  appConfig: AppConfig | undefined,
  headerContext: { user?: IUser; requestBody?: t.RequestBody },
): {
  provider: string;
  clientOverrides?: SummarizationClientOverrides;
} {
  if (!appConfig || !isNonEmptyString(rawProvider)) {
    return { provider: rawProvider };
  }
  try {
    const { overrideProvider, customEndpointConfig } = getProviderConfig({
      provider: rawProvider,
      appConfig,
    });
    if (!customEndpointConfig) {
      return { provider: overrideProvider };
    }
    const rawApiKey = customEndpointConfig.apiKey ?? '';
    const rawBaseURL = customEndpointConfig.baseURL ?? '';
    /**
     * User-provided credentials require an async DB lookup and expiry checks
     * that are out of scope here. Keep the raw provider so the SDK surfaces
     * a clear "Unsupported LLM provider" error rather than silently
     * remapping to `openAI` and routing summaries to the default backend.
     * Callers wanting user-provided summarization against a non-agent
     * endpoint must hit the same endpoint as the agent (handled upstream).
     */
    if (isUserProvided(rawApiKey) || isUserProvided(rawBaseURL)) {
      return { provider: rawProvider };
    }
    const apiKey = extractEnvVariable(rawApiKey);
    const baseURL = extractEnvVariable(rawBaseURL);
    /**
     * `extractEnvVariable` leaves any unresolved `${VAR}` placeholder in place
     * — including in the middle of a prefix/suffix string — when the env var
     * is missing. If the value is still broken, keep the raw provider so the
     * SDK errors out loudly instead of forwarding a malformed URL/key.
     */
    if (
      !apiKey ||
      !baseURL ||
      hasUnresolvedPlaceholder(apiKey) ||
      hasUnresolvedPlaceholder(baseURL)
    ) {
      return { provider: rawProvider };
    }
    /**
     * Resolve templated header values (e.g. `${PORTKEY_API_KEY}`,
     * `{{LIBRECHAT_BODY_PARENTMESSAGEID}}`) before handing them to
     * `getOpenAIConfig`, matching the agent main flow where `resolveHeaders`
     * runs on `llmConfig.configuration.defaultHeaders`.
     */
    const resolvedHeaders =
      customEndpointConfig.headers != null
        ? resolveHeaders({
            headers: customEndpointConfig.headers as Record<string, string>,
            user: createSafeUser(headerContext.user),
            body: headerContext.requestBody,
          })
        : undefined;
    /**
     * Native Anthropic custom endpoints must build their config with the
     * Anthropic client (`/v1/messages`), not `getOpenAIConfig` (which would emit
     * OpenAI-shaped requests). The self-summarize case is handled earlier by
     * `isSameEndpointAsAgent`; this covers summarizing against a *different*
     * Anthropic-native custom endpoint.
     */
    if (customEndpointConfig.provider === EModelEndpoint.anthropic) {
      const { llmConfig } = getAnthropicLLMConfig(apiKey, {
        modelOptions: {},
        proxy: process.env.PROXY ?? undefined,
        reverseProxyUrl: baseURL,
        headers: resolvedHeaders,
        addParams: customEndpointConfig.addParams,
        dropParams: customEndpointConfig.dropParams,
        defaultParams: extractDefaultParams(customEndpointConfig.customParams?.paramDefinitions),
      });
      const { apiKey: resolvedApiKey, ...llmConfigOverrides } = llmConfig as Record<
        string,
        unknown
      >;
      const clientOverrides: SummarizationClientOverrides = { ...llmConfigOverrides };
      if (typeof resolvedApiKey === 'string') {
        clientOverrides.apiKey = resolvedApiKey;
      }
      /** Strip the default model so the user-supplied `summarization.model` wins. */
      delete clientOverrides.model;
      delete clientOverrides.modelName;
      return { provider: Providers.ANTHROPIC, clientOverrides };
    }

    /**
     * Run the endpoint config through `getOpenAIConfig` so summarization
     * inherits the same `headers`, `defaultQuery`, `addParams`/`dropParams`,
     * and `customParams` transforms that `initializeCustom` applies for the
     * main agent flow. Without this, summarization drops endpoint-specific
     * behavior (e.g. Anthropic/Google param transforms, required headers)
     * that the main agent relied on. `proxy` is forwarded so outbound proxy
     * dispatchers (`PROXY` env var) apply to cross-endpoint summarization.
     */
    const { llmConfig, configOptions } = getOpenAIConfig(
      apiKey,
      {
        reverseProxyUrl: baseURL,
        proxy: process.env.PROXY ?? null,
        headers: resolvedHeaders,
        addParams: customEndpointConfig.addParams,
        dropParams: customEndpointConfig.dropParams,
        customParams: customEndpointConfig.customParams,
        directEndpoint: customEndpointConfig.directEndpoint,
      },
      rawProvider,
    );
    const { apiKey: resolvedApiKey, ...llmConfigOverrides } = llmConfig;
    const clientOverrides: SummarizationClientOverrides = { ...llmConfigOverrides };
    if (typeof resolvedApiKey === 'string') {
      clientOverrides.apiKey = resolvedApiKey;
    }
    if (configOptions) {
      clientOverrides.configuration = configOptions;
    }
    /**
     * `model`/`modelName` on `llmConfig` default to whatever `getOpenAIConfig`
     * produces from empty modelOptions. Strip them so the user-supplied
     * `summarization.model` wins.
     */
    delete clientOverrides.model;
    delete clientOverrides.modelName;
    return {
      provider: overrideProvider,
      clientOverrides,
    };
  } catch (error) {
    logger.warn(
      `[resolveSummarizationProvider] failed to resolve "${rawProvider}"; falling back to raw provider`,
      error,
    );
    return { provider: rawProvider };
  }
}

/** Shapes a SummarizationConfig into the format expected by AgentInputs. */
function shapeSummarizationConfig(
  config: SummarizationConfig | undefined,
  fallbackProvider: string,
  fallbackModel: string | undefined,
  appConfig: AppConfig | undefined,
  agentEndpoint: string | undefined,
  headerContext: { user?: IUser; requestBody?: t.RequestBody },
) {
  const rawProvider = config?.provider ?? fallbackProvider;
  /**
   * When the summarization provider resolves to the same custom endpoint as
   * the main agent, skip client-option overrides. The SDK's self-summarize
   * path will reuse `agentContext.clientOptions` as-is, preserving any
   * request-resolved dynamic headers, fetch/proxy options, and other state
   * that `getOpenAIConfig` produced from raw yaml config does not capture.
   */
  const isSameEndpointAsAgent =
    agentEndpoint != null &&
    isNonEmptyString(rawProvider) &&
    normalizeEndpointName(rawProvider) === normalizeEndpointName(agentEndpoint);

  const { provider, clientOverrides } = isSameEndpointAsAgent
    ? { provider: fallbackProvider, clientOverrides: undefined }
    : resolveSummarizationProvider(rawProvider, appConfig, headerContext);

  const model = config?.model ?? fallbackModel;
  const trigger =
    config?.trigger?.type && typeof config?.trigger?.value === 'number'
      ? { type: config.trigger.type, value: config.trigger.value }
      : undefined;

  /**
   * Custom-endpoint overrides are merged into `parameters` so the SDK's
   * `buildSummarizationClientConfig` spreads them onto the summarization
   * client options. Only applied when summarization targets a *different*
   * custom endpoint than the main agent; the same-endpoint case leaves
   * `parameters` untouched so `agentContext.clientOptions` wins.
   *
   * Order matters: `clientOverrides` supplies endpoint defaults (baseURL,
   * apiKey, headers, transforms), then explicit user `summarization.parameters`
   * are spread on top so settings like `streaming: false` still win over
   * `getOpenAIConfig`'s defaults. `configuration` is deep-merged so a user
   * adding e.g. `configuration.defaultQuery` keeps the resolved `baseURL`
   * and `defaultHeaders` rather than replacing the whole object.
   */
  const parameters =
    clientOverrides != null
      ? mergeParameters(clientOverrides, config?.parameters)
      : config?.parameters;

  return {
    enabled: config?.enabled !== false && isNonEmptyString(provider) && isNonEmptyString(model),
    config: {
      trigger,
      provider,
      model,
      parameters,
      prompt: config?.prompt,
      updatePrompt: config?.updatePrompt,
      reserveRatio: config?.reserveRatio,
      maxSummaryTokens: config?.maxSummaryTokens,
    } satisfies AgentSummarizationConfig,
    contextPruning: config?.contextPruning as ContextPruningConfig | undefined,
    reserveRatio: config?.reserveRatio,
  };
}

/**
 * Applies `reserveRatio` against the pre-ratio base context budget, falling
 * back to the pre-computed `maxContextTokens` from initializeAgent.
 */
function computeEffectiveMaxContextTokens(
  reserveRatio: number | undefined,
  baseContextTokens: number | undefined,
  maxContextTokens: number | undefined,
): number | undefined {
  if (reserveRatio == null || reserveRatio <= 0 || reserveRatio >= 1 || baseContextTokens == null) {
    return maxContextTokens;
  }
  const ratioComputed = Math.max(1024, Math.round(baseContextTokens * (1 - reserveRatio)));
  return Math.min(maxContextTokens ?? ratioComputed, ratioComputed);
}

/** Identifier for the self-spawn subagent (reuses parent's AgentInputs in an isolated child graph). */
const SELF_SUBAGENT_TYPE = 'self';

interface SubagentBuildState {
  configCount: number;
  rootAgentIds: string[];
}

function countSubagentConfig(state: SubagentBuildState): void {
  state.configCount += 1;
  if (state.configCount > MAX_SUBAGENT_RUN_CONFIGS) {
    logger.warn('[createRun] Subagent run configuration limit exceeded', {
      expandedConfigCount: state.configCount,
      maxSubagentRunConfigs: MAX_SUBAGENT_RUN_CONFIGS,
      rootAgentIds: state.rootAgentIds,
    });
    throw new Error(
      `Subagent run configuration exceeds the maximum of ${MAX_SUBAGENT_RUN_CONFIGS} expanded entries.`,
    );
  }
}

function assertSubagentDepth(depth: number, agentId: string): void {
  if (depth > MAX_SUBAGENT_DEPTH) {
    logger.warn('[createRun] Subagent graph depth limit exceeded', {
      agentId,
      depth,
      maxSubagentDepth: MAX_SUBAGENT_DEPTH,
    });
    throw new Error(
      `Subagent graph exceeds the maximum depth of ${MAX_SUBAGENT_DEPTH} at agent ${agentId}.`,
    );
  }
}

/**
 * Recursive any-true check across the agent tree: returns `true` if this
 * agent or any subagent (transitively) has the per-agent codeenv gate
 * enabled.
 *
 * The SDK's tool-output reference registry is shared across every
 * `ToolNode` compiled from the run's graph (parent + every subagent
 * alike), so a single subagent with `bash_tool` registered is enough to
 * make `RunConfig.toolOutputReferences` worth activating for the whole
 * run — without it, the subagent's `{{tool<idx>turn<turn>}}`
 * placeholders would pass through to the shell unsubstituted.
 *
 * Cycle-safe via a `visited` set. The bash tool description itself is
 * still gated per-agent in `initializeAgent`, so only agents that actually
 * have bash registered learn the `{{…}}` syntax — broadening the run-level
 * registry gate doesn't broaden the model-facing surface.
 */
function anyAgentHasCodeEnv(agents: RunAgent[]): boolean {
  const visited = new Set<string>();
  const pending = [...agents];

  for (let index = 0; index < pending.length; index++) {
    const agent = pending[index];
    if (visited.has(agent.id)) {
      continue;
    }
    visited.add(agent.id);
    if (agent.codeEnvAvailable === true) {
      return true;
    }
    for (const child of agent.subagentAgentConfigs ?? []) {
      if (!visited.has(child.id)) {
        pending.push(child);
      }
    }
  }
  return false;
}

/**
 * Whether any agent reachable in the run — primary, handoff/parallel, or a
 * nested subagent — opts into cross-turn `reasoning_content` reconstruction.
 * Walks `subagentAgentConfigs` like {@link anyAgentHasCodeEnv}, since an
 * opted-in custom endpoint may appear only as a (possibly pruned) subagent.
 */
export function anyAgentReplaysReasoningContent(
  agents: Array<RunAgent | null | undefined>,
): boolean {
  const visited = new Set<string>();
  const pending = [...agents];

  for (let index = 0; index < pending.length; index++) {
    const agent = pending[index];
    if (agent == null || visited.has(agent.id)) {
      continue;
    }
    visited.add(agent.id);
    if (shouldReplayReasoningContent(agent)) {
      return true;
    }
    for (const child of agent.subagentAgentConfigs ?? []) {
      if (!visited.has(child.id)) {
        pending.push(child);
      }
    }
  }
  return false;
}

/**
 * Builds SubagentConfig entries for an agent: optional self-spawn plus any
 * explicit child agents loaded in `agent.subagentAgentConfigs`. Returns an empty
 * array when subagents are disabled or no spawn targets are available.
 */
function buildSubagentConfigs(
  agent: RunAgent,
  agentInput: AgentInputs,
  toInput: (child: RunAgent, opts?: { isSubagent?: boolean }) => AgentInputs,
  state: SubagentBuildState,
  ancestors: Set<string> = new Set(),
  depth = 0,
): SubagentConfig[] {
  if (!agent.subagents?.enabled) {
    return [];
  }

  const configs: SubagentConfig[] = [];
  const allowSelf = agent.subagents.allowSelf !== false;

  if (allowSelf) {
    const selfName = agentInput.name ?? agent.name ?? 'self';
    countSubagentConfig(state);
    configs.push({
      self: true,
      type: SELF_SUBAGENT_TYPE,
      name: selfName,
      description: `Spawn ${selfName} in an isolated context to handle a focused subtask. Verbose tool output stays in the child's context; only a summary returns.`,
    });
  }

  /** Cycle-safety: include the current agent in `ancestors` before
   *  descending into children so a `A → B → A` configuration stops at
   *  the second encounter of A rather than recursing forever. Skip
   *  `A → A` too (already guarded) and anything that would re-enter
   *  an ancestor. */
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(agent.id);

  for (const child of agent.subagentAgentConfigs ?? []) {
    if (!child?.id || child.id === agent.id) {
      continue;
    }
    if (ancestors.has(child.id)) {
      continue;
    }
    const childDepth = depth + 1;
    assertSubagentDepth(childDepth, child.id);
    countSubagentConfig(state);
    /**
     * `buildAgentInput` applies parent-run context (initialSummary +
     * discoveredTools) to the returned AgentInputs *and* to the
     * passed-in agent's `toolRegistry` / `toolDefinitions` — flipping
     * `defer_loading: true → false` on tools the parent had previously
     * searched for, and injecting those tools' definitions into the
     * child's `toolDefinitions`. Clearing fields on the returned
     * object post-hoc would leave those side-effects in place, leaking
     * the parent's tool-search state into an "isolated" subagent and
     * inflating the child's prompt/token budget. The `isSubagent` flag
     * skips both the field stamping and the registry mutation at the
     * source so children truly start fresh.
     */
    const childInputs = toInput(child, { isSubagent: true });
    /**
     * Recursively resolve the child's own spawn targets so multi-level
     * delegation (A → B → C) works. Without this, a child whose own
     * `subagents.enabled` is true loses every explicit target when
     * invoked as a subagent — only the top-level loop attaches
     * `subagentConfigs`, and that only runs for the outer agents in
     * `agents[]`. Cycle-safe via `nextAncestors`.
     */
    const grandchildConfigs = buildSubagentConfigs(
      child,
      childInputs,
      toInput,
      state,
      nextAncestors,
      childDepth,
    );
    if (grandchildConfigs.length > 0) {
      childInputs.subagentConfigs = grandchildConfigs;
    }
    configs.push({
      type: child.id,
      name: child.name ?? child.id,
      description:
        child.description ??
        `Delegate a subtask to the ${child.name ?? child.id} agent in an isolated context.`,
      agentInputs: childInputs,
    });
  }

  return configs;
}

/**
 * Creates a new Run instance with custom handlers and configuration.
 *
 * @param options - The options for creating the Run instance.
 * @param options.agents - The agents for this run.
 * @param options.signal - The signal for this run.
 * @param options.runId - Optional run ID; otherwise, a new run ID will be generated.
 * @param options.customHandlers - Custom event handlers.
 * @param options.streaming - Whether to use streaming.
 * @param options.streamUsage - Whether to stream usage information.
 * @param options.messages - Optional message history to extract discovered tools from.
 *   When provided, tools that were previously discovered via tool_search will have
 *   their defer_loading overridden to false, preventing redundant re-discovery.
 * @returns {Promise<Run<IState>>} A promise that resolves to a new Run instance.
 */
export async function createRun({
  runId,
  signal,
  agents,
  messages,
  discoveredToolNames,
  requestBody,
  user,
  tenantId,
  tokenCounter,
  customHandlers,
  indexTokenCountMap,
  initialSessions,
  summarizationConfig,
  initialSummary,
  calibrationRatio,
  appConfig,
  subagentUsageSink,
  hitlCapable = false,
  streaming = true,
  streamUsage = true,
}: {
  agents: RunAgent[];
  signal: AbortSignal;
  runId?: string;
  streaming?: boolean;
  streamUsage?: boolean;
  requestBody?: t.RequestBody;
  user?: IUser;
  tenantId?: string;
  /** Message history for extracting previously discovered tools */
  messages?: BaseMessage[];
  /**
   * Pre-discovered deferred-tool names to force-load directly, bypassing message
   * extraction. The HITL resume path rebuilds the graph with `messages: []` (state
   * comes from the durable checkpoint), so the in-turn `tool_search` results that
   * would normally mark a deferred tool discovered aren't present — without this the
   * paused tool would be absent from the rebuilt schema-only toolMap and resume would
   * fail with "unknown tool". Captured at pause via `extractDiscoveredToolsFromHistory`
   * and replayed here. Merged with (not replacing) any names extracted from `messages`.
   */
  discoveredToolNames?: string[];
  summarizationConfig?: SummarizationConfig;
  /** Cross-run summary from formatAgentMessages, forwarded to AgentContext */
  initialSummary?: { text: string; tokenCount: number };
  /** Calibration ratio from previous run's contextMeta, seeds the pruner EMA */
  calibrationRatio?: number;
  /**
   * Resolved app config. Used to translate custom-endpoint provider names
   * (e.g. "Ollama") in the summarization config to SDK-recognized providers.
   */
  appConfig?: AppConfig;
  /**
   * Receives per-model-call usage from subagent child runs so hosts can bill
   * them (child graphs execute outside the run's `streamEvents` loop, so
   * their usage never reaches `customHandlers`). Typed structurally — not as
   * `Pick<RunConfig, 'subagentUsageSink'>` — because the field ships in
   * `@librechat/agents` > 3.2.33; older SDK versions ignore it at runtime.
   * Switch to the `RunConfig` pick once the dependency is bumped.
   */
  subagentUsageSink?: (event: SubagentUsageEvent) => void;
  /**
   * Whether the caller implements the HITL pause/resume lifecycle (inspects
   * `run.getInterrupt()`, persists a pending action, exposes a resume route). Gates the
   * tool-approval wiring: only AgentClient (chat + resume) sets this. The OpenAI-compatible
   * and Responses controllers leave it false, so an approval-gated tool can't pause on a
   * route that has no approval surface or resume endpoint (it would otherwise emit a normal
   * final response / `[DONE]` with the tool call left unresolved).
   */
  hitlCapable?: boolean;
} & Pick<
  RunConfig,
  'tokenCounter' | 'customHandlers' | 'indexTokenCountMap' | 'initialSessions'
>): Promise<Run<IState>> {
  /**
   * Only extract discovered tools if:
   * 1. We have message history to parse
   * 2. At least one agent has deferred tools (using precomputed flag)
   *
   * This optimization avoids iterating through messages in the ~95% of cases
   * where no agent uses deferred tool loading.
   */
  const hasAnyDeferredTools = agents.some((agent) => agent.hasDeferredTools === true);

  const discoveredTools = new Set<string>();
  if (hasAnyDeferredTools) {
    // Normal path: extract from this run's message history (tool_search results).
    if (messages?.length) {
      for (const name of extractDiscoveredToolsFromHistory(messages)) {
        discoveredTools.add(name);
      }
    }
    // Resume path: replay names captured at pause, since `messages` is empty (the
    // paused run's tool_search results live only in the checkpoint, not here).
    if (discoveredToolNames?.length) {
      for (const name of discoveredToolNames) {
        discoveredTools.add(name);
      }
    }
  }

  const buildAgentInput = (agent: RunAgent, opts: { isSubagent?: boolean } = {}): AgentInputs => {
    const isSubagent = opts.isSubagent === true;
    const provider =
      (providerEndpointMap[
        agent.provider as keyof typeof providerEndpointMap
      ] as unknown as Providers) ?? agent.provider;
    const selfModel = agent.model_parameters?.model ?? (agent.model as string | undefined);

    const summarization = shapeSummarizationConfig(
      agent.summarization ?? summarizationConfig,
      provider as string,
      selfModel,
      appConfig,
      agent.endpoint ?? undefined,
      { user, requestBody },
    );

    const modelParameters = normalizeAgentModelParameters(agent.model_parameters);
    const hasExplicitStreamUsage = Object.prototype.hasOwnProperty.call(
      modelParameters ?? {},
      'streamUsage',
    );
    const llmConfig = Object.assign(
      {
        provider,
        streaming,
        streamUsage,
      },
      modelParameters,
    ) as t.RunLLMConfig;

    const joinInstructionMap = (map?: Record<string, unknown>) =>
      Object.values(map ?? {})
        .filter((value): value is string => typeof value === 'string' && value !== '')
        .join('\n')
        .trim();

    const toolInstructions = joinInstructionMap(agent.toolContextMap);
    const dynamicToolInstructions = joinInstructionMap(agent.dynamicToolContextMap);

    const systemContent = [toolInstructions, agent.instructions ?? ''].join('\n').trim();

    const additionalInstructions = [dynamicToolInstructions, agent.additional_instructions ?? '']
      .join('\n')
      .trim();

    /**
     * Resolve request-based headers across provider-specific header locations
     * (OpenAI `configuration.defaultHeaders`, Anthropic `clientOptions.defaultHeaders`,
     * Google `customHeaders`). Done at this step because the request body may
     * contain dynamic values (e.g. conversationId) that are only known after
     * agent initialization.
     */
    resolveConfigHeaders({
      llmConfig,
      user: createSafeUser(user),
      body: requestBody,
    });

    /** Resolves issues with new OpenAI usage field */
    if (
      customProviders.has(agent.provider) ||
      (agent.provider === Providers.OPENAI && agent.endpoint !== agent.provider)
    ) {
      if (!hasExplicitStreamUsage) {
        llmConfig.streamUsage = false;
      }
      llmConfig.usage = true;
    }

    /**
     * Override defer_loading for tools that were discovered in previous
     * turns. This prevents the LLM from having to re-discover tools via
     * tool_search. Also add the discovered tools' definitions so the
     * LLM has their schemas.
     *
     * Skipped for subagent children (`isSubagent`) — they run in an
     * isolated context by contract, so inheriting the parent's
     * tool-search state leaks unrelated history and pre-loads tools the
     * child shouldn't care about. Mutations on `agent.toolRegistry`
     * and additions to `toolDefinitions` both happen here, so the flag
     * has to gate the whole block (clearing fields post-return can't
     * undo registry writes).
     */
    let toolDefinitions = agent.toolDefinitions ?? [];
    let toolRegistry = agent.toolRegistry;
    if (!isSubagent && discoveredTools.size > 0 && agent.toolRegistry) {
      overrideDeferLoadingForDiscoveredTools(agent.toolRegistry, discoveredTools);

      /** Add discovered tools' definitions so the LLM can see their schemas */
      const existingToolNames = new Set(toolDefinitions.map((d) => d.name));
      for (const toolName of discoveredTools) {
        if (existingToolNames.has(toolName)) {
          continue;
        }
        const toolDef = agent.toolRegistry.get(toolName);
        if (toolDef) {
          toolDefinitions = [...toolDefinitions, toolDef];
        }
      }
    } else if (isSubagent && agent.toolRegistry) {
      /**
       * Subagent children: hand the child a deep-enough clone of the
       * registry so later parent-graph builds (e.g. when the same
       * agent also appears as a handoff target in the outer loop)
       * can't mutate `defer_loading` on tool definitions the child
       * already holds a reference to. Clone the `Map` *and* each
       * `LCTool` — `overrideDeferLoadingForDiscoveredTools` writes
       * through to the tool object itself, so a shallow Map copy
       * alone wouldn't isolate the flag.
       */
      toolRegistry = new Map();
      for (const [name, tool] of agent.toolRegistry.entries()) {
        toolRegistry.set(name, { ...tool });
      }
      /** Child's own `toolDefinitions` list gets the same shallow-
       *  copied view so any later parent mutation of shared definitions
       *  is contained to the parent-graph path. */
      toolDefinitions = toolDefinitions.map((def) => ({ ...def }));
    }

    const effectiveMaxContextTokens = computeEffectiveMaxContextTokens(
      summarization.reserveRatio,
      agent.baseContextTokens,
      agent.maxContextTokens,
    );

    const reasoningKey = getReasoningKey(provider, llmConfig, agent.endpoint, agent.reasoningKey);
    return {
      provider,
      reasoningKey,
      toolDefinitions,
      agentId: agent.id,
      tools: agent.tools,
      clientOptions: llmConfig,
      instructions: systemContent,
      additional_instructions: additionalInstructions || undefined,
      name: agent.name ?? undefined,
      toolRegistry,
      maxContextTokens: effectiveMaxContextTokens,
      useLegacyContent: agent.useLegacyContent ?? false,
      discoveredTools:
        !isSubagent && discoveredTools.size > 0 ? Array.from(discoveredTools) : undefined,
      summarizationEnabled: summarization.enabled,
      summarizationConfig: summarization.config,
      initialSummary: isSubagent ? undefined : initialSummary,
      contextPruningConfig: summarization.contextPruning,
      maxToolResultChars: agent.maxToolResultChars,
    };
  };

  const agentInputs: AgentInputs[] = [];
  const subagentBuildState: SubagentBuildState = {
    configCount: 0,
    rootAgentIds: agents.map((agent) => agent.id),
  };
  for (const agent of agents) {
    const agentInput = buildAgentInput(agent);
    const subagentConfigs = buildSubagentConfigs(
      agent,
      agentInput,
      buildAgentInput,
      subagentBuildState,
    );
    if (subagentConfigs.length > 0) {
      agentInput.subagentConfigs = subagentConfigs;
    }
    agentInputs.push(agentInput);
  }

  const graphConfig: RunConfig['graphConfig'] = {
    signal,
    agents: agentInputs,
    edges: agents[0].edges,
  };

  if (agentInputs.length > 1 || ((graphConfig as MultiAgentGraphConfig).edges?.length ?? 0) > 0) {
    (graphConfig as unknown as MultiAgentGraphConfig).type = 'multi-agent';
  } else {
    (graphConfig as StandardGraphConfig).type = 'standard';
  }

  /**
   * Enable tool-output references when the bash tool is actually
   * present anywhere in this run — top-level agent OR any subagent
   * (transitively). `codeEnvAvailable` on each `RunAgent` is the
   * per-agent gate (admin `execute_code` capability AND the agent's
   * own `tools` listing `execute_code`), so the feature follows the
   * same activation as the bash-tool registration in
   * `initializeAgent`. The walk into `subagentAgentConfigs` is
   * load-bearing: a parent without `execute_code` can spawn a
   * subagent that has it, and the SDK's shared registry serves
   * every `ToolNode` compiled from this run's graph — so missing
   * subagents in this gate would leave the child's
   * `{{tool<idx>turn<turn>}}` placeholders unsubstituted. SDK
   * defaults (~400 KB per output, 5 MB total) keep substituted
   * payloads inside typical shell ARG_MAX limits, so no overrides
   * are needed for the experimental rollout.
   */
  const enableToolOutputReferences = anyAgentHasCodeEnv(agents);

  /**
   * Human-in-the-loop tool approval — OFF by default. When the agents endpoint
   * opts in (`toolApproval.enabled`), attach the `PreToolUse` policy hook + the
   * `humanInTheLoop` switch, and bind a durable checkpointer so a run that pauses
   * for review can be rebuilt and resumed on any worker (see `agents/checkpointer.ts`
   * and the resume route). When disabled, nothing attaches and the run is identical
   * to before this feature shipped.
   */
  const agentsEndpointConfig = appConfig?.endpoints?.[EModelEndpoint.agents];
  // Resolve the effective policy through the single seam so per-agent / per-skill
  // sources can layer in later without touching this call site (see
  // `resolveToolApprovalPolicy`). Only the endpoint layer is wired today, so this
  // is identical to reading `toolApproval` directly.
  const toolApprovalPolicy = resolveToolApprovalPolicy({
    endpoint: agentsEndpointConfig?.toolApproval,
  });
  // Gate HITL to callers that actually implement the pause/resume lifecycle. The
  // OpenAI-compatible + Responses controllers also call createRun/processStream but never
  // inspect `run.getInterrupt()` or persist a pending action — so an approval-gated tool
  // would pause with no approval surface or resume endpoint, and the route would emit a
  // normal final response / `[DONE]` with the tool call dangling. Only AgentClient (chat +
  // resume) passes `hitlCapable`; without it the run is identical to the no-HITL path.
  const hitl = hitlCapable ? buildHITLRunWiring(toolApprovalPolicy) : undefined;
  if (hitl) {
    const checkpointer = await getAgentCheckpointer(agentsEndpointConfig?.checkpointer);
    graphConfig.compileOptions = { ...graphConfig.compileOptions, checkpointer };
  }

  /**
   * Built as a variable (not an inline literal) so the extra
   * `subagentUsageSink` field passes assignability against SDK versions
   * whose `RunConfig` predates it (<= 3.2.33, where it is ignored at
   * runtime) — excess-property checks only apply to fresh literals. Inline
   * the field at the call site once the dependency is bumped.
   */
  const runConfig = {
    runId,
    graphConfig,
    tokenCounter,
    customHandlers,
    initialSessions,
    calibrationRatio,
    indexTokenCountMap,
    subagentUsageSink,
    // Exclude side-effecting / large-free-form-arg tools from eager execution.
    // Eager speculatively runs a tool mid-stream; for a big streamed arg (a
    // file body, a bash heredoc, a code block) the accumulated args can diverge
    // from the final tool call and trip the SDK's "changed after eager
    // execution" guard, and a speculative write/exec can land before the turn
    // commits. create_file/edit_file write files; execute_code/bash_tool run
    // code with large `code`/`command` args. `excludeToolNames` requires
    // @librechat/agents with the eager-exclusion support (agents#281); older
    // versions ignore the field.
    eagerEventToolExecution: {
      enabled: true,
      excludeToolNames: [
        CREATE_FILE_TOOL_NAME,
        EDIT_FILE_TOOL_NAME,
        Constants.EXECUTE_CODE,
        Constants.BASH_TOOL,
      ],
    },
    // Let host file-authoring tools share the code-execution sandbox session so
    // a file created with create_file/edit_file is visible to later
    // execute_code/bash_tool calls (and vice versa). The SDK folds these tools'
    // returned exec session/files into the shared code session and injects the
    // existing session into their requests. Requires @librechat/agents with
    // codeSessionToolNames support (agents#283); older versions ignore it.
    codeSessionToolNames: [CREATE_FILE_TOOL_NAME, EDIT_FILE_TOOL_NAME],
    // Derive the Langfuse trace id deterministically from runId so message
    // feedback can be scored against the trace without a lookup (see the
    // feedback route in api/server/routes/messages.js). No-op unless Langfuse
    // tracing is enabled. Requires @librechat/agents >= 3.2.21.
    langfuse: buildLangfuseConfig({ appConfig, tenantId: tenantId ?? user?.tenantId }),
    ...(enableToolOutputReferences && {
      toolOutputReferences: { enabled: true },
    }),
    // HITL opt-in: the `humanInTheLoop` switch + the PreToolUse policy hook. Spread
    // here (not just `compileOptions.checkpointer` above) so an `ask` decision raises
    // a real interrupt — without these the run would never pause. Absent when disabled.
    ...(hitl && { humanInTheLoop: hitl.humanInTheLoop, hooks: hitl.hooks }),
  };
  const run = await Run.create(runConfig);

  applyTestRunHook(run, { messages, agents });
  return run;
}
