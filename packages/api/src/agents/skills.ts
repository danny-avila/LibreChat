import {
  formatSkillCatalog,
  SkillToolDefinition,
  ReadFileToolDefinition,
  BashExecutionToolDefinition,
} from '@librechat/agents';
import type { LCToolRegistry, LCTool } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { Agent } from 'librechat-data-provider';
import type { InitializeAgentDbMethods } from './initialize';

const SKILL_CATALOG_LIMIT = 100;

export interface InjectSkillCatalogParams {
  agent: Agent;
  toolDefinitions: LCTool[] | undefined;
  toolRegistry: LCToolRegistry | undefined;
  accessibleSkillIds: Types.ObjectId[];
  contextWindowTokens: number;
  listSkillsByAccess: InitializeAgentDbMethods['listSkillsByAccess'];
  /** When true, bash tool is registered alongside skill tools */
  codeEnvAvailable?: boolean;
}

export interface InjectSkillCatalogResult {
  toolDefinitions: LCTool[] | undefined;
  skillCount: number;
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
  } = params;

  if (!listSkillsByAccess || accessibleSkillIds.length === 0) {
    return { toolDefinitions: inputDefs, skillCount: 0 };
  }

  const { skills } = await listSkillsByAccess({
    accessibleIds: accessibleSkillIds,
    limit: SKILL_CATALOG_LIMIT,
  });

  if (skills.length === SKILL_CATALOG_LIMIT) {
    logger.warn(
      `[injectSkillCatalog] Skill catalog reached limit of ${SKILL_CATALOG_LIMIT}. Some skills may be excluded.`,
    );
  }

  if (skills.length === 0) {
    return { toolDefinitions: inputDefs, skillCount: 0 };
  }

  const catalog = formatSkillCatalog(
    skills.map((s) => ({ name: s.name, description: s.description })),
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

  const defs: LCTool[] = [skillToolDef, readFileDef];

  if (params.codeEnvAvailable) {
    const bashToolDef: LCTool = {
      name: BashExecutionToolDefinition.name,
      description: BashExecutionToolDefinition.description,
      parameters: BashExecutionToolDefinition.schema as unknown as LCTool['parameters'],
    };
    defs.push(bashToolDef);
  }

  const toolDefinitions = [...(inputDefs ?? []), ...defs];
  if (toolRegistry) {
    for (const def of defs) {
      toolRegistry.set(def.name, def);
    }
  }

  return { toolDefinitions, skillCount: skills.length };
}
