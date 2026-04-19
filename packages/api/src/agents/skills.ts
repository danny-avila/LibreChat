import { logger } from '@librechat/data-schemas';
import { HumanMessage } from '@langchain/core/messages';
import {
  formatSkillCatalog,
  SkillToolDefinition,
  ReadFileToolDefinition,
  BashExecutionToolDefinition,
} from '@librechat/agents';
import type { LCToolRegistry, LCTool, InjectedMessage } from '@librechat/agents';
import type { BaseMessage } from '@langchain/core/messages';
import type { Agent } from 'librechat-data-provider';
import type { Types } from 'mongoose';
import type { InitializeAgentDbMethods } from './initialize';

const SKILL_CATALOG_LIMIT = 100;
/** Max pages scanned per run when filtering out inactive skills. */
const MAX_CATALOG_PAGES = 10;
/** Page size used when paginating to fill the active-skill quota. */
const CATALOG_PAGE_SIZE = 100;
/**
 * Hard ceiling on skill names resolved per request via `$` popover or
 * `always-apply`. The popover realistically surfaces only a few per turn;
 * the cap is a defense-in-depth against a crafted payload fanning out into
 * many concurrent `getSkillByName` DB lookups.
 */
export const MAX_MANUAL_SKILLS = 10;

/**
 * Hard ceiling on individual skill name length. Real skill names are
 * short slugs (e.g. `pptx`, `brand-guidelines`); anything beyond this is
 * a crafted payload. Filtered out before the DB round-trip so pathological
 * strings can't reach `getSkillByName` / Mongo's query planner.
 */
export const MAX_SKILL_NAME_LENGTH = 200;

/**
 * Marker tagged onto every skill-primed message (as `additional_kwargs.source`
 * on a LangChain `HumanMessage`, or as `source` on the `InjectedMessage` that
 * `handleSkillToolCall` emits). Downstream filtering/telemetry keys off this,
 * so both construction paths must agree — keep the literal exported from one
 * place rather than repeated inline.
 */
export const SKILL_MESSAGE_SOURCE = 'skill';

/**
 * Predicate that identifies a LangChain message as one we spliced in via
 * `injectManualSkillPrimes` (or the equivalent model-invoked path). Callers
 * like `runMemory` use this to strip synthetic skill content from windows
 * that should only contain real user chat — without this filter, SKILL.md
 * bodies pollute memory extraction and crowd out genuine turns.
 */
export function isSkillPrimeMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== 'object') {
    return false;
  }
  const kwargs = (msg as { additional_kwargs?: { source?: unknown } }).additional_kwargs;
  return !!kwargs && kwargs.source === SKILL_MESSAGE_SOURCE;
}

/**
 * Scopes user-accessible skill IDs to only those configured on the agent.
 *
 * Semantics (pinned by unit tests):
 * - `undefined` / `null` → not configured, returns the full accessible catalog.
 * - `[]` (empty array) → explicitly none, returns `[]`. A user who narrows their
 *   agent to a subset and then removes all entries is explicitly opting out of
 *   the full catalog fallback.
 * - non-empty array of skill `_id` hex strings → intersection of accessible IDs
 *   and agent-configured IDs.
 */
export function scopeSkillIds(
  accessibleSkillIds: Types.ObjectId[],
  agentSkills: string[] | null | undefined,
): Types.ObjectId[] {
  if (agentSkills == null) {
    return accessibleSkillIds;
  }
  if (agentSkills.length === 0) {
    return [];
  }
  const agentSet = new Set(agentSkills);
  return accessibleSkillIds.filter((oid) => agentSet.has(oid.toString()));
}

export interface ResolveSkillActiveParams {
  /** Skill being evaluated. Only `_id` and `author` matter for resolution. */
  skill: { _id: Types.ObjectId | string; author: Types.ObjectId | string };
  /** Per-user overrides: `{ [skillId]: boolean }`. Missing entries use the default. */
  skillStates?: Record<string, boolean>;
  /** Current user ID. When absent, the function fails closed for all non-overridden skills. */
  userId?: string;
  /** Admin-configured default for shared skills. `true` = shared skills auto-activate. */
  defaultActiveOnShare?: boolean;
}

/**
 * Resolves whether a skill should be injected into the agent catalog for the
 * current user. Precedence (pinned by unit tests):
 *
 * 1. Explicit override in `skillStates` wins above all.
 * 2. Absent `userId` → fail closed. The caller lost user context, so we do
 *    not fall back to ownership-based defaults that could leak shared skills.
 * 3. Owned skills (author === userId) default to **active**.
 * 4. Shared skills default to `defaultActiveOnShare` (admin-configured, default `false`).
 */
