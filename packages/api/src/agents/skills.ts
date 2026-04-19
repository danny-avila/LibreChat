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
   * IDs of skills the runtime is authorized to resolve via `getSkillByName`.
   * Includes `disable-model-invocation: true` skills even though they're
   * absent from the catalog text — the skill-tool handler needs to be able
   * to fetch the doc to fire the explicit "cannot be invoked by the model"
   * rejection (instead of a generic "not found"). Per-user deactivated
   * skills are still excluded — explicit user opt-out shouldn't be
   * resolvable.
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
  /**
   * Catalog cap counts only model-visible (non-`disable-model-invocation`)
   * skills. Counting against the merged active set would let a tenant
   * with many disabled skills near the top of the cursor exhaust the
   * 100-slot quota before any invocable skills got scanned — the catalog
   * could end up empty even though invocable skills exist further down
   * the paginated results. Tracking the visible count separately also
   * keeps `MAX_CATALOG_PAGES` honest as a true scan-budget ceiling.
   */
  let visibleCount = 0;
  let cursor: string | null = null;
  let pages = 0;
  let reachedEnd = false;

  while (visibleCount < SKILL_CATALOG_LIMIT && pages < MAX_CATALOG_PAGES) {
    const page = await listSkillsByAccess({
      accessibleIds: accessibleSkillIds,
      limit: CATALOG_PAGE_SIZE,
      cursor,
    });

    for (const skill of page.skills) {
      if (visibleCount >= SKILL_CATALOG_LIMIT) {
        break;
      }
      /**
       * Active set keeps `disable-model-invocation` skills so the runtime
       * can still resolve them by name and the skill-tool handler can fire
       * its explicit "cannot be invoked by the model" rejection (instead
       * of a misleading "not found"). Catalog text formatting filters
       * them back out below — they cost zero context tokens. Per-user
       * deactivation (`isActive` false) is still a hard exclusion: the
       * user explicitly opted out, so we honor it everywhere.
       */
      if (isActive(skill)) {
        activeSkills.push(skill);
        if (skill.disableModelInvocation !== true) {
          visibleCount += 1;
        }
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

  if (!reachedEnd && visibleCount < SKILL_CATALOG_LIMIT) {
    logger.warn(
      `[injectSkillCatalog] Scanned ${MAX_CATALOG_PAGES} pages without filling the ${SKILL_CATALOG_LIMIT}-skill catalog. Some active skills may be excluded.`,
    );
  }

  /**
   * Catalog text and tool registration are gated on the *visible* subset.
   * If every active skill is `disable-model-invocation: true`, the model
   * can't reach any of them anyway — registering the skill tool would
   * burn context tokens for nothing.
   */
  const catalogVisibleSkills = activeSkills.filter((s) => s.disableModelInvocation !== true);

  /**
   * Resolve same-name collisions in the runtime ACL set: when an invocable
   * skill and a `disable-model-invocation: true` skill share a name,
   * `getSkillByName` would pick whichever is newer (it sorts by
   * `updatedAt` desc) — and if the disabled one is newer, EVERY model
   * call to that name would fail with "cannot be invoked by the model"
   * even though the cataloged invocable skill exists. Drop the disabled
   * doc(s) from `activeSkillIds` whenever an invocable doc with the same
   * name is also in scope. When ONLY a disabled doc exists for a name,
   * keep it so the explicit-rejection error path still fires.
   *
   * Note: we never drop two invocable docs that share a name — the
   * existing duplicate-name warn log below covers that ambiguity, and
   * `getSkillByName` picks the newest (deterministic).
   */
  const invocableNames = new Set<string>();
  for (const s of catalogVisibleSkills) {
    invocableNames.add(s.name);
  }
  const executableSkills = activeSkills.filter(
    (s) => s.disableModelInvocation !== true || !invocableNames.has(s.name),
  );

  // Warn on duplicate names within the catalog-visible set — those are the
  // ones the model can actually invoke ambiguously.
  const nameCount = new Map<string, number>();
  for (const s of catalogVisibleSkills) {
    nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1);
  }
  for (const [dupName, count] of nameCount) {
    if (count > 1) {
      logger.warn(
        `[injectSkillCatalog] ${count} accessible skills share name "${dupName}" — model may invoke the wrong one`,
      );
    }
  }

  /**
   * Catalog text is gated on the visible subset — `disable-model-invocation`
   * skills cost zero context tokens. When no visible skills exist, the
   * model gets no catalog and the `skill` tool is omitted from the
   * registry (registering it would burn description tokens for a tool
   * the model has no targets for). `read_file` and `bash_tool` are still
   * registered though: manually-primed disabled skills can have their
   * SKILL.md body in context referring to `references/*` and `scripts/*`,
   * and those reads would otherwise be impossible.
   */
  if (catalogVisibleSkills.length > 0) {
    const catalog = formatSkillCatalog(
      catalogVisibleSkills.map((s) => ({ name: s.name, description: s.description })),
      { contextWindowTokens: contextWindowTokens || 200_000 },
    );
    if (catalog) {
      agent.additional_instructions = agent.additional_instructions
        ? `${agent.additional_instructions}\n\n${catalog}`
        : catalog;
    }
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

  /**
   * `skill` tool is conditional on having anything for the model to invoke;
   * `read_file` is always registered when any active skill is in scope
   * (manually-primed disabled skills still need it); `bash_tool` follows
   * code-env availability as before.
   */
  const defs: LCTool[] = [];
  if (catalogVisibleSkills.length > 0) {
    defs.push(skillToolDef);
  }
  defs.push(readFileDef);
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
    skillCount: catalogVisibleSkills.length,
    activeSkillIds: executableSkills.map((s) => s._id),
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
  /** DB lookup: name → skill doc, constrained to ACL-accessible IDs.
   *
   * Resolver always passes `options.preferUserInvocable: true` so a
   * same-name newer `userInvocable: false` (model-only) duplicate can't
   * shadow the older user-invocable doc the popover surfaced. Disable-
   * model-invocation status is irrelevant for the manual path.
   */
  getSkillByName: (
    name: string,
    accessibleIds: Types.ObjectId[],
    options?: { preferUserInvocable?: boolean; preferModelInvocable?: boolean },
  ) => Promise<{
    _id: Types.ObjectId;
    name: string;
    body: string;
    author: Types.ObjectId | string;
    /**
     * Skill-declared tool allowlist, forwarded verbatim from the skill doc.
     * Surfaced on `ResolvedManualSkill` so future runtime enforcement can
     * union it into the agent's effective tool set for the turn without
     * re-fetching the document. Populated by the DB method when available.
     */
    allowedTools?: string[];
    /**
     * When `false`, the skill author opted out of manual invocation. The
     * resolver skips with a warn log rather than priming SKILL.md.
     * Defaults to `true` when omitted.
     */
    userInvocable?: boolean;
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
  /**
   * Skill-declared tool allowlist passed through from the skill doc. Present
   * only when the skill author declared `allowed-tools` in frontmatter.
   * Currently populated but not consumed — future runtime enforcement will
   * union these into the agent's effective tool set for the turn.
   */
  allowedTools?: string[];
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
        /* `preferUserInvocable` lets the lookup return the older
           user-invocable variant when a newer same-name duplicate has
           `userInvocable: false` (model-only). Without this, the
           popover-visible skill the user picked would silently no-op
           because `getSkillByName`'s `updatedAt desc` tiebreak returns
           the model-only newer doc and the resolver skips it on the
           userInvocable check below. We deliberately do NOT also pass
           `preferModelInvocable` — manually invoking a `disable-model-
           invocation: true` skill is the supported path (iter 4) and
           the model-only filter would interfere with that. */
        const skill = await getSkillByName(name, accessibleSkillIds, {
          preferUserInvocable: true,
        });
        if (!skill) {
          logger.warn(`[resolveManualSkills] Skill "${name}" not found or not accessible`);
          return null;
        }
        /**
         * `user-invocable: false` skills are model-only by author intent;
         * the popover already hides them on the UI side, but an API-direct
         * caller could still name one in `manualSkills`. Defense-in-depth:
         * skip with a warn log so the contract holds at the runtime
         * boundary too. Silent skip (not error) matches the established
         * "not found / inactive / empty body" pattern — a single misfiring
         * skill must never block the user's actual message from going out.
         *
         * Checked before the body check because `userInvocable` is an
         * authoritative author decision, while empty body could be a
         * transient state — surfacing the more specific cause helps
         * operators triage faster.
         */
        if (skill.userInvocable === false) {
          logger.warn(`[resolveManualSkills] Skill "${name}" is not user-invocable — skipping`);
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
        const resolved: ResolvedManualSkill = { name: skill.name, body: skill.body };
        if (skill.allowedTools !== undefined) {
          resolved.allowedTools = skill.allowedTools;
        }
        return resolved;
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

export interface SkillPrimeWithTools {
  /** Skill name — used for log attribution only. */
  name: string;
  /** Author-declared `allowed-tools` from frontmatter, if any. */
  allowedTools?: string[];
}

export interface UnionPrimeAllowedToolsParams {
  /**
   * Resolved skill primes (manual + always-apply once Phase 5 lands) that
   * may carry an `allowedTools` allowlist. Order is irrelevant — the union
   * is set-based — but stable iteration helps debug logs read consistently.
   */
  primes: SkillPrimeWithTools[];
  /** Tool names already configured on the agent. Skipped when computing extras. */
  agentToolNames: string[];
}

export interface UnionPrimeAllowedToolsResult {
  /**
   * Tool names contributed by skill primes that aren't already on the
   * agent. Caller is responsible for actually loading these and merging
   * the resulting tool definitions into the agent's effective set; the
   * helper itself stays pure so it can be unit-tested in isolation and
   * reused for the always-apply path.
   */
  extraToolNames: string[];
  /**
   * Per-skill breakdown of which tool names that skill contributed to the
   * final union. Useful for the debug log when the runtime drops names
   * that the registry doesn't recognize — operators can see which skill
   * asked for the missing tool.
   */
  perSkillExtras: Map<string, string[]>;
}

/**
 * Computes the union of `allowed-tools` declared by a turn's resolved skill
 * primes, minus tools already configured on the agent. The agent-provided
 * tools are the authoritative baseline; allowed-tools only ever ADDS to
 * the surface, never replaces or removes.
 *
 * Tolerant of unknown tool names: validation against the runtime registry
 * happens at the caller (in `initialize.ts`) so we can support skills
 * authored against tools LibreChat hasn't implemented yet — the registry
 * intersection silently drops them with a debug log, but the import path
 * never rejects them.
 *
 * Pure function; returns set-style data so callers can dedupe across
 * concurrent always-apply + manual paths without re-implementing the
 * fold themselves.
 */
export function unionPrimeAllowedTools(
  params: UnionPrimeAllowedToolsParams,
): UnionPrimeAllowedToolsResult {
  const { primes, agentToolNames } = params;
  const onAgent = new Set(agentToolNames);
  const extras = new Set<string>();
  const perSkill = new Map<string, string[]>();

  for (const prime of primes) {
    const requested = prime.allowedTools;
    if (!requested || requested.length === 0) {
      continue;
    }
    const contributed: string[] = [];
    for (const name of requested) {
      if (typeof name !== 'string' || name.length === 0) {
        continue;
      }
      if (onAgent.has(name) || extras.has(name)) {
        continue;
      }
      extras.add(name);
      contributed.push(name);
    }
    if (contributed.length > 0) {
      perSkill.set(prime.name, contributed);
    }
  }

  return {
    extraToolNames: Array.from(extras),
    perSkillExtras: perSkill,
  };
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
