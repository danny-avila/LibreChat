import {
  CODE_EXECUTION_TOOLS,
  BashExecutionToolDefinition,
  ReadFileToolDefinition,
  buildBashExecutionToolDescription,
} from '@librechat/agents';
import type { LCTool, LCToolRegistry } from '@librechat/agents';

export const CREATE_FILE_TOOL_NAME = 'create_file';
export const EDIT_FILE_TOOL_NAME = 'edit_file';
export const HOST_FILE_AUTHORING_ARTIFACT_KEY = '__librechat_file_authoring';
export const FILE_AUTHORING_TOOL_NAMES: ReadonlySet<string> = new Set([
  CREATE_FILE_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
]);

export function isCodeSessionToolName(
  name: string,
  hostFileAuthoringToolNames?: ReadonlySet<string>,
): boolean {
  return CODE_EXECUTION_TOOLS.has(name) || hostFileAuthoringToolNames?.has(name) === true;
}

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
  /**
   * When `true`, `read_file` tells the model about skill-file paths
   * (`{skillName}/{path}`). When `false`, it is described only as a
   * code-execution sandbox reader so execute-code-only agents don't get
   * prompted to discover skills that are not enabled for the run.
   */
  includeSkillFileInstructions?: boolean;
  /**
   * When `true`, the registered `bash_tool` description includes the
   * LLM-facing `{{tool<idx>turn<turn>}}` reference syntax guide so the
   * model knows it can substitute prior tool outputs in subsequent
   * commands. Paired with `RunConfig.toolOutputReferences` in `createRun`.
   */
  enableToolOutputReferences?: boolean;
}

export interface RegisterCodeExecutionToolsResult {
  toolDefinitions: LCTool[];
  /** Tool names newly registered (skipped names that already existed). */
  registered: string[];
}

export type RegisterFileAuthoringToolsResult = RegisterCodeExecutionToolsResult;

export interface RegisterFileAuthoringToolsParams {
  toolRegistry: LCToolRegistry | undefined;
  toolDefinitions: LCTool[] | undefined;
  /**
   * When true, descriptions point the model at the skill file namespace
   * (`skills/{skillName}/...`) in addition to sandbox paths. When false,
   * descriptions stay focused on code-execution sandbox files.
   */
  includeSkillFileInstructions?: boolean;
}

/**
 * Hoisted module-level definition for skill-aware `read_file` so
 * `registerCodeExecutionTools` doesn't re-allocate on every call. The
 * shape is derived from a static `@librechat/agents` export — no
 * per-request state — so a single frozen object is safe to share across
 * every agent init.
 */
const SKILL_READ_FILE_DESCRIPTION = `${ReadFileToolDefinition.description}

Also accepts authored skill file paths using "skills/{skillName}/...", including "skills/{skillName}/SKILL.md".`;

const READ_FILE_DEF: LCTool = Object.freeze({
  name: ReadFileToolDefinition.name,
  description: SKILL_READ_FILE_DESCRIPTION,
  parameters: ReadFileToolDefinition.parameters as unknown as LCTool['parameters'],
  responseFormat: ReadFileToolDefinition.responseFormat,
}) as LCTool;

const CODE_READ_FILE_DESCRIPTION = `Read a known text file from the code-execution sandbox. Returns line-numbered text; large files may be truncated around 256KB.

Use for text, CSV, JSON, Markdown, logs, and small source files at paths returned by tool output, just written, or under /mnt/data/. Do not run ls/find just to rediscover known paths. Use bash_tool for binary files, large files, transforms, metadata, or true filesystem discovery. /tmp is per-call scratch and unavailable later.`;

const CODE_READ_FILE_PARAMETERS: LCTool['parameters'] = Object.freeze({
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description:
        'Path to a file from code execution output, such as "/mnt/data/result.csv" or another path returned by the execution tool.',
    },
  },
  required: ['file_path'],
}) as LCTool['parameters'];

const CODE_READ_FILE_DEF: LCTool = Object.freeze({
  name: ReadFileToolDefinition.name,
  description: CODE_READ_FILE_DESCRIPTION,
  parameters: CODE_READ_FILE_PARAMETERS,
  responseFormat: ReadFileToolDefinition.responseFormat,
}) as LCTool;

const SKILL_CREATE_FILE_PARAMETERS: LCTool['parameters'] = Object.freeze({
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description:
        'Path to write. Use "skills/{skillName}/..." for skill files when available, or a code-execution sandbox path such as "/mnt/data/result.txt" when code execution is enabled. For SKILL.md, the YAML frontmatter name must match {skillName}.',
    },
    content: {
      type: 'string',
      description: 'Complete file contents.',
    },
    overwrite: {
      type: 'boolean',
      description: 'Must be true to replace an existing file. Refuses otherwise.',
      default: false,
    },
  },
  required: ['file_path', 'content'],
}) as LCTool['parameters'];

