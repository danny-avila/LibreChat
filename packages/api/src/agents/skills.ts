import {
  formatSkillCatalog,
  SkillToolDefinition,
  BashExecutionToolDefinition,
} from '@librechat/agents';
import type { LCToolRegistry, LCTool } from '@librechat/agents';
import type { Types } from 'mongoose';
import type { Agent } from 'librechat-data-provider';
import type { InitializeAgentDbMethods } from './initialize';

export interface InjectSkillCatalogParams {
  agent: Agent;
  toolDefinitions: LCTool[] | undefined;
  toolRegistry: LCToolRegistry | undefined;
  accessibleSkillIds: Types.ObjectId[];
  contextWindowTokens: number;
  listSkillsByAccess: InitializeAgentDbMethods['listSkillsByAccess'];
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
    limit: 100,
  });

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

  const bashToolDef: LCTool = {
    name: BashExecutionToolDefinition.name,
    description: BashExecutionToolDefinition.description,
    parameters: BashExecutionToolDefinition.schema as unknown as LCTool['parameters'],
  };

  const toolDefinitions = [...(inputDefs ?? []), skillToolDef, bashToolDef];
  if (toolRegistry) {
    toolRegistry.set(SkillToolDefinition.name, skillToolDef);
    toolRegistry.set(BashExecutionToolDefinition.name, bashToolDef);
  }

  return { toolDefinitions, skillCount: skills.length };
}