export function resolveSkillActive(params: ResolveSkillActiveParams): boolean {
  const { skill, skillStates, userId, defaultActiveOnShare = false } = params;
  const override = skillStates?.[skill._id.toString()];
  if (override !== undefined) {
    return override;
  }
  if (!userId) {
    return false;
  }
  return skill.author.toString() === userId ? true : defaultActiveOnShare;
}

export interface InjectSkillCatalogParams {
  agent: Agent;
  toolDefinitions: LCTool[] | undefined;
  toolRegistry: LCToolRegistry | undefined;
  accessibleSkillIds: Types.ObjectId[];
  contextWindowTokens: number;
  listSkillsByAccess: InitializeAgentDbMethods['listSkillsByAccess'];
  /** When true, registers bash_tool alongside skill + read_file. */
  codeEnvAvailable?: boolean;
  /** Current user ID — used to determine skill ownership for active-state resolution. */
  userId?: string;
  /** Per-user skill overrides: `{ [skillId]: boolean }`. Missing entries use the default. */
  skillStates?: Record<string, boolean>;
  /** Admin-configured default for shared skills. `true` = shared skills auto-activate. */
  defaultActiveOnShare?: boolean;
}

export interface InjectSkillCatalogResult {
  toolDefinitions: LCTool[] | undefined;
  skillCount: number;
  /**
   * IDs of skills that passed the active-state filter and appear in the
   * injected catalog. Runtime tool execution must authorize against this set,
   * not the full `accessibleSkillIds`, so deactivated skills cannot be
   * invoked by name even if the LLM hallucinates them.
   */
  activeSkillIds: Types.ObjectId[];
}

/**
 * Queries accessible skills, formats a budget-aware catalog, appends it to the
 * agent's additional_instructions, and registers the SkillTool definition.
 * Returns updated toolDefinitions and the skill count.
 *
 * No tool instance is created — SkillTool is event-driven only. The tool
 * definition in toolDefinitions is sufficient for the LLM to see and call it;
 * the host handler intercepts the call via ON_TOOL_EXECUTE.
 *
 * The caller is responsible for gating on the skills capability before calling.
 */
export async function injectSkillCatalog(
  params: InjectSkillCatalogParams,
): Promise<InjectSkillCatalogResult> {
  const {
    agent,
    toolDefinitions: inputDefs,
    toolRegistry,
    accessibleSkillIds,
    contextWindowTokens,
    listSkillsByAccess,
    codeEnvAvailable,
    userId,
    skillStates,
    defaultActiveOnShare = false,
  } = params;

  if (!listSkillsByAccess || accessibleSkillIds.length === 0) {
    return { toolDefinitions: inputDefs, skillCount: 0, activeSkillIds: [] };
  }

  type SkillSummary = Awaited<ReturnType<NonNullable<typeof listSkillsByAccess>>>['skills'][number];

  const isActive = (s: SkillSummary): boolean =>
    resolveSkillActive({ skill: s, skillStates, userId, defaultActiveOnShare });

  const activeSkills: SkillSummary[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let reachedEnd = false;

  while (activeSkills.length < SKILL_CATALOG_LIMIT && pages < MAX_CATALOG_PAGES) {
    const page = await listSkillsByAccess({
      accessibleIds: accessibleSkillIds,
      limit: CATALOG_PAGE_SIZE,
      cursor,
    });

    for (const skill of page.skills) {
      if (activeSkills.length >= SKILL_CATALOG_LIMIT) {
        break;
      }
      if (isActive(skill)) {
        activeSkills.push(skill);
      }
    }

    if (!page.has_more || !page.after) {
      reachedEnd = true;
      break;
    }
    cursor = page.after;
    pages += 1;
  }

  if (activeSkills.length === 0) {
    return { toolDefinitions: inputDefs, skillCount: 0, activeSkillIds: [] };
  }

  if (!reachedEnd && activeSkills.length < SKILL_CATALOG_LIMIT) {
    logger.warn(
      `[injectSkillCatalog] Scanned ${MAX_CATALOG_PAGES} pages without filling the ${SKILL_CATALOG_LIMIT}-skill catalog. Some active skills may be excluded.`,
    );
  }

  // Warn on duplicate names — model may invoke the wrong skill
  const nameCount = new Map<string, number>();
  for (const s of activeSkills) {
    nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1);
  }
  for (const [dupName, count] of nameCount) {
    if (count > 1) {
      logger.warn(
        `[injectSkillCatalog] ${count} accessible skills share name "${dupName}" — model may invoke the wrong one`,
      );
    }
  }

  const catalog = formatSkillCatalog(
    activeSkills.map((s) => ({ name: s.name, description: s.description })),
    { contextWindowTokens: contextWindowTokens || 200_000 },
  );

  if (catalog) {
    agent.additional_instructions = agent.additional_instructions
      ? `${agent.additional_instructions}\n\n${catalog}`
      : catalog;
  }

  const skillToolDef: LCTool = {
    name: SkillToolDefinition.name,
    description: SkillToolDefinition.description,
    parameters: SkillToolDefinition.parameters as unknown as LCTool['parameters'],
  };

  const readFileDef: LCTool = {
    name: ReadFileToolDefinition.name,
    description: ReadFileToolDefinition.description,
    parameters: ReadFileToolDefinition.parameters as unknown as LCTool['parameters'],
    responseFormat: ReadFileToolDefinition.responseFormat,
  };

  const bashToolDef: LCTool = {
    name: BashExecutionToolDefinition.name,
    description: BashExecutionToolDefinition.description,
    parameters: BashExecutionToolDefinition.schema as unknown as LCTool['parameters'],
  };

  // Always register skill + read_file; only register bash_tool when code env is available
  const defs: LCTool[] = [skillToolDef, readFileDef];
  if (codeEnvAvailable) {
    defs.push(bashToolDef);
  }

  const toolDefinitions = [...(inputDefs ?? []), ...defs];
  if (toolRegistry) {
    for (const def of defs) {
      toolRegistry.set(def.name, def);
    }
  }

  return {
    toolDefinitions,
    skillCount: activeSkills.length,
    activeSkillIds: activeSkills.map((s) => s._id),
  };
}