const CODE_CREATE_FILE_PARAMETERS: LCTool['parameters'] = Object.freeze({
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description:
        'Path to write in the code-execution sandbox, such as "/mnt/data/result.txt". Prefer /mnt/data/{file} for files that should remain available to later sandbox calls.',
    },
    content: {
      type: 'string',
      description: 'Complete file contents.',
    },
    overwrite: {
      type: 'boolean',
      description: 'Must be true to replace an existing file. Refuses otherwise.',
      default: false,
    },
  },
  required: ['file_path', 'content'],
}) as LCTool['parameters'];

const SKILL_EDIT_FILE_PARAMETERS: LCTool['parameters'] = Object.freeze({
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description:
        'Path to edit. Use "skills/{skillName}/..." for skill files when available, or a code-execution sandbox path such as "/mnt/data/result.txt" when code execution is enabled. edit_file cannot rename skills; keep SKILL.md frontmatter name equal to {skillName}.',
    },
    old_text: {
      type: 'string',
      description: 'Exact text to find. Must match exactly one location in the file.',
    },
    new_text: {
      type: 'string',
      description: 'Replacement text.',
    },
    edits: {
      type: 'array',
      description: 'Optional batch of replacements. Each old_text must match exactly once.',
      items: {
        type: 'object',
        properties: {
          old_text: { type: 'string' },
          new_text: { type: 'string' },
        },
        required: ['old_text', 'new_text'],
      },
    },
  },
  required: ['file_path'],
}) as LCTool['parameters'];

const CODE_EDIT_FILE_PARAMETERS: LCTool['parameters'] = Object.freeze({
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description: 'Path to edit in the code-execution sandbox, such as "/mnt/data/result.txt".',
    },
    old_text: {
      type: 'string',
      description: 'Exact text to find. Must match exactly one location in the file.',
    },
    new_text: {
      type: 'string',
      description: 'Replacement text.',
    },
    edits: {
      type: 'array',
      description: 'Optional batch of replacements. Each old_text must match exactly once.',
      items: {
        type: 'object',
        properties: {
          old_text: { type: 'string' },
          new_text: { type: 'string' },
        },
        required: ['old_text', 'new_text'],
      },
    },
  },
  required: ['file_path'],
}) as LCTool['parameters'];

const SKILL_CREATE_FILE_DESCRIPTION = `Create a new file, or overwrite an existing file with explicit intent.

Use for new files and full rewrites. Requires overwrite: true to replace existing files.

Paths starting with "skills/" write skill files:
- skills/{skillName}/SKILL.md - main instructions; keep it lean with YAML frontmatter, trigger-friendly description, workflow steps, and short snippets.
- skills/{skillName}/references/{file} - long docs, schemas, examples, large templates, HTML/CSS/JS dashboards.
- skills/{skillName}/scripts/{file} - helper scripts.
- skills/{skillName}/assets/{file} - static assets.
- skills/{skillName}/templates/{file} - reusable output templates.

For SKILL.md, frontmatter name must match {skillName}; create skills/{newName}/SKILL.md to rename. Put large runnable artifacts in bundled files such as references/template.html, and have SKILL.md tell the agent when to read or reuse them.

Non-skills paths target the code-execution sandbox when enabled. Prefer /mnt/data/{file}.`;

const CODE_CREATE_FILE_DESCRIPTION = `Create a new file, or overwrite an existing file with explicit intent.

Use for new files and full rewrites where the change is larger than half the file. Requires overwrite: true to replace existing files. Refuses otherwise.

Targets code-execution sandbox paths. Prefer /mnt/data/{file} for files that should remain available to later sandbox calls.`;

const SKILL_EDIT_FILE_DESCRIPTION = `Apply targeted text replacements to an existing file.

Use for small, precise changes. Each old_text must match exactly one location. Tries exact match first; falls back to whitespace-tolerant matching if needed. Reports which matching strategy was used. Returns a unified diff.

For skills/{skillName}/SKILL.md, edit description, title, or body content, but keep YAML frontmatter name equal to {skillName}. edit_file cannot rename skills; create a new skills/{newName}/SKILL.md for a different skill name. Keep SKILL.md concise; move large templates, HTML/CSS/JS dashboards, examples, schemas, and long docs into references/, scripts/, assets/, or templates/ files and point to them from SKILL.md.

Paths starting with "skills/" target the skill file system. When code execution is enabled, non-skills paths target the code-execution sandbox.`;

