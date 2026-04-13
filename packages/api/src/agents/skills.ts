import { formatSkillCatalog, SkillToolDefinition, createSkillTool } from '@librechat/agents';
import type { GenericTool, LCToolRegistry, LCTool } from '@librechat/agents';
import type { Types } from 'mongoose';
import type { Agent } from 'librechat-data-provider';
import type { InitializeAgentDbMethods } from './initialize';

export interface InjectSkillCatalogParams {
  agent: Agent;
  tools: GenericTool[];
  toolDefinitions: LCTool[] | undefined;
  toolRegistry: LCToolRegistry | undefined;
  accessibleSkillIds: Types.ObjectId[];
  contextWindowTokens: number;
  listSkillsByAccess: InitializeAgentDbMethods['listSkillsByAccess'];
}

export interface InjectSkillCatalogResult {
  tools: GenericTool[];
  toolDefinitions: LCTool[] | undefined;
  skillCount: number;
}

/**
 * Queries accessible skills, formats a budget-aware catalog, appends it to the
 * agent's additional_instructions, and registers the SkillTool definition + instance.
 * Returns updated tools/toolDefinitions and the skill count.
 *
 * This is a pure helper extracted from initializeAgent to keep that module focused.
 * The caller is responsible for gating on the skills capability before calling.
 */
export async function injectSkillCatalog(
  params: InjectSkillCatalogParams,
): Promise<InjectSkillCatalogResult> {
  const {
    agent,
    tools: inputTools,
    toolDefinitions: inputDefs,
    toolRegistry,
    accessibleSkillIds,
    contextWindowTokens,
    listSkillsByAccess,
  } = params;

  if (!listSkillsByAccess || accessibleSkillIds.length === 0) {
    return { tools: inputTools, toolDefinitions: inputDefs, skillCount: 0 };
  }

  const { skills } = await listSkillsByAccess({
    accessibleIds: accessibleSkillIds,
    limit: 100,
  });

  if (skills.length === 0) {
    return { tools: inputTools, toolDefinitions: inputDefs, skillCount: 0 };
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

  const toolDefinitions = [...(inputDefs ?? []), skillToolDef];
  if (toolRegistry) {
    toolRegistry.set(SkillToolDefinition.name, skillToolDef);
  }

  const skillToolInstance = createSkillTool();
  const tools = [...inputTools, skillToolInstance as unknown as GenericTool];

  return { tools, toolDefinitions, skillCount: skills.length };
}
