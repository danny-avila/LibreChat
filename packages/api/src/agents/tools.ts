import { BashExecutionToolDefinition, ReadFileToolDefinition } from '@librechat/agents';
import type { LCTool, LCToolRegistry } from '@librechat/agents';

interface ToolDefLike {
  name: string;
  [key: string]: unknown;
}

interface ToolInstanceLike {
  name: string;
  [key: string]: unknown;
}

export interface BuildToolSetConfig {
  toolDefinitions?: ToolDefLike[];
  tools?: (ToolInstanceLike | null | undefined)[];
}

/**
 * Builds a Set of tool names for use with formatAgentMessages.
 *
 * In event-driven mode, tools are defined via toolDefinitions (which includes
 * deferred tools like tool_search). In legacy mode, tools come from loaded
 * tool instances.
 *
 * This ensures tool_search and other deferred tools are included in the toolSet,
 * allowing their ToolMessages to be preserved in conversation history.
 */
export function buildToolSet(agentConfig: BuildToolSetConfig | null | undefined): Set<string> {
  if (!agentConfig) {
    return new Set();
  }

  const { toolDefinitions, tools } = agentConfig;

  const toolNames =
    toolDefinitions && toolDefinitions.length > 0
      ? toolDefinitions.map((def) => def.name)
      : (tools ?? []).map((tool) => tool?.name);

  return new Set(toolNames.filter((name): name is string => Boolean(name)));
}

export interface RegisterCodeExecutionToolsParams {
  toolRegistry: LCToolRegistry | undefined;
  toolDefinitions: LCTool[] | undefined;
  /**
   * When `true`, register `bash_tool` alongside `read_file`. When `false`,
   * register `read_file` only — manually-primed skills still need it to
   * load `references/*` files from storage even without a sandbox.
   *
   * Callers:
   * - `initializeAgent` passes `true` iff the `execute_code` capability
   *   is enabled for the run.
   * - `injectSkillCatalog` passes whatever `codeEnvAvailable` resolved to
   *   for the run.
   *
   * Both callers reach this helper in the same `initializeAgent` run
   * sequentially; the registry `.has()` check keeps the second call a
   * no-op so there is exactly one copy of each tool in `toolDefinitions`.
   */
  includeBash: boolean;
}

export interface RegisterCodeExecutionToolsResult {
  toolDefinitions: LCTool[];
  /** Tool names newly registered (skipped names that already existed). */
  registered: string[];
}

/**
 * Idempotently registers the skill-flavored code-execution tool pair
 * (`bash_tool` + `read_file`) into the run's tool registry and
 * tool-definition list.
 *
 * Replaces the legacy `CodeExecutionToolDefinition` / `execute_code`
 * registration. `execute_code` as a capability name and as an
 * `agent.tools` entry is preserved — it just expands into this tool
 * pair at load time so there is only one code-execution tool path
 * end-to-end (no same-run dedupe surprises for agents with both
 * `execute_code` capability AND skills active).
 */
export function registerCodeExecutionTools(
  params: RegisterCodeExecutionToolsParams,
): RegisterCodeExecutionToolsResult {
  const { toolRegistry, toolDefinitions, includeBash } = params;

  const readFileDef: LCTool = {
    name: ReadFileToolDefinition.name,
    description: ReadFileToolDefinition.description,
    parameters: ReadFileToolDefinition.parameters as unknown as LCTool['parameters'],
    responseFormat: ReadFileToolDefinition.responseFormat,
  };

  const candidates: LCTool[] = [readFileDef];
  if (includeBash) {
    const bashToolDef: LCTool = {
      name: BashExecutionToolDefinition.name,
      description: BashExecutionToolDefinition.description,
      parameters: BashExecutionToolDefinition.schema as unknown as LCTool['parameters'],
    };
    candidates.push(bashToolDef);
  }

  const existingNames = new Set((toolDefinitions ?? []).map((d) => d.name));

  const registered: string[] = [];
  const newDefs: LCTool[] = [];
  for (const def of candidates) {
    const inRegistry = toolRegistry?.has(def.name) === true;
    const inDefs = existingNames.has(def.name);
    if (inRegistry || inDefs) {
      continue;
    }
    toolRegistry?.set(def.name, def);
    newDefs.push(def);
    registered.push(def.name);
  }

  /**
   * Skip the array spread on the common second-call no-op path (both tools
   * already registered by the first caller in the same run). Returns the
   * input array by reference; callers treat the return value as immutable.
   */
  if (newDefs.length === 0) {
    return { toolDefinitions: toolDefinitions ?? [], registered };
  }
  return {
    toolDefinitions: [...(toolDefinitions ?? []), ...newDefs],
    registered,
  };
}