const CODE_EDIT_FILE_DESCRIPTION = `Apply targeted text replacements to an existing file.

Use for small, precise changes. Each old_text must match exactly one location. Tries exact match first; falls back to whitespace-tolerant matching if needed. Reports which matching strategy was used. Returns a unified diff.

Targets code-execution sandbox paths, such as /mnt/data/result.txt.`;

const SKILL_CREATE_FILE_DEF: LCTool = Object.freeze({
  name: CREATE_FILE_TOOL_NAME,
  description: SKILL_CREATE_FILE_DESCRIPTION,
  parameters: SKILL_CREATE_FILE_PARAMETERS,
  responseFormat: 'content_and_artifact' as LCTool['responseFormat'],
}) as LCTool;

const CODE_CREATE_FILE_DEF: LCTool = Object.freeze({
  name: CREATE_FILE_TOOL_NAME,
  description: CODE_CREATE_FILE_DESCRIPTION,
  parameters: CODE_CREATE_FILE_PARAMETERS,
  responseFormat: 'content_and_artifact' as LCTool['responseFormat'],
}) as LCTool;

const SKILL_EDIT_FILE_DEF: LCTool = Object.freeze({
  name: EDIT_FILE_TOOL_NAME,
  description: SKILL_EDIT_FILE_DESCRIPTION,
  parameters: SKILL_EDIT_FILE_PARAMETERS,
  responseFormat: 'content_and_artifact' as LCTool['responseFormat'],
}) as LCTool;

const CODE_EDIT_FILE_DEF: LCTool = Object.freeze({
  name: EDIT_FILE_TOOL_NAME,
  description: CODE_EDIT_FILE_DESCRIPTION,
  parameters: CODE_EDIT_FILE_PARAMETERS,
  responseFormat: 'content_and_artifact' as LCTool['responseFormat'],
}) as LCTool;

function buildReadFileDef(includeSkillFileInstructions: boolean): LCTool {
  return includeSkillFileInstructions ? READ_FILE_DEF : CODE_READ_FILE_DEF;
}

function buildFileAuthoringDefs(includeSkillFileInstructions: boolean): LCTool[] {
  return includeSkillFileInstructions
    ? [SKILL_CREATE_FILE_DEF, SKILL_EDIT_FILE_DEF]
    : [CODE_CREATE_FILE_DEF, CODE_EDIT_FILE_DEF];
}

function isCodeOnlyReadFileDef(def: LCTool | undefined): boolean {
  return (
    def?.name === ReadFileToolDefinition.name && def?.description === CODE_READ_FILE_DESCRIPTION
  );
}

function isCodeOnlyFileAuthoringDef(def: LCTool | undefined): boolean {
  if (def?.name === CREATE_FILE_TOOL_NAME) {
    return def.description === CODE_CREATE_FILE_DESCRIPTION;
  }
  if (def?.name === EDIT_FILE_TOOL_NAME) {
    return def.description === CODE_EDIT_FILE_DESCRIPTION;
  }
  return false;
}

export function isFileAuthoringToolDefinition(def: LCTool | undefined): boolean {
  if (def?.name === CREATE_FILE_TOOL_NAME) {
    return (
      def.description === CODE_CREATE_FILE_DESCRIPTION ||
      def.description === SKILL_CREATE_FILE_DESCRIPTION
    );
  }
  if (def?.name === EDIT_FILE_TOOL_NAME) {
    return (
      def.description === CODE_EDIT_FILE_DESCRIPTION ||
      def.description === SKILL_EDIT_FILE_DESCRIPTION
    );
  }
  return false;
}

/**
 * The `bash_tool` description varies along exactly one axis — whether
 * the LLM-facing `{{tool<idx>turn<turn>}}` reference syntax guide is
 * appended — so two frozen module-level singletons cover every call
 * site. Both are shaped identically to the legacy `BASH_TOOL_DEF`
 * constant; only `description` differs. Sharing references across
 * every agent init avoids per-call `Object.freeze` + SDK
 * `buildBashExecutionToolDescription` work, matching the no-allocation
 * intent of the original constant while keeping the per-agent gate
 * behavior introduced for tool-output references.
 */
function createBashToolDef(enableToolOutputReferences: boolean): LCTool {
  return Object.freeze({
    name: BashExecutionToolDefinition.name,
    description: buildBashExecutionToolDescription({ enableToolOutputReferences }),
    parameters: BashExecutionToolDefinition.schema as unknown as LCTool['parameters'],
  }) as LCTool;
}