/**
 * Builds the meta user message that carries a skill's SKILL.md body into a
 * turn's context. Shape mirrors what `handleSkillToolCall` emits when the
 * model invokes the skill tool directly, so downstream message handling
 * treats all three paths identically.
 *
 * Used by:
 *  - Phase 3 manual invocation (`$skill-name` popover) — called at turn start.
 *  - Phase 5 `always-apply` frontmatter — called at turn start.
 *  - `handleSkillToolCall` for model-invoked skills — called from the tool
 *    execution handler.
 */
export function buildSkillPrimeMessage(skill: { name: string; body: string }): InjectedMessage {
  return {
    role: 'user',
    content: skill.body,
    isMeta: true,
    source: SKILL_MESSAGE_SOURCE,
    skillName: skill.name,
  };
}

export interface ResolveManualSkillsParams {
  /** Skill names the user invoked (via `$` popover or `always-apply`). */
  names: string[];
  /** DB lookup: name → skill doc, constrained to ACL-accessible IDs. */
  getSkillByName: (
    name: string,
    accessibleIds: Types.ObjectId[],
  ) => Promise<{
    _id: Types.ObjectId;
    name: string;
    body: string;
    author: Types.ObjectId | string;
  } | null>;
  /** ACL-accessible skill IDs for this user (already scoped by `scopeSkillIds`). */
  accessibleSkillIds: Types.ObjectId[];
  /** Current user ID — required for ownership-based active-state defaults. */
  userId?: string;
  /** Per-user skill active/inactive overrides. */
  skillStates?: Record<string, boolean>;
  /** Admin-configured default for shared skills. */
  defaultActiveOnShare?: boolean;
}

export interface ResolvedManualSkill {
  name: string;
  body: string;
}

/**
 * Resolves user-provided skill names to `{ name, body }` pairs ready for
 * priming. Filters out:
 *  - names not backed by an accessible skill (ACL miss or typo),
 *  - skills the user has toggled inactive (respects ownership-aware defaults).
 *
 * The active-state filter is intentional even for explicit `$` selections:
 *  1. Phase 2 closes the loop on the UI side by hiding inactive skills from
 *     the popover, so a deactivated skill shouldn't be reachable through the
 *     normal flow in the first place.
 *  2. For API-direct callers bypassing the popover, honoring the user's
 *     own activation toggle is the safer default — an opt-out toggle that
 *     stops working the moment someone crafts a raw payload isn't much of
 *     a toggle.
 *
 * Silently skips unresolvable names with a warn log — a missing `$skill` must
 * never block the user's actual message from going through.
 *
 * Preserves input order and drops duplicate names (first wins) so a user who
 * types `$foo $foo` doesn't end up with the body primed twice.
 */
