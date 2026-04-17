import {
  formatSkillCatalog,
  SkillToolDefinition,
  ReadFileToolDefinition,
  BashExecutionToolDefinition,
} from '@librechat/agents';
import type { LCToolRegistry, LCTool, InjectedMessage } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { Agent } from 'librechat-data-provider';
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
 * treats both code paths identically.
 *
 * Used by:
 *  - Phase 3 manual invocation (`$skill-name` popover) — called at turn start.
 *  - Phase 5 `always-apply` frontmatter — called at turn start.
 *  - `handleSkillToolCall` for model-invoked skills — called from the tool
 *    execution handler.
 */
export function primeManualSkill(skill: { name: string; body: string }): InjectedMessage {
  return {
    role: 'user',
    content: skill.body,
    isMeta: true,
    source: 'skill',
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
    logger.warn(
      `[resolveManualSkills] Truncating manual skill list from ${uniqueNames.length} to ${MAX_MANUAL_SKILLS}: dropped [${uniqueNames.slice(MAX_MANUAL_SKILLS).join(', ')}]`,
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