const BASH_TOOL_DEF_WITH_OUTPUT_REFS = createBashToolDef(true);
const BASH_TOOL_DEF_WITHOUT_OUTPUT_REFS = createBashToolDef(false);

function buildBashToolDef(opts: { enableToolOutputReferences: boolean }): LCTool {
  return opts.enableToolOutputReferences
    ? BASH_TOOL_DEF_WITH_OUTPUT_REFS
    : BASH_TOOL_DEF_WITHOUT_OUTPUT_REFS;
}

/**
 * Idempotently registers the code-execution tool pair (`bash_tool` +
 * `read_file`) into the run's tool registry and tool-definition list.
 * `read_file` can be registered with a code-only description first and
 * upgraded to the skill-aware description later in the same run if
 * skills are actually injected.
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
  const {
    toolRegistry,
    toolDefinitions,
    includeBash,
    includeSkillFileInstructions = true,
    enableToolOutputReferences = false,
  } = params;

  const readFileDef = buildReadFileDef(includeSkillFileInstructions);
  const candidates: LCTool[] = includeBash
    ? [readFileDef, buildBashToolDef({ enableToolOutputReferences })]
    : [readFileDef];

  const inputDefinitions = toolDefinitions ?? [];
  let workingDefinitions = inputDefinitions;

  const registered: string[] = [];
  const newDefs: LCTool[] = [];
  for (const def of candidates) {
    const existingIndex = workingDefinitions.findIndex((d) => d.name === def.name);
    const existingDef = existingIndex >= 0 ? workingDefinitions[existingIndex] : undefined;
    const registryDef = toolRegistry?.get(def.name);
    if (
      def.name === ReadFileToolDefinition.name &&
      includeSkillFileInstructions &&
      (isCodeOnlyReadFileDef(existingDef) || isCodeOnlyReadFileDef(registryDef))
    ) {
      if (isCodeOnlyReadFileDef(existingDef)) {
        workingDefinitions =
          workingDefinitions === inputDefinitions ? [...inputDefinitions] : workingDefinitions;
        workingDefinitions[existingIndex] = def;
      }
      if (isCodeOnlyReadFileDef(registryDef)) {
        toolRegistry?.set(def.name, def);
      }
      continue;
    }

    const inRegistry = toolRegistry?.has(def.name) === true;
    const inDefs = existingIndex >= 0;
    if (inRegistry || inDefs) {
      continue;
    }
    toolRegistry?.set(def.name, def);
    newDefs.push(def);
    registered.push(def.name);
  }

  /**
   * Skip the array spread on the common second-call path when no tools were
   * newly registered. Returns the input array by reference unless an existing
   * code-only `read_file` definition was upgraded above.
   */
  if (newDefs.length === 0) {
    return { toolDefinitions: workingDefinitions, registered };
  }
  return {
    toolDefinitions: [...workingDefinitions, ...newDefs],
    registered,
  };
}

export function registerFileAuthoringTools(
  params: RegisterFileAuthoringToolsParams,
): RegisterFileAuthoringToolsResult {
  const { toolRegistry, toolDefinitions, includeSkillFileInstructions = true } = params;

  const candidates = buildFileAuthoringDefs(includeSkillFileInstructions);
  const inputDefinitions = toolDefinitions ?? [];
  let workingDefinitions = inputDefinitions;

  const registered: string[] = [];
  const newDefs: LCTool[] = [];
  for (const def of candidates) {
    const existingIndex = workingDefinitions.findIndex((d) => d.name === def.name);
    const existingDef = existingIndex >= 0 ? workingDefinitions[existingIndex] : undefined;
    const registryDef = toolRegistry?.get(def.name);

    if (
      includeSkillFileInstructions &&
      (isCodeOnlyFileAuthoringDef(existingDef) || isCodeOnlyFileAuthoringDef(registryDef))
    ) {
      if (isCodeOnlyFileAuthoringDef(existingDef)) {
        workingDefinitions =
          workingDefinitions === inputDefinitions ? [...inputDefinitions] : workingDefinitions;
        workingDefinitions[existingIndex] = def;
      }
      if (isCodeOnlyFileAuthoringDef(registryDef)) {
        toolRegistry?.set(def.name, def);
      }
      continue;
    }

    const inRegistry = toolRegistry?.has(def.name) === true;
    const inDefs = existingIndex >= 0;
    if (inRegistry || inDefs) {
      continue;
    }

    toolRegistry?.set(def.name, def);
    newDefs.push(def);
    registered.push(def.name);
  }

  if (newDefs.length === 0) {
    return { toolDefinitions: workingDefinitions, registered };
  }
  return {
    toolDefinitions: [...workingDefinitions, ...newDefs],
    registered,
  };
}