export async function resolveManualSkills(
  params: ResolveManualSkillsParams,
): Promise<ResolvedManualSkill[]> {
  const { names, getSkillByName, accessibleSkillIds, userId, skillStates, defaultActiveOnShare } =
    params;

  if (!names.length || accessibleSkillIds.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const uniqueNames = names.filter((n) => {
    if (!n || seen.has(n)) {
      return false;
    }
    seen.add(n);
    return true;
  });

  /**
   * Truncate after dedup so a user repeating the same name doesn't consume
   * cap slots. Kept inside the function (not at the controller) so every
   * caller — including future internal ones — inherits the protection.
   */
  let boundedNames = uniqueNames;
  if (uniqueNames.length > MAX_MANUAL_SKILLS) {
    const droppedAll = uniqueNames.slice(MAX_MANUAL_SKILLS);
    const DROPPED_LOG_SAMPLE = 5;
    const droppedSample = droppedAll.slice(0, DROPPED_LOG_SAMPLE).join(', ');
    const droppedSuffix =
      droppedAll.length > DROPPED_LOG_SAMPLE
        ? `, ... (${droppedAll.length - DROPPED_LOG_SAMPLE} more)`
        : '';
    logger.warn(
      `[resolveManualSkills] Truncating manual skill list from ${uniqueNames.length} to ${MAX_MANUAL_SKILLS}: dropped [${droppedSample}${droppedSuffix}]`,
    );
    boundedNames = uniqueNames.slice(0, MAX_MANUAL_SKILLS);
  }

  const resolved = await Promise.all(
    boundedNames.map(async (name) => {
      try {
        const skill = await getSkillByName(name, accessibleSkillIds);
        if (!skill) {
          logger.warn(`[resolveManualSkills] Skill "${name}" not found or not accessible`);
          return null;
        }
        if (!skill.body) {
          logger.warn(`[resolveManualSkills] Skill "${name}" has empty body — skipping`);
          return null;
        }
        const active = resolveSkillActive({
          skill: { _id: skill._id, author: skill.author },
          skillStates,
          userId,
          defaultActiveOnShare,
        });
        if (!active) {
          logger.warn(`[resolveManualSkills] Skill "${name}" is inactive for this user — skipping`);
          return null;
        }
        return { name: skill.name, body: skill.body };
      } catch (err) {
        logger.warn(
          `[resolveManualSkills] Failed to resolve skill "${name}":`,
          err instanceof Error ? err.message : err,
        );
        return null;
      }
    }),
  );

  return resolved.filter((r): r is ResolvedManualSkill => r !== null);
}

export interface InjectManualSkillPrimesParams {
  /** Formatted LangChain messages produced by `formatAgentMessages`. Mutated in place. */
  initialMessages: BaseMessage[];
  /** Per-index token count map returned by `formatAgentMessages`. */
  indexTokenCountMap: Record<number, number> | undefined;
  /** Resolved skill primes to splice in. */
  manualSkillPrimes: ResolvedManualSkill[];
}

export interface InjectManualSkillPrimesResult {
  /** Same array reference as input (mutated). */
  initialMessages: BaseMessage[];
  /** New token map with indices shifted; same reference as input when no-op. */
  indexTokenCountMap: Record<number, number> | undefined;
  /** Number of prime messages actually inserted (for logging by the caller). */
  inserted: number;
  /** Position where primes were inserted, or -1 when no-op. */
  insertIdx: number;
}

/**
 * Splices skill prime messages into a formatted message array just before
 * the latest user message, and shifts the `indexTokenCountMap` so downstream
 * `hydrateMissingIndexTokenCounts` fills counts for the new positions
 * without corrupting accounting for pre-existing ones.
 *
 * Insertion semantics:
 *  - `insertIdx = initialMessages.length - 1`. Empty input → no-op.
 *  - Single-message input → `insertIdx = 0`, primes appear before the lone message.
 *  - Map shift: entries with `idx >= insertIdx` move forward by `numPrimes`.
 *    Using `>=` (not `>`) is load-bearing: the message that was at `insertIdx`
 *    is pushed to `insertIdx + numPrimes` by the splice, so its count must
 *    follow it.
 *
 * Callers are responsible for scoping (e.g. single-agent runs only — see
 * `AgentClient.chatCompletion`). This helper is agent-agnostic.
 */
export function injectManualSkillPrimes(
  params: InjectManualSkillPrimesParams,
): InjectManualSkillPrimesResult {
  const { initialMessages, manualSkillPrimes } = params;
  let { indexTokenCountMap } = params;

  if (manualSkillPrimes.length === 0 || initialMessages.length === 0) {
    return { initialMessages, indexTokenCountMap, inserted: 0, insertIdx: -1 };
  }

  const insertIdx = initialMessages.length - 1;
  const numPrimes = manualSkillPrimes.length;

  if (indexTokenCountMap) {
    const shifted: Record<number, number> = {};
    for (const [idxStr, count] of Object.entries(indexTokenCountMap)) {
      const idx = Number(idxStr);
      shifted[idx >= insertIdx ? idx + numPrimes : idx] = count;
    }
    indexTokenCountMap = shifted;
  }

  const primeMessages = manualSkillPrimes.map(
    (p) =>
      new HumanMessage({
        content: p.body,
        additional_kwargs: { isMeta: true, source: SKILL_MESSAGE_SOURCE, skillName: p.name },
      }),
  );
  initialMessages.splice(insertIdx, 0, ...primeMessages);

  return { initialMessages, indexTokenCountMap, inserted: numPrimes, insertIdx };
}

export interface SkillPrimeContentPart {
  type: 'tool_call';
  tool_call: {
    id: string;
    name: string;
    args: string;
    output: string;
    progress: number;
    type: 'tool_call';
  };
}

export interface BuildSkillPrimeContentPartsParams {
  /** Run / response message ID. Used as a stable seed for synthetic tool_call IDs. */
  runId: string;
  /**
   * Optional index offset. When the primes are prepended to an existing
   * contentParts array, callers can leave this 0 (IDs still stay unique
   * within the message). Exposed for explicitness only.
   */
  startOffset?: number;
}

/**
 * Build completed tool_call content parts for each manually-invoked skill.
 *
 * Matches the shape the aggregator produces for a model-invoked skill call
 * on `ON_RUN_STEP_COMPLETED` — `{ type: 'tool_call', tool_call: { id, name,
 * args, output, progress: 1, type: 'tool_call' } }` — so the existing
 * `SkillCall` renderer on the frontend shows identical "Skill X loaded"
 * cards without any new client work.
 *
 * Callers (e.g. `AgentClient.chatCompletion`) prepend these to
 * `this.contentParts` after `runAgents` returns so the cards persist on
 * the response message and appear ahead of the model's content — matching
 * the semantic that priming ran before the LLM turn.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Intentional: sticky re-priming across turns.
 * ──────────────────────────────────────────────────────────────────────
 * Shape parity with model-invoked tool_calls means `extractInvokedSkills
 * FromPayload` (packages/api/src/agents/run.ts) treats these as ordinary
 * skill invocations when scanning history, so `primeInvokedSkills` re-
 * prepares the files + body on every subsequent turn for the rest of
 * the conversation. This is deliberate: the skill-card UX on the assistant
 * message is the user's persistent visual cue that the skill is active,
 * and re-priming keeps the LLM's view consistent with what the user sees
 * (and matches how model-invoked skills behave — there is no separate
 * "one-shot vs. conversation-scoped" mode). To opt out of a sticky skill,
 * users need to start a new conversation or edit the originating user
 * message to remove the pills and resubmit — regenerate alone preserves
 * the picks (`useChatFunctions.regenerate` forwards them via
 * `overrideManualSkills`). A future "one-shot manual prime" mode would
 * need a distinct marker on the synthetic tool_call so the history
 * scanner could skip it.
 */
export function buildSkillPrimeContentParts(
  primes: ResolvedManualSkill[],
  { runId, startOffset = 0 }: BuildSkillPrimeContentPartsParams,
): SkillPrimeContentPart[] {
  return primes.map((prime, i) => {
    const args = JSON.stringify({ skillName: prime.name });
    return {
      type: 'tool_call',
      tool_call: {
        id: `call_manual_skill_${runId}_${startOffset + i}`,
        name: SkillToolDefinition.name,
        args,
        output: `Skill "${prime.name}" loaded. Follow the instructions below.`,
        progress: 1,
        type: 'tool_call',
      },
    };
  });
}

/**
 * Safely pulls `manualSkills` from an untyped request body.
 *
 * Accepts only string[] in practice: filters out non-string elements,
 * empty strings, and pathologically long names so a crafted payload
 * (numbers, objects, nulls, giga-strings) can't reach `getSkillByName`
 * and waste DB round-trips, matching the TypeScript contract
 * (`manualSkills?: string[]` on TPayload). Returns `undefined` for
 * missing / non-array inputs OR for arrays that contain no valid strings —
 * callers treat undefined as "no manual invocation this turn."
 */
export function extractManualSkills(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const raw = (body as { manualSkills?: unknown }).manualSkills;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const filtered = raw.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.length > 0 && entry.length <= MAX_SKILL_NAME_LENGTH,
  );
  return filtered.length > 0 ? filtered : undefined;
}
