import yaml from 'js-yaml';
import { Types } from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { GraphEvents, Constants } from '@librechat/agents';
import type {
  LCTool,
  EventHandler,
  LCToolRegistry,
  InjectedMessage,
  ToolCallRequest,
  ToolExecuteResult,
  ToolExecuteBatchRequest,
} from '@librechat/agents';
import type { StructuredToolInterface } from '@librechat/agents/langchain/tools';
import type { CodeEnvRef } from 'librechat-data-provider';
import type { SkillFileRecord } from './skillFiles';
import type { ServerRequest } from '~/types';
import {
  backgroundTaskRegistry,
  runCheckBackgroundTask,
  claimBackgroundArtifact,
  restoreBackgroundArtifact,
  isBackgroundRequested,
  hasRunInBackgroundArg,
  stripRunInBackgroundArg,
  buildBackgroundHandleContent,
  buildBackgroundCapacityContent,
  stripBackgroundFromToolDefinitions,
  CHECK_BACKGROUND_TASK_NAME,
  RUN_IN_BACKGROUND_ARG,
} from './background';
import {
  CREATE_FILE_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  HOST_FILE_AUTHORING_ARTIFACT_KEY,
  isCodeSessionToolName,
} from './tools';
import { logAxiosError, runOutsideTracing, truncateMiddle } from '~/utils';
import { buildSkillPrimeMessage, SKILL_FILE_PREFIX } from './skills';
import { parseFrontmatter } from '../skills/import';
import { cleanCodeToolOutput } from './cleanup';
import { primeSkillFiles } from './skillFiles';
import { markSandboxReady } from './prewarm';

export interface ToolEndCallbackData {
  output: {
    name: string;
    tool_call_id: string;
    content: string | unknown;
    artifact?: unknown;
  };
}

export interface ToolEndCallbackMetadata {
  run_id?: string;
  thread_id?: string;
  [key: string]: unknown;
}

export type ToolEndCallback = (
  data: ToolEndCallbackData,
  metadata: ToolEndCallbackMetadata,
) => Promise<void>;

export interface ToolExecuteOptions {
  /** Loads tools by name, using agentId to look up agent-specific context */
  loadTools: (
    toolNames: string[],
    agentId?: string,
  ) => Promise<{
    loadedTools: StructuredToolInterface[];
    /** Additional configurable properties to merge (e.g., userMCPAuthMap) */
    configurable?: Record<string, unknown>;
  }>;
  /** Callback to process tool artifacts (code output files, file citations, etc.) */
  toolEndCallback?: ToolEndCallback;
  /**
   * Loads a skill by name with ACL constraint (returns full body for injection).
   *
   * `options.preferModelInvocable` (Phase 6): on a same-name collision,
   * prefer the newest `disableModelInvocation !== true` doc. Avoids a
   * newer disabled duplicate shadowing the cataloged model-invocable
   * skill the model actually targeted; falls back to newest match so
   * the explicit-rejection gate can still fire in the disabled-only case.
   */
  getSkillByName?: (
    name: string,
    accessibleIds: Types.ObjectId[],
    options?: { preferUserInvocable?: boolean; preferModelInvocable?: boolean },
  ) => Promise<{
    body: string;
    name: string;
    _id: Types.ObjectId;
    /** Monotonic counter on the skill record. Threaded into
     *  `codeEnvRef.version` so codeapi's sessionKey scopes the cache
     *  per-revision; bumping the version on edit invalidates the
     *  prior cache entry. */
    version: number;
    fileCount: number;
    /** True for deployment-directory skills that are loaded in memory. */
    deployment?: boolean;
    /**
     * Set when the skill author opted out of model invocation. The handler
     * rejects the call and returns an instructive error so the model knows
     * it can't reach the skill via the `skill` tool — manual `$` invocation
     * is still allowed and goes through `resolveManualSkills` instead.
     */
    disableModelInvocation?: boolean;
  } | null>;
  /**
   * Loads a skill by name when the current user is the author. This is a
   * narrow recovery path for freshly-authored skills whose runtime catalog
   * snapshot has not caught up yet; normal skill resolution still goes
   * through `accessibleSkillIds`.
   */
  getAuthorSkillByName?: (params: { req: ServerRequest; name: string }) => Promise<{
    body: string;
    name: string;
    _id: Types.ObjectId;
    version: number;
    fileCount: number;
    disableModelInvocation?: boolean;
  } | null>;
  /** Creates a skill from a tool-authored SKILL.md body. */
  createSkill?: (data: {
    name: string;
    description: string;
    body: string;
    frontmatter?: Record<string, unknown>;
    author: Types.ObjectId;
    authorName: string;
    alwaysApply?: boolean;
    tenantId?: string;
  }) => Promise<{
    skill: {
      _id: Types.ObjectId;
      name: string;
      body: string;
      version: number;
    };
  }>;
  /** Updates a skill body and derived metadata from a tool-authored SKILL.md body. */
  updateSkill?: (params: {
    id: string;
    expectedVersion: number;
    update: {
      body?: string;
      description?: string;
      frontmatter?: Record<string, unknown>;
      alwaysApply?: boolean;
    };
  }) => Promise<
    | {
        status: 'updated';
        skill: { _id: Types.ObjectId; name: string; body: string; version: number };
      }
    | { status: 'conflict'; current: { _id: Types.ObjectId; name: string; version: number } }
    | { status: 'not_found' }
  >;
  /** Checks role-level skill creation permission for the current user. */
  canCreateSkill?: (params: { req: ServerRequest }) => Promise<boolean>;
  /** Checks resource-level edit permission for an existing skill. */
  canEditSkill?: (params: {
    req: ServerRequest;
    skillId: Types.ObjectId | string;
  }) => Promise<boolean>;
  /** Grants SKILL_OWNER to the current user after a tool-created skill is inserted. */
  grantSkillOwner?: (params: {
    req: ServerRequest;
    skillId: Types.ObjectId | string;
  }) => Promise<void>;
  /** Deletes a freshly-created skill if owner-permission setup fails. */
  deleteSkill?: (id: string) => Promise<{ deleted: boolean }>;
  /** Saves or replaces a bundled skill file in configured storage and metadata. */
  saveSkillFileContent?: (params: {
    req: ServerRequest;
    skillId: Types.ObjectId | string;
    relativePath: string;
    content: string;
    mimeType: string;
  }) => Promise<{
    bytes: number;
    relativePath: string;
  }>;
  /** Lists files bundled with a skill (for code env priming) */
  listSkillFiles?: (skillId: Types.ObjectId | string) => Promise<SkillFileRecord[]>;
  /** Storage strategy resolver for skill file streaming */
  getStrategyFunctions?: (source: string) => {
    getDownloadStream?: (req: ServerRequest, filepath: string) => Promise<NodeJS.ReadableStream>;
    [key: string]: unknown;
  };
  /** Batch uploads files to the code execution environment. `kind`/`id`/
   *  `version?` carry the resource identity codeapi uses to derive the
   *  sessionKey for the batch's storage bucket. */
  batchUploadCodeEnvFiles?: (params: {
    req: ServerRequest;
    files: Array<{ stream: NodeJS.ReadableStream; filename: string }>;
    kind: 'skill' | 'agent' | 'user';
    id: string;
    version?: number;
    read_only?: boolean;
  }) => Promise<{
    storage_session_id: string;
    files: Array<{ fileId: string; filename: string }>;
  }>;
  /** Checks if a code env file is still active. Returns lastModified or null. */
  getSessionInfo?: (ref: CodeEnvRef, req?: ServerRequest) => Promise<string | null>;
  /** 23-hour freshness check */
  checkIfActive?: (dateString: string) => boolean;
  /** Persists `codeEnvRef` on skill files after upload */
  updateSkillFileCodeEnvIds?: (
    updates: Array<{
      skillId: Types.ObjectId | string;
      relativePath: string;
      codeEnvRef: CodeEnvRef;
    }>,
  ) => Promise<void>;
  /** Loads a skill file by path (for read_file tool) */
  getSkillFileByPath?: (
    skillId: Types.ObjectId | string,
    relativePath: string,
  ) => Promise<{
    content?: string;
    isBinary?: boolean;
    mimeType: string;
    bytes: number;
    filepath: string;
    source: string;
    relativePath: string;
  } | null>;
  /** Updates cached content on a skill file (lazy caching after first read) */
  updateSkillFileContent?: (
    skillId: Types.ObjectId | string,
    relativePath: string,
    update: { content?: string; isBinary?: boolean },
  ) => Promise<void>;
  /**
   * Reads a code-execution sandbox file by shelling `cat` through the
   * sandbox `/exec` endpoint. The host implementation supplies the
   * codeapi base URL + auth and forwards the seeded `session_id` and
   * `files` so the read lands in the same sandbox session that holds
   * the agent's prior-turn artifacts. Returns `null` when codeapi is
   * unavailable; throws on transport errors so the handler can surface
   * a meaningful error message to the model.
   */
  readSandboxFile?: (params: {
    file_path: string;
    session_id?: string;
    files?: Array<{ id: string; name: string; session_id?: string; storage_session_id?: string }>;
    /** Per-conversation stateful runtime-session hint (thread_id); forwarded so a
     *  host file op that is the first sandbox call joins the same runtime session
     *  as bash_tool instead of the Code API's default session. */
    runtime_session_hint?: string;
    req?: ServerRequest;
  }) => Promise<{ content: string } | null>;
  /**
   * Reads a small image file out of the code-execution sandbox as base64 so
   * `read_file` can surface it to vision-capable models. The `readSandboxFile`
   * `cat` path round-trips stdout through codeapi's JSON transport, which
   * lossily replaces non-UTF-8 bytes and mangles image data — this reader
   * base64-encodes the bytes IN the sandbox (ASCII-safe over JSON) after an
   * in-sandbox size guard so an oversize image never crosses the wire.
   * Returns `null` when codeapi is unavailable; throws on transport / read
   * errors so the handler can fall back to an instructive message.
   */
  readSandboxImage?: (params: {
    file_path: string;
    session_id?: string;
    files?: Array<{ id: string; name: string; session_id?: string; storage_session_id?: string }>;
    /** @see readSandboxFile.runtime_session_hint */
    runtime_session_hint?: string;
    /** In-sandbox size cap; files larger than this return `tooLarge` without transferring bytes. */
    maxBytes?: number;
    req?: ServerRequest;
  }) => Promise<{ base64: string; bytes: number } | { tooLarge: true; bytes: number } | null>;
  /**
   * Writes a UTF-8 text file into the code-execution sandbox via the
   * sandbox `/exec` endpoint. Mirrors `readSandboxFile` session forwarding
   * so host-side file-authoring tools can operate in the same sandbox
   * session as `bash_tool` / `read_file`.
   */
  writeSandboxFile?: (params: {
    file_path: string;
    content: string;
    session_id?: string;
    files?: Array<{ id: string; name: string; session_id?: string; storage_session_id?: string }>;
    /** @see readSandboxFile.runtime_session_hint */
    runtime_session_hint?: string;
    req?: ServerRequest;
  }) => Promise<{
    stdout?: string;
    stderr?: string;
    session_id?: string;
    files?: Array<{ id: string; name: string; storage_session_id?: string; session_id?: string }>;
  } | null>;
}

const MAX_READABLE_BYTES = 262_144;
const MAX_BINARY_BYTES = 5 * 1024 * 1024;
/**
 * Inline ceiling for images pulled out of the code-execution sandbox —
 * deliberately tighter than {@link MAX_BINARY_BYTES}, which governs the
 * skill-file path. The two differ because their transports differ: skill
 * files stream from storage, while sandbox bytes come back base64 over
 * `/exec` stdout, which the runner caps (`SANDBOX_OUTPUT_MAX_SIZE`). The
 * reader therefore windows the file, so cost scales in round-trips —
 * ~32 at this limit vs ~160 at 5MB. Nothing is lost by stopping here:
 * vision providers downsample to ~1.5-2k px regardless, so multi-MB
 * originals buy no fidelity, and anything larger degrades to the
 * `bash_tool` hint below.
 */
const MAX_SANDBOX_INLINE_IMAGE_BYTES = 1024 * 1024;
const MAX_CACHE_BYTES = 512 * 1024;
const MAX_AUTHORING_BYTES = 10 * 1024 * 1024;
const MAX_TOOL_ERROR_MESSAGE_CHARS = 12_000;
const MAX_TOOL_ERROR_STACK_CHARS = 4_000;
const SKILL_MD = 'SKILL.md';

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

type ToolInputSchemaKind = {
  object: boolean;
  string: boolean;
};

function stringifyThrownValue(error: unknown): string {
  try {
    return String(error);
  } catch {
    return '[Thrown value could not be converted to string]';
  }
}

function getThrownValueMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error != null && typeof error === 'object') {
    try {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
      if (message != null) {
        return stringifyThrownValue(message);
      }
    } catch {
      // Fall through to whole-value stringification.
    }
  }

  return stringifyThrownValue(error);
}

function getSafeToolError(error: unknown): {
  message: string;
  logContext: Record<string, unknown>;
} {
  const rawMessage = getThrownValueMessage(error);
  const message = truncateMiddle(rawMessage, MAX_TOOL_ERROR_MESSAGE_CHARS);
  const stack = error instanceof Error && error.stack ? error.stack : undefined;

  return {
    message,
    logContext: {
      name: error instanceof Error ? error.name : typeof error,
      message,
      messageLength: rawMessage.length,
      messageTruncated: message.length !== rawMessage.length,
      stack: stack ? truncateMiddle(stack, MAX_TOOL_ERROR_STACK_CHARS) : undefined,
    },
  };
}

function mergeSchemaKind(target: ToolInputSchemaKind, source: ToolInputSchemaKind): void {
  target.object ||= source.object;
  target.string ||= source.string;
}

function detectToolInputSchemaKind(schema: unknown): ToolInputSchemaKind {
  const kind: ToolInputSchemaKind = { object: false, string: false };

  if (!schema || typeof schema !== 'object') {
    return kind;
  }

  const jsonSchemaType = (schema as { type?: unknown }).type;
  if (jsonSchemaType === 'object') {
    kind.object = true;
  } else if (jsonSchemaType === 'string') {
    kind.string = true;
  } else if (Array.isArray(jsonSchemaType)) {
    kind.object = jsonSchemaType.includes('object');
    kind.string = jsonSchemaType.includes('string');
  }

  for (const compositeKey of ['anyOf', 'oneOf', 'allOf'] as const) {
    const options = (schema as Record<typeof compositeKey, unknown>)[compositeKey];
    if (Array.isArray(options)) {
      for (const option of options) {
        mergeSchemaKind(kind, detectToolInputSchemaKind(option));
      }
    }
  }

  const zodDef = (schema as { _def?: unknown })._def;
  if (!zodDef || typeof zodDef !== 'object') {
    return kind;
  }

  const zodType = (zodDef as { type?: unknown; typeName?: unknown }).type;
  const zodTypeName = (zodDef as { type?: unknown; typeName?: unknown }).typeName;

  if (zodType === 'object' || zodTypeName === 'ZodObject') {
    kind.object = true;
  } else if (zodType === 'string' || zodTypeName === 'ZodString') {
    kind.string = true;
  }

  const innerSchema =
    (zodDef as { innerType?: unknown; schema?: unknown }).innerType ??
    (zodDef as { schema?: unknown }).schema;
  if (innerSchema) {
    mergeSchemaKind(kind, detectToolInputSchemaKind(innerSchema));
  }

  const zodOptions = (zodDef as { options?: unknown }).options;
  if (Array.isArray(zodOptions)) {
    for (const option of zodOptions) {
      mergeSchemaKind(kind, detectToolInputSchemaKind(option));
    }
  }

  return kind;
}

function getToolInputSchemaKind(tool: StructuredToolInterface): ToolInputSchemaKind {
  const constructorName = (tool as { constructor?: { name?: string } }).constructor?.name;
  if (constructorName === 'DynamicTool') {
    return { object: false, string: true };
  }

  return detectToolInputSchemaKind((tool as { schema?: unknown }).schema);
}

function normalizeToolInvokeArgs(args: unknown, tool: StructuredToolInterface): unknown {
  const schemaKind = getToolInputSchemaKind(tool);

  if (typeof args !== 'string') {
    if (!schemaKind.string || schemaKind.object) {
      return args;
    }

    const inputValue = (args as { input?: unknown })?.input;
    return typeof inputValue === 'string' ? args : JSON.stringify(args);
  }

  if (!schemaKind.object || schemaKind.string) {
    return args;
  }

  const trimmed = args.trim();
  if (!trimmed.startsWith('{')) {
    return args;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return args;
  }

  return args;
}

function getValueShape(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function addLineNumbers(content: string): string {
  const lines = content.split('\n');
  const w = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(w, ' ')} | ${l}`).join('\n');
}

type AuthoringSkill = NonNullable<
  Awaited<ReturnType<NonNullable<ToolExecuteOptions['getSkillByName']>>>
>;

type AuthoringResult = Promise<ToolExecuteResult>;

type ParsedSkillAuthoringPath = {
  skillName: string;
  relativePath: string;
  displayPath: string;
};

type TextEdit = {
  old_text: string;
  new_text: string;
};

type MatchStatus =
  | { status: 'matched'; index: number; length: number; strategy: string }
  | { status: 'none' }
  | { status: 'ambiguous'; strategy: string; count: number };

type LoadedSkillText =
  | { status: 'loaded'; content: string; bytes: number }
  | { status: 'missing' }
  | { status: 'error'; message: string };

type ExistingSkillFile =
  | { status: 'present'; oldContent?: string }
  | { status: 'missing' }
  | { status: 'error'; message: string };

type LoadedSandboxText = LoadedSkillText;

type SandboxSessionContext = {
  session_id?: string;
  files?: Array<{ id: string; name: string; session_id?: string; storage_session_id?: string }>;
};

const MIME_MAP: Readonly<Record<string, string>> = Object.freeze({
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.cjs': 'application/javascript',
  '.ts': 'application/typescript',
  '.tsx': 'application/typescript',
  '.jsx': 'application/javascript',
  '.py': 'text/x-python',
  '.sh': 'application/x-sh',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.css': 'text/css',
  '.html': 'text/html',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.toml': 'text/toml',
  '.ini': 'text/ini',
  '.svg': 'image/svg+xml',
});

function errorResult(tc: ToolCallRequest, errorMessage: string): ToolExecuteResult {
  return {
    toolCallId: tc.id,
    status: 'error',
    content: '',
    errorMessage,
  };
}

function successResult(
  tc: ToolCallRequest,
  content: string,
  artifact?: unknown,
): ToolExecuteResult {
  const result: ToolExecuteResult = {
    toolCallId: tc.id,
    status: 'success',
    content,
  };
  if (artifact !== undefined) {
    result.artifact = artifact;
  }
  return result;
}

function guessMimeType(filename: string): string {
  return MIME_MAP[lowercaseExtension(filename)] ?? 'application/octet-stream';
}

function isValidSkillName(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function isValidSkillFileRelativePath(value: string): boolean {
  if (!value || value.length > 500) {
    return false;
  }
  if (value.startsWith('/') || value.startsWith('\\')) {
    return false;
  }
  if (!/^[a-zA-Z0-9._\-/]+$/.test(value)) {
    return false;
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  return value !== SKILL_MD && segments[0] !== SKILL_MD;
}

function parseSkillAuthoringPath(filePath: string): ParsedSkillAuthoringPath | string {
  if (!filePath.startsWith(SKILL_FILE_PREFIX)) {
    return `Only skill file paths are supported. Use "skills/{skillName}/SKILL.md" or "skills/{skillName}/{path}".`;
  }

  const rest = filePath.slice(SKILL_FILE_PREFIX.length);
  const slashIdx = rest.indexOf('/');
  const skillName = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const relativePath = slashIdx === -1 ? SKILL_MD : rest.slice(slashIdx + 1) || SKILL_MD;

  if (!isValidSkillName(skillName)) {
    return `Invalid skill name "${skillName}". Skill names must be kebab-case.`;
  }
  if (relativePath !== SKILL_MD && !isValidSkillFileRelativePath(relativePath)) {
    return (
      `Invalid skill file path "${relativePath}". ` +
      'Paths must be relative and cannot contain empty, "." or ".." segments.'
    );
  }

  return {
    skillName,
    relativePath,
    displayPath: `${SKILL_FILE_PREFIX}${skillName}/${relativePath}`,
  };
}

function deriveSkillDescription(body: string, skillName: string): string {
  const fallback = `Use this skill for ${skillName.replace(/-/g, ' ')}.`;
  const headingCandidates: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const withoutMarkdown = trimmed
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[*>-]\s+/, '')
      .trim();
    if (!withoutMarkdown) {
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      headingCandidates.push(withoutMarkdown);
      continue;
    }
    return truncateMiddle(withoutMarkdown.replace(/\s+/g, ' '), 180);
  }
  const heading = headingCandidates[0];
  return heading ? truncateMiddle(heading.replace(/\s+/g, ' '), 180) : fallback;
}

function splitSkillFrontmatter(content: string):
  | {
      block: string;
      body: string;
    }
  | { error: string }
  | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) {
    return null;
  }
  const afterOpening = trimmed.slice(3);
  const closingIdx = afterOpening.indexOf('\n---');
  if (closingIdx === -1) {
    return { error: `Invalid ${SKILL_MD} frontmatter: missing closing "---".` };
  }
  const afterClosing = afterOpening.slice(closingIdx + '\n---'.length);
  return {
    block: afterOpening.slice(0, closingIdx),
    body: afterClosing.startsWith('\n') ? afterClosing.slice(1) : afterClosing,
  };
}

function buildSkillMdContent(frontmatter: Record<string, unknown>, body: string): string {
  const dumped = yaml.dump(frontmatter, { lineWidth: -1 }).trimEnd();
  const normalizedBody = body.trimStart();
  return `---\n${dumped}\n---\n${normalizedBody}`;
}

function skillNameMismatchError(frontmatterName: string, skillName: string): string {
  return `${SKILL_MD} frontmatter name "${frontmatterName}" must match path skill name "${skillName}". edit_file cannot rename skills; keep the name unchanged or create a new skills/{newName}/SKILL.md.`;
}

function normalizeSkillMdContent(
  content: string,
  skillName: string,
): { status: 'success'; content: string } | { status: 'error'; error: string } {
  const split = splitSkillFrontmatter(content);
  if (split && 'error' in split) {
    return { status: 'error', error: split.error };
  }

  let normalizedContent = content;
  if (!split) {
    normalizedContent = buildSkillMdContent(
      {
        name: skillName,
        description: deriveSkillDescription(content, skillName),
      },
      content,
    );
  } else {
    const structured = parseStructuredSkillFrontmatter(content);
    if (structured.error) {
      return { status: 'error', error: structured.error };
    }
    const frontmatter = { ...(structured.frontmatter ?? {}) };
    const parsed = parseFrontmatter(content);
    const frontmatterName =
      typeof frontmatter.name === 'string' ? frontmatter.name : parsed.name || undefined;
    if (frontmatterName && frontmatterName !== skillName) {
      return {
        status: 'error',
        error: skillNameMismatchError(frontmatterName, skillName),
      };
    }
    frontmatter.name = skillName;
    const frontmatterDescription =
      typeof frontmatter.description === 'string'
        ? frontmatter.description
        : parsed.description || undefined;
    frontmatter.description =
      frontmatterDescription || deriveSkillDescription(split.body, skillName);
    normalizedContent = buildSkillMdContent(frontmatter, split.body);
  }

  const parsed = parseFrontmatter(normalizedContent);
  if (!parsed.name || !parsed.description) {
    return {
      status: 'error',
      error: `${SKILL_MD} must include YAML frontmatter with "name" and "description".`,
    };
  }
  if (parsed.name !== skillName) {
    return {
      status: 'error',
      error: skillNameMismatchError(parsed.name, skillName),
    };
  }
  if (parsed.invalidBooleans.length > 0) {
    return {
      status: 'error',
      error: parsed.invalidBooleans
        .map((key) => `"${key}" in ${SKILL_MD} frontmatter must be a boolean`)
        .join('; '),
    };
  }
  return { status: 'success', content: normalizedContent };
}

function extractSkillFrontmatterBlock(content: string): string | null {
  const split = splitSkillFrontmatter(content);
  if (!split || 'error' in split) {
    return null;
  }
  return split.block;
}

function parseStructuredSkillFrontmatter(
  content: string,
):
  | { frontmatter?: Record<string, unknown>; error?: undefined }
  | { frontmatter?: undefined; error: string } {
  const block = extractSkillFrontmatterBlock(content);
  if (block == null) {
    return {};
  }
  try {
    const parsed = yaml.load(block);
    if (parsed == null) {
      return { frontmatter: {} };
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: `${SKILL_MD} frontmatter must be a YAML mapping.` };
    }
    return { frontmatter: parsed as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Invalid ${SKILL_MD} frontmatter: ${message}` };
  }
}

function parseSkillMdUpdate(content: string): {
  description: string;
  frontmatter?: Record<string, unknown>;
  alwaysApply?: boolean;
} {
  const parsed = parseFrontmatter(content);
  const structured = parseStructuredSkillFrontmatter(content);
  const structuredDescription =
    typeof structured.frontmatter?.description === 'string'
      ? structured.frontmatter.description
      : undefined;
  return {
    description: structuredDescription ?? parsed.description,
    ...(structured.frontmatter !== undefined ? { frontmatter: structured.frontmatter } : {}),
    ...(parsed.alwaysApply !== undefined ? { alwaysApply: parsed.alwaysApply } : {}),
  };
}

function getAuthorInfo(req: ServerRequest): {
  author: Types.ObjectId;
  authorName: string;
  tenantId?: string;
} | null {
  const user = req.user as
    | {
        id?: string;
        _id?: Types.ObjectId | string;
        name?: string;
        username?: string;
        tenantId?: string;
      }
    | undefined;
  if (!user?.id) {
    return null;
  }
  return {
    author: (user._id ?? user.id) as Types.ObjectId,
    authorName: user.name ?? user.username ?? 'Unknown',
    ...(user.tenantId ? { tenantId: user.tenantId } : {}),
  };
}

/* Models often stringify nested JSON (JSON-in-JSON) instead of passing a
   real array/object, which would otherwise fail validation and cost a retry
   round-trip. Parse a JSON string back to its value; leave non-strings and
   unparseable strings untouched so the explicit errors below still fire. */
function coerceJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeEditArgs(args: {
  old_text?: unknown;
  new_text?: unknown;
  edits?: unknown;
}): TextEdit[] | string {
  const coercedEdits = coerceJsonValue(args.edits);
  if (Array.isArray(coercedEdits) && coercedEdits.length > 0) {
    const edits: TextEdit[] = [];
    for (const rawEdit of coercedEdits) {
      const edit = coerceJsonValue(rawEdit);
      if (!edit || typeof edit !== 'object') {
        return 'Each edit must be an object with old_text and new_text.';
      }
      const entry = edit as { old_text?: unknown; new_text?: unknown };
      if (typeof entry.old_text !== 'string' || typeof entry.new_text !== 'string') {
        return 'Each edit requires string old_text and new_text.';
      }
      if (entry.old_text.length === 0) {
        return 'old_text cannot be empty.';
      }
      edits.push({ old_text: entry.old_text, new_text: entry.new_text });
    }
    return edits;
  }

  if (typeof args.old_text !== 'string' || typeof args.new_text !== 'string') {
    return 'Provide old_text and new_text, or a non-empty edits array.';
  }
  if (args.old_text.length === 0) {
    return 'old_text cannot be empty.';
  }
  return [{ old_text: args.old_text, new_text: args.new_text }];
}

function countExactOccurrences(content: string, needle: string): number[] {
  const indexes: number[] = [];
  let start = 0;
  while (start <= content.length) {
    const index = content.indexOf(needle, start);
    if (index === -1) {
      break;
    }
    indexes.push(index);
    start = index + Math.max(1, needle.length);
  }
  return indexes;
}

function findExactMatch(content: string, needle: string): MatchStatus {
  const matches = countExactOccurrences(content, needle);
  if (matches.length === 1) {
    return { status: 'matched', index: matches[0], length: needle.length, strategy: 'exact' };
  }
  if (matches.length > 1) {
    return { status: 'ambiguous', strategy: 'exact', count: matches.length };
  }
  return { status: 'none' };
}

function lineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function commonIndent(lines: string[]): number {
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const match = /^(\s*)/.exec(line);
      return match ? match[1].length : 0;
    });
  return indents.length > 0 ? Math.min(...indents) : 0;
}

function stripCommonIndent(text: string): string {
  const lines = text.split('\n');
  const indent = commonIndent(lines);
  if (indent === 0) {
    return text;
  }
  return lines.map((line) => line.slice(Math.min(indent, line.length))).join('\n');
}

function findLineWindowMatch(
  content: string,
  needle: string,
  strategy: 'line-trimmed' | 'indentation-flexible',
): MatchStatus {
  const contentLines = content.split('\n');
  const needleLines = needle.split('\n');
  if (needleLines.length > contentLines.length) {
    return { status: 'none' };
  }

  const starts = lineStarts(content);
  const normalizedNeedle =
    strategy === 'line-trimmed'
      ? needleLines.map((line) => line.trimEnd()).join('\n')
      : stripCommonIndent(needle);
  const matches: Array<{ index: number; length: number }> = [];

  for (let i = 0; i <= contentLines.length - needleLines.length; i++) {
    const windowLines = contentLines.slice(i, i + needleLines.length);
    const candidate =
      strategy === 'line-trimmed'
        ? windowLines.map((line) => line.trimEnd()).join('\n')
        : stripCommonIndent(windowLines.join('\n'));
    if (candidate !== normalizedNeedle) {
      continue;
    }
    const index = starts[i];
    const endLine = i + needleLines.length;
    const end = endLine < starts.length ? starts[endLine] - 1 : content.length;
    matches.push({ index, length: end - index });
  }

  if (matches.length === 1) {
    return { status: 'matched', ...matches[0], strategy };
  }
  if (matches.length > 1) {
    return { status: 'ambiguous', strategy, count: matches.length };
  }
  return { status: 'none' };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findWhitespaceNormalizedMatch(content: string, needle: string): MatchStatus {
  const tokens = needle.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return { status: 'none' };
  }
  const pattern = tokens.map(escapeRegExp).join('\\s+');
  const regex = new RegExp(pattern, 'g');
  const matches: Array<{ index: number; length: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) != null) {
    matches.push({ index: match.index, length: match[0].length });
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
  if (matches.length === 1) {
    return { status: 'matched', ...matches[0], strategy: 'whitespace-normalized' };
  }
  if (matches.length > 1) {
    return { status: 'ambiguous', strategy: 'whitespace-normalized', count: matches.length };
  }
  return { status: 'none' };
}

function findReplacementMatch(content: string, needle: string): MatchStatus {
  const exact = findExactMatch(content, needle);
  if (exact.status !== 'none') {
    return exact;
  }
  const lineTrimmed = findLineWindowMatch(content, needle, 'line-trimmed');
  if (lineTrimmed.status !== 'none') {
    return lineTrimmed;
  }
  const whitespaceNormalized = findWhitespaceNormalizedMatch(content, needle);
  if (whitespaceNormalized.status !== 'none') {
    return whitespaceNormalized;
  }
  return findLineWindowMatch(content, needle, 'indentation-flexible');
}

function applyTextEdits(
  content: string,
  edits: TextEdit[],
): { content: string; strategies: string[] } {
  let working = content;
  const strategies: string[] = [];

  for (const edit of edits) {
    const match = findReplacementMatch(working, edit.old_text);
    if (match.status === 'none') {
      throw new Error('old_text did not match the file content.');
    }
    if (match.status === 'ambiguous') {
      throw new Error(
        `old_text matched ${match.count} locations with ${match.strategy}; make it unique before retrying.`,
      );
    }
    working =
      working.slice(0, match.index) + edit.new_text + working.slice(match.index + match.length);
    strategies.push(match.strategy);
  }

  return { content: working, strategies };
}

function formatRange(start: number, count: number): string {
  return count === 1 ? String(start) : `${start},${count}`;
}

function createUnifiedDiff(filePath: string, oldContent: string, newContent: string): string {
  if (oldContent === newContent) {
    return '';
  }

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }

  let oldSuffix = oldLines.length - 1;
  let newSuffix = newLines.length - 1;
  while (
    oldSuffix >= prefix &&
    newSuffix >= prefix &&
    oldLines[oldSuffix] === newLines[newSuffix]
  ) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const contextStart = Math.max(0, prefix - 3);
  const oldContextEnd = Math.min(oldLines.length - 1, oldSuffix + 3);
  const newContextEnd = Math.min(newLines.length - 1, newSuffix + 3);
  const oldCount = oldContextEnd >= contextStart ? oldContextEnd - contextStart + 1 : 0;
  const newCount = newContextEnd >= contextStart ? newContextEnd - contextStart + 1 : 0;
  const lines = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${formatRange(contextStart + 1, oldCount)} +${formatRange(contextStart + 1, newCount)} @@`,
  ];

  for (let i = contextStart; i < prefix; i++) {
    lines.push(` ${oldLines[i]}`);
  }
  for (let i = prefix; i <= oldSuffix; i++) {
    lines.push(`-${oldLines[i]}`);
  }
  for (let i = prefix; i <= newSuffix; i++) {
    lines.push(`+${newLines[i]}`);
  }
  for (let i = oldSuffix + 1; i <= oldContextEnd; i++) {
    lines.push(` ${oldLines[i]}`);
  }

  return lines.join('\n');
}

/**
 * Extensions whose contents `read_file` must never serialize as text. `cat`
 * on a PNG inside the sandbox returns the raw bytes as stdout, JSON-encoded
 * by codeapi with lossy UTF-8 replacement and then line-numbered by us —
 * the result is a multi-KB blob of mojibake that pollutes the LLM context
 * and exposes the raw bytes anyway. Short-circuit before the network call.
 *
 * Image categories surface a "use the existing attachment" message because
 * the file was already attached to the conversation as part of the
 * code-execution artifact pipeline — re-attaching here would dup it.
 */
const BINARY_EXTENSIONS_NEVER_READABLE = new Set([
  // Raster images (already attached as artifacts by the code-execution
  // pipeline). `.svg` is intentionally NOT in this list — it's an XML
  // text format with no mojibake risk, and there are legitimate reasons
  // for the model to inspect or edit a generated SVG. The post-fetch
  // NUL-byte sniff still catches anything that turns out to be binary
  // despite a `.svg` extension.
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.ico',
  '.heic',
  '.heif',
  '.avif',
  // Documents (binary container formats)
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.lz4',
  '.zst',
  // Audio / video
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.m4a',
  '.aac',
  '.wma',
  '.mp4',
  '.mkv',
  '.mov',
  '.avi',
  '.webm',
  '.flv',
  '.m4v',
  // Executables / object files / native libs
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.o',
  '.obj',
  '.a',
  '.lib',
  '.bin',
  '.class',
  '.jar',
  // Other byte-soup formats
  '.parquet',
  '.bson',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.pyc',
  '.pyo',
  '.wasm',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
]);

const IMAGE_EXTENSIONS_FOR_HINT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.ico',
  '.heic',
  '.heif',
  '.avif',
]);

function lowercaseExtension(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (dot < 0 || dot < slash) return '';
  return filePath.slice(dot).toLowerCase();
}

/**
 * Builds the model-visible error returned when `read_file` is invoked on
 * a binary path. Phrasing is tuned for the LLM: states the fact (file is
 * binary, can't be read as text), points at the correct affordance for
 * each common case (image via bash bytes; bash for everything else), and
 * includes the path verbatim so the model can copy-paste into its next
 * call. Supported raster images take the inline-attachment path first (see
 * `handleSandboxImageRead`); this image branch is only reached when that
 * read is unavailable (codeapi off) or fails.
 */
function buildBinaryFileError(filePath: string, ext: string): string {
  if (IMAGE_EXTENSIONS_FOR_HINT.has(ext)) {
    return `"${filePath}" is an image file (${ext}) and cannot be read as text. To process it programmatically, use \`bash_tool\` (e.g. \`file ${filePath}\` for metadata, or \`python3 -c '...'\` to operate on the bytes).`;
  }
  return `"${filePath}" is a binary file (${ext}) and cannot be read as text by \`read_file\`. Use \`bash_tool\` to process it (e.g. \`file ${filePath}\` for metadata, or a runtime-appropriate command for the format).`;
}

/**
 * Sandbox file extensions `read_file` attempts to inline as visual content.
 * The extension only decides ROUTING (try the base64 image read vs the text
 * / bash path); the emitted MIME comes from the magic-byte sniff so the
 * declared type always matches the actual bytes. Scoped to the four raster
 * formats the providers accept in tool results (`IMAGE_MIMES`); other image
 * extensions (`.bmp`, `.tiff`, `.svg`, ...) stay on the text / bash path.
 */
const SANDBOX_IMAGE_EXTENSIONS = new Set<string>(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/**
 * Magic-byte sniff for the raster formats we inline. Preferred over the
 * extension so a mislabelled `.png` that is really a JPEG is declared with
 * the MIME the provider will actually validate the bytes against. Returns
 * `undefined` when the header matches none of the supported formats.
 */
function sniffImageMime(buffer: Buffer): string | undefined {
  if (buffer.length < 4) return undefined;
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return undefined;
}

/**
 * Cheap structural check that the image bytes are complete, not just that the
 * header sniffed valid — a truncated/interrupted write can keep a valid magic
 * prefix while the body is missing, which would then fail `saveBase64Image`
 * resizing or the next provider request instead of the intended bash-hint
 * fallback. Only png (fixed 8-byte IEND trailer) and webp (self-describing
 * RIFF size) have a false-positive-free end marker; jpeg/gif can legitimately
 * carry trailing metadata, so those stay at header-level sniffing rather than
 * risk rejecting a valid file.
 */
function isCompleteImage(buffer: Buffer, mime: string): boolean {
  if (mime === 'image/png') {
    if (buffer.length < 8) return false;
    const iend = buffer.subarray(buffer.length - 8);
    return (
      iend[0] === 0x49 &&
      iend[1] === 0x45 &&
      iend[2] === 0x4e &&
      iend[3] === 0x44 &&
      iend[4] === 0xae &&
      iend[5] === 0x42 &&
      iend[6] === 0x60 &&
      iend[7] === 0x82
    );
  }
  if (mime === 'image/webp') {
    if (buffer.length < 12) return false;
    return buffer.readUInt32LE(4) === buffer.length - 8;
  }
  return true;
}

/**
 * Builds the `read_file` success result for an image: a short text line the
 * model reads plus the `image_url` block in `artifact.content`. The SDK
 * folds `artifact.content` into what the model sees (Anthropic tool_result
 * or a trailing Human message for OpenAI/Google), and the host tool-end
 * callback saves the same data URL as a viewable attachment. Shared by the
 * skill-file and sandbox read paths so both surface images identically.
 */
function buildImageArtifactResult(
  toolCallId: string,
  displayPath: string,
  mimeType: string,
  bytes: number,
  base64: string,
): ToolExecuteResult {
  return {
    toolCallId,
    status: 'success',
    content: `Image: ${displayPath} (${bytes} bytes, ${mimeType})`,
    artifact: {
      content: [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }],
    },
  };
}

/**
 * True when the first chunk of a string contains a NUL byte. Used as a
 * post-fetch safety net for files whose extension didn't match the
 * blocklist (no extension, novel format, etc.) — sniffs `cat` stdout to
 * avoid ever forwarding mangled bytes to the LLM. 8KB is the same
 * window the skill-file path uses; enough for any reasonable magic
 * number while bounded enough to stay cheap.
 */
function looksBinary(content: string): boolean {
  const limit = Math.min(content.length, 8192);
  for (let i = 0; i < limit; i++) {
    if (content.charCodeAt(i) === 0) return true;
  }
  return false;
}

/**
 * Reads a sandbox image as a viewable artifact so `read_file` can hand the
 * bytes to vision-capable models instead of refusing them. Fetches the file
 * base64-encoded from the sandbox (`readSandboxImage`), verifies the decoded
 * length matches the size the sandbox reported (guards against codeapi
 * truncating a large `/exec` stdout into a corrupt image), sniffs the real
 * MIME, and returns the shared image-artifact result. Degrades to the
 * text-oriented binary hint when the reader is unavailable, the image is
 * over the inline cap, or the read fails — never throws.
 */
async function handleSandboxImageRead(
  tc: ToolCallRequest,
  filePath: string,
  ext: string,
  options: ToolExecuteOptions,
  req?: ServerRequest,
): Promise<ToolExecuteResult> {
  const { readSandboxImage } = options;
  const binaryHint = (): ToolExecuteResult => ({
    toolCallId: tc.id,
    status: 'error',
    content: '',
    errorMessage: buildBinaryFileError(filePath, ext),
  });
  if (!readSandboxImage) {
    return binaryHint();
  }

  const ctx = tc.codeSessionContext as SandboxSessionContext | undefined;
  let read: { base64: string; bytes: number } | { tooLarge: true; bytes: number } | null;
  try {
    read = await readSandboxImage({
      file_path: filePath,
      session_id: ctx?.session_id,
      files: ctx?.files,
      maxBytes: MAX_SANDBOX_INLINE_IMAGE_BYTES,
      ...(tc.runtimeSessionHint ? { runtime_session_hint: tc.runtimeSessionHint } : {}),
      ...(req ? { req } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[handleReadFileCall] Sandbox image read failed for "${filePath}": ${message}`);
    return binaryHint();
  }

  if (!read) {
    return binaryHint();
  }
  if ('tooLarge' in read) {
    return {
      toolCallId: tc.id,
      status: 'success',
      content: `Image "${filePath}" is ${read.bytes} bytes, over the ${MAX_SANDBOX_INLINE_IMAGE_BYTES}-byte inline limit. Use \`bash_tool\` to process it (e.g. \`file ${filePath}\` for metadata).`,
    };
  }

  const buffer = Buffer.from(read.base64, 'base64');
  if (buffer.length !== read.bytes) {
    logger.warn(
      `[handleReadFileCall] Sandbox image byte mismatch for "${filePath}" (decoded ${buffer.length} != reported ${read.bytes})`,
    );
    return binaryHint();
  }
  // Resolve the MIME from the actual bytes, never the extension: a file
  // routed here by its `.png`/`.jpg`/... name whose header matches none of
  // the supported formats is a mislabeled non-image (a renamed .txt/.pdf).
  // Refuse it (and any truncated/incomplete image) with the bash hint
  // instead of shipping bytes the provider would reject as a corrupt image.
  const mimeType = sniffImageMime(buffer);
  if (!mimeType || !isCompleteImage(buffer, mimeType)) {
    return binaryHint();
  }
  return buildImageArtifactResult(tc.id, filePath, mimeType, buffer.length, read.base64);
}

/**
 * Routes a `read_file` call to the code-execution sandbox via the
 * host-provided `readSandboxFile` callback. The sandbox session id and
 * primed file refs come from `tc.codeSessionContext` (emitted by ToolNode
 * for `read_file` tool calls in agents v3.1.72+) so the read lands in the
 * same session that holds the agent's prior-turn artifacts. Returns a
 * `ToolExecuteResult` with the file content (line-numbered) on success,
 * or an instructive error pointing the model at `bash_tool` when the
 * sandbox isn't reachable from this configuration.
 *
 * Supported raster images (`.png/.jpg/.jpeg/.gif/.webp`) take a dedicated
 * base64 read path (`handleSandboxImageRead`) so the model can actually see
 * them. Two binary guards then keep `cat`-on-a-PNG-style mojibake out of the
 * LLM context for everything else: (1) an extension precheck that short-
 * circuits known binary types BEFORE any network call, and (2) a NUL-byte
 * content sniff after the read for unknown extensions. The codeapi `/exec`
 * transport is JSON, which lossily down-converts non-UTF-8 `cat` stdout to
 * replacement characters — text bytes are unrecoverable there, so the goal
 * is to fail fast with an instructive message rather than ship garbage.
 */
async function handleSandboxFileFallback(
  tc: ToolCallRequest,
  filePath: string,
  options: ToolExecuteOptions,
  req?: ServerRequest,
): Promise<ToolExecuteResult> {
  const ext = lowercaseExtension(filePath);
  if (SANDBOX_IMAGE_EXTENSIONS.has(ext)) {
    return handleSandboxImageRead(tc, filePath, ext, options, req);
  }
  if (BINARY_EXTENSIONS_NEVER_READABLE.has(ext)) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: buildBinaryFileError(filePath, ext),
    };
  }

  const { readSandboxFile } = options;
  if (!readSandboxFile) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Path "${filePath}" is not a skill file. Use \`bash_tool\` to read code-execution sandbox files (e.g. \`cat ${filePath}\`).`,
    };
  }

  const ctx = tc.codeSessionContext as SandboxSessionContext | undefined;
  try {
    const result = await readSandboxFile({
      file_path: filePath,
      session_id: ctx?.session_id,
      files: ctx?.files,
      ...(tc.runtimeSessionHint ? { runtime_session_hint: tc.runtimeSessionHint } : {}),
      ...(req ? { req } : {}),
    });
    if (!result || result.content == null) {
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: `Failed to read "${filePath}" from the code-execution sandbox. Try \`bash_tool\` (e.g. \`cat ${filePath}\`).`,
      };
    }
    if (looksBinary(result.content)) {
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: `"${filePath}" appears to be a binary file and cannot be read as text. Use \`bash_tool\` to process it (e.g. \`file ${filePath}\` for metadata).`,
      };
    }
    /**
     * Cap before line-numbering. `addLineNumbers` allocates a SECOND
     * full-size string with per-line prefixes, so a multi-MB log read
     * would materialize ~2x in memory before downstream truncation
     * kicks in. Match the skill-file path's `MAX_READABLE_BYTES`
     * (256KB) ceiling: truncate the raw content first, then number,
     * and surface the truncation to the model so it can use
     * `bash_tool head` / `tail` for the rest.
     */
    let payload = result.content;
    let truncated = false;
    if (payload.length > MAX_READABLE_BYTES) {
      payload = payload.slice(0, MAX_READABLE_BYTES);
      truncated = true;
    }
    let numbered = addLineNumbers(payload);
    if (truncated) {
      numbered += `\n\n[truncated at ${MAX_READABLE_BYTES} bytes — use \`bash_tool\` (e.g. \`head -c\` / \`tail\`) to read the rest of "${filePath}"]`;
    }
    return {
      toolCallId: tc.id,
      status: 'success',
      content: numbered,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[handleReadFileCall] Sandbox fallback failed for "${filePath}": ${message}`);
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Error reading "${filePath}" from the code-execution sandbox: ${message}. Try \`bash_tool\` (e.g. \`cat ${filePath}\`).`,
    };
  }
}

function sandboxSessionContext(
  tc: ToolCallRequest,
  override?: SandboxSessionContext,
): SandboxSessionContext | undefined {
  return override ?? (tc.codeSessionContext as SandboxSessionContext | undefined);
}

function cloneSandboxSessionContext(
  context: SandboxSessionContext | undefined,
): SandboxSessionContext {
  return {
    ...(context?.session_id ? { session_id: context.session_id } : {}),
    ...(context?.files ? { files: context.files.map((file) => ({ ...file })) } : {}),
  };
}

function mergeSandboxSessionArtifact(
  context: SandboxSessionContext,
  artifact: ToolExecuteResult['artifact'],
): void {
  if (!artifact || typeof artifact !== 'object') {
    return;
  }
  const value = artifact as {
    session_id?: unknown;
    files?: unknown;
  };
  if (typeof value.session_id === 'string' && value.session_id.length > 0) {
    context.session_id = value.session_id;
  }
  if (!Array.isArray(value.files)) {
    return;
  }

  const files: SandboxSessionContext['files'] = [];
  for (const file of value.files) {
    if (!file || typeof file !== 'object') {
      continue;
    }
    const ref = file as {
      id?: unknown;
      name?: unknown;
      session_id?: unknown;
      storage_session_id?: unknown;
    };
    if (typeof ref.id !== 'string' || typeof ref.name !== 'string') {
      continue;
    }
    files.push({
      id: ref.id,
      name: ref.name,
      ...(typeof ref.session_id === 'string' ? { session_id: ref.session_id } : {}),
      ...(typeof ref.storage_session_id === 'string'
        ? { storage_session_id: ref.storage_session_id }
        : {}),
    });
  }
  if (files.length > 0) {
    context.files = files;
  }
}

function isSandboxMissingFileError(error: unknown): boolean {
  const message = getThrownValueMessage(error).toLowerCase();
  return (
    message.includes('no such file or directory') ||
    message.includes('cannot access') ||
    message.includes('not found')
  );
}

function invalidSandboxAuthoringPath(filePath: string): string | null {
  if (filePath.length === 0) {
    return 'path is required';
  }
  if (filePath.includes('\0')) {
    return 'path cannot contain NUL bytes';
  }
  if (filePath.endsWith('/')) {
    return `File path "${filePath}" points to a directory. Provide a file path.`;
  }
  return null;
}

async function loadSandboxTextForAuthoring({
  filePath,
  tc,
  options,
  req,
  sandboxContext,
}: {
  filePath: string;
  tc: ToolCallRequest;
  options: ToolExecuteOptions;
  req?: ServerRequest;
  sandboxContext?: SandboxSessionContext;
}): Promise<LoadedSandboxText> {
  const ext = lowercaseExtension(filePath);
  if (BINARY_EXTENSIONS_NEVER_READABLE.has(ext)) {
    return { status: 'error', message: buildBinaryFileError(filePath, ext) };
  }
  if (!options.readSandboxFile) {
    return {
      status: 'error',
      message: `Sandbox file reading is not configured. Use \`bash_tool\` to inspect "${filePath}".`,
    };
  }

  const ctx = sandboxSessionContext(tc, sandboxContext);
  try {
    const result = await options.readSandboxFile({
      file_path: filePath,
      session_id: ctx?.session_id,
      files: ctx?.files,
      ...(tc.runtimeSessionHint ? { runtime_session_hint: tc.runtimeSessionHint } : {}),
      ...(req ? { req } : {}),
    });
    if (!result || result.content == null) {
      return {
        status: 'error',
        message: `Failed to read "${filePath}" from the code-execution sandbox.`,
      };
    }
    if (looksBinary(result.content)) {
      return {
        status: 'error',
        message: `"${filePath}" appears to be binary and cannot be edited as text.`,
      };
    }
    if (Buffer.byteLength(result.content, 'utf8') > MAX_AUTHORING_BYTES) {
      return {
        status: 'error',
        message: `File "${filePath}" is too large to edit directly (${Buffer.byteLength(
          result.content,
          'utf8',
        )} bytes, limit: ${MAX_AUTHORING_BYTES}).`,
      };
    }
    return {
      status: 'loaded',
      content: result.content,
      bytes: Buffer.byteLength(result.content, 'utf8'),
    };
  } catch (error) {
    if (isSandboxMissingFileError(error)) {
      return { status: 'missing' };
    }
    const message = getThrownValueMessage(error);
    logger.warn(`[file_authoring] Sandbox read failed for "${filePath}": ${message}`);
    return {
      status: 'error',
      message: `Error reading "${filePath}" from the code-execution sandbox: ${message}.`,
    };
  }
}

async function writeSandboxTextForAuthoring({
  tc,
  options,
  req,
  filePath,
  content,
  oldContent,
  created,
  sandboxContext,
}: {
  tc: ToolCallRequest;
  options: ToolExecuteOptions;
  req?: ServerRequest;
  filePath: string;
  content: string;
  oldContent?: string;
  created: boolean;
  sandboxContext?: SandboxSessionContext;
}): AuthoringResult {
  if (!options.writeSandboxFile) {
    return errorResult(
      tc,
      `Sandbox file writing is not configured. Use \`bash_tool\` to write "${filePath}".`,
    );
  }
  const ctx = sandboxSessionContext(tc, sandboxContext);
  let writeResult: Awaited<ReturnType<NonNullable<ToolExecuteOptions['writeSandboxFile']>>>;
  try {
    writeResult = await options.writeSandboxFile({
      file_path: filePath,
      content,
      session_id: ctx?.session_id,
      files: ctx?.files,
      ...(tc.runtimeSessionHint ? { runtime_session_hint: tc.runtimeSessionHint } : {}),
      ...(req ? { req } : {}),
    });
  } catch (error) {
    const message = getThrownValueMessage(error);
    logger.warn(`[file_authoring] Sandbox write failed for "${filePath}": ${message}`);
    return errorResult(
      tc,
      `Error writing "${filePath}" to the code-execution sandbox: ${message}.`,
    );
  }
  if (!writeResult) {
    return errorResult(tc, `Failed to write "${filePath}" to the code-execution sandbox.`);
  }

  const diff =
    oldContent !== undefined ? createUnifiedDiff(filePath, oldContent, content) : undefined;
  const action = created ? 'Created' : 'Updated';
  const summary = `${action} ${filePath} (${content.length} chars).`;
  return successResult(tc, diff ? `${summary}\n\n${diff}` : summary, {
    path: filePath,
    [HOST_FILE_AUTHORING_ARTIFACT_KEY]: true,
    bytes_written: Buffer.byteLength(content, 'utf8'),
    created,
    ...(diff ? { diff } : {}),
    ...(writeResult.session_id ? { session_id: writeResult.session_id } : {}),
    ...(writeResult.files ? { files: writeResult.files } : {}),
  });
}

async function resolveSkillForAuthoring(
  skillName: string,
  mergedConfigurable: Record<string, unknown>,
  options: ToolExecuteOptions,
): Promise<AuthoringSkill | null> {
  const { getSkillByName } = options;
  if (!getSkillByName) {
    return null;
  }

  const skillPrimedIdsByName =
    (mergedConfigurable?.skillPrimedIdsByName as Record<string, string> | undefined) ?? {};
  const primedIdString = skillPrimedIdsByName[skillName];
  if (primedIdString) {
    return await getSkillByName(skillName, [new Types.ObjectId(primedIdString)], {});
  }

  const accessibleIds = (mergedConfigurable?.accessibleSkillIds as Types.ObjectId[]) ?? [];
  if (accessibleIds.length === 0) {
    return null;
  }

  return await getSkillByName(skillName, accessibleIds, { preferModelInvocable: true });
}

async function resolveAuthorSkillForCurrentUser({
  skillName,
  mergedConfigurable,
  sourceConfigurable,
  options,
  req,
}: {
  skillName: string;
  mergedConfigurable: Record<string, unknown>;
  sourceConfigurable?: Record<string, unknown>;
  options: ToolExecuteOptions;
  req?: ServerRequest;
}): Promise<AuthoringSkill | null> {
  if (!req || !options.getAuthorSkillByName) {
    return null;
  }
  if (!isSkillKnownToCurrentRun(skillName, mergedConfigurable)) {
    return null;
  }
  const skill = await options.getAuthorSkillByName({ req, name: skillName });
  if (!skill) {
    return null;
  }
  rememberAuthoredSkill([mergedConfigurable, sourceConfigurable], skill, { prime: false });
  return skill;
}

function isDuplicateSkillNameError(error: unknown): boolean {
  const maybeError = error as { code?: string | number; message?: string } | undefined;
  return (
    maybeError?.code === 11000 ||
    /skill with name .* already exists/i.test(maybeError?.message ?? '')
  );
}

function isSkillAuthoringAvailable(mergedConfigurable: Record<string, unknown>): boolean {
  return mergedConfigurable.skillAuthoringAvailable === true;
}

function getFileAuthoringToolNames(
  mergedConfigurable: Record<string, unknown>,
): Set<string> | undefined {
  const names = mergedConfigurable.fileAuthoringToolNames;
  return names instanceof Set ? (names as Set<string>) : undefined;
}

function isHostFileAuthoringToolCall(
  toolName: string,
  mergedConfigurable: Record<string, unknown>,
): boolean {
  return getFileAuthoringToolNames(mergedConfigurable)?.has(toolName) === true;
}

function isCodeSessionAwareToolCall(
  toolName: string,
  mergedConfigurable: Record<string, unknown>,
): boolean {
  return isCodeSessionToolName(toolName, getFileAuthoringToolNames(mergedConfigurable));
}

function isSkillPrimedForAuthoring(
  skillName: string,
  mergedConfigurable: Record<string, unknown>,
): boolean {
  const skillPrimedIdsByName =
    (mergedConfigurable.skillPrimedIdsByName as Record<string, string> | undefined) ?? {};
  return typeof skillPrimedIdsByName[skillName] === 'string';
}

function isSkillKnownToCurrentRun(
  skillName: string,
  mergedConfigurable: Record<string, unknown>,
): boolean {
  if (isSkillPrimedForAuthoring(skillName, mergedConfigurable)) {
    return true;
  }
  const activeSkillNames = mergedConfigurable.activeSkillNames;
  return activeSkillNames instanceof Set && activeSkillNames.has(skillName);
}

function hiddenSkillAuthoringDenied(
  tc: ToolCallRequest,
  skill: AuthoringSkill | null,
  skillName: string,
  mergedConfigurable: Record<string, unknown>,
): ToolExecuteResult | null {
  if (
    skill?.disableModelInvocation !== true ||
    isSkillPrimedForAuthoring(skillName, mergedConfigurable)
  ) {
    return null;
  }
  return errorResult(tc, `Skill "${skillName}" cannot be authored by the model`);
}

function mergeAccessibleSkillIds(
  base: Record<string, unknown> | undefined,
  loaded: Record<string, unknown> | undefined,
): Types.ObjectId[] | undefined {
  const values = [
    ...(Array.isArray(loaded?.accessibleSkillIds)
      ? (loaded.accessibleSkillIds as Types.ObjectId[])
      : []),
    ...(Array.isArray(base?.accessibleSkillIds)
      ? (base.accessibleSkillIds as Types.ObjectId[])
      : []),
  ];
  if (values.length === 0) {
    return undefined;
  }
  const seen = new Set<string>();
  const merged: Types.ObjectId[] = [];
  for (const value of values) {
    const key = value.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(value);
  }
  return merged;
}

function mergeSkillPrimedIdsByName(
  base: Record<string, unknown> | undefined,
  loaded: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  const loadedPrimed = loaded?.skillPrimedIdsByName as Record<string, string> | undefined;
  const basePrimed = base?.skillPrimedIdsByName as Record<string, string> | undefined;
  const merged = { ...(loadedPrimed ?? {}), ...(basePrimed ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeActiveSkillNames(
  base: Record<string, unknown> | undefined,
  loaded: Record<string, unknown> | undefined,
): Set<string> | undefined {
  const names = new Set<string>();
  const loadedNames = loaded?.activeSkillNames;
  if (loadedNames instanceof Set) {
    for (const name of loadedNames) {
      names.add(name);
    }
  }
  const baseNames = base?.activeSkillNames;
  if (baseNames instanceof Set) {
    for (const name of baseNames) {
      names.add(name);
    }
  }
  return names.size > 0 ? names : undefined;
}

/**
 * True for MCP tools on an ephemeral request-scoped connection (runtime body
 * placeholders), tagged in `createToolInstance`. Their connection is torn down
 * at request end, so they must run in the foreground rather than be backgrounded.
 */
function toolRequiresEphemeralConnection(tool: StructuredToolInterface | undefined): boolean {
  return (
    (tool as (StructuredToolInterface & { mcpRequiresEphemeralConnection?: boolean }) | undefined)
      ?.mcpRequiresEphemeralConnection === true
  );
}

const EMPTY_BACKGROUND_TOOL_SET: ReadonlySet<string> = new Set();

/**
 * Authenticated user id for background-task scoping. The in-repo routes merge
 * `req` into the tool-execute configurable, but external hosts of the exported
 * OpenAI-compatible service inject their own `loadTools` and may not — fall
 * back to the run configurable's user identity so tasks are never registered
 * under an empty user id (which would collapse isolation to conversationId).
 */
function resolveBackgroundUserId(configurable: Record<string, unknown> | undefined): string {
  const req = configurable?.req as ServerRequest | undefined;
  if (req?.user?.id) {
    return req.user.id;
  }
  const userId = configurable?.user_id;
  if (typeof userId === 'string' && userId !== '') {
    return userId;
  }
  const user = configurable?.user;
  if (typeof user === 'string') {
    return user;
  }
  const idFromUser = (user as { id?: string } | undefined)?.id;
  return typeof idFromUser === 'string' ? idFromUser : '';
}

/**
 * True when the tool's own schema declares `run_in_background` (zod shape or
 * raw JSON schema), i.e. the parameter belongs to the tool rather than being
 * host-injected — such a tool must receive the argument untouched.
 */
function toolDeclaresRunInBackgroundParam(tool: StructuredToolInterface): boolean {
  const schema = (
    tool as StructuredToolInterface & {
      schema?: { shape?: Record<string, unknown>; properties?: Record<string, unknown> };
    }
  ).schema;
  if (schema == null) {
    return false;
  }
  return (
    schema.shape?.[RUN_IN_BACKGROUND_ARG] != null ||
    schema.properties?.[RUN_IN_BACKGROUND_ARG] != null
  );
}

function mergeToolConfigurables(
  base: Record<string, unknown> | undefined,
  loaded: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const merged = { ...base, ...loaded };
  const accessibleSkillIds = mergeAccessibleSkillIds(base, loaded);
  if (accessibleSkillIds) {
    merged.accessibleSkillIds = accessibleSkillIds;
  }
  const skillPrimedIdsByName = mergeSkillPrimedIdsByName(base, loaded);
  if (skillPrimedIdsByName) {
    merged.skillPrimedIdsByName = skillPrimedIdsByName;
  }
  const activeSkillNames = mergeActiveSkillNames(base, loaded);
  if (activeSkillNames) {
    merged.activeSkillNames = activeSkillNames;
  }
  return merged;
}

function rememberAuthoredSkill(
  configurables: Array<Record<string, unknown> | undefined>,
  skill: { _id: Types.ObjectId; name: string },
  options: { prime?: boolean } = {},
): void {
  const prime = options.prime !== false;
  const idString = skill._id.toString();
  for (const configurable of configurables) {
    if (!configurable) {
      continue;
    }

    const accessibleIds = Array.isArray(configurable.accessibleSkillIds)
      ? (configurable.accessibleSkillIds as Types.ObjectId[])
      : [];
    if (!Array.isArray(configurable.accessibleSkillIds)) {
      configurable.accessibleSkillIds = accessibleIds;
    }
    if (!accessibleIds.some((id) => id.toString() === idString)) {
      accessibleIds.push(skill._id);
    }

    if (prime) {
      const primedIds =
        (configurable.skillPrimedIdsByName as Record<string, string> | undefined) ?? {};
      primedIds[skill.name] = idString;
      configurable.skillPrimedIdsByName = primedIds;
    }

    const activeSkillNames = configurable.activeSkillNames as Set<string> | undefined;
    if (activeSkillNames) {
      activeSkillNames.add(skill.name);
    } else {
      configurable.activeSkillNames = new Set([skill.name]);
    }
  }
}

async function ensureCanEditSkill(
  tc: ToolCallRequest,
  options: ToolExecuteOptions,
  req: ServerRequest | undefined,
  skillId: Types.ObjectId | string,
): Promise<ToolExecuteResult | null> {
  if (!req) {
    return errorResult(tc, 'Skill file editing is not configured for this request.');
  }
  if (!options.canEditSkill) {
    return errorResult(tc, 'Skill file editing is not configured.');
  }
  const allowed = await options.canEditSkill({ req, skillId });
  return allowed ? null : errorResult(tc, 'Insufficient permissions to edit this skill.');
}

async function ensureCanCreateSkill(
  tc: ToolCallRequest,
  options: ToolExecuteOptions,
  req: ServerRequest | undefined,
): Promise<ToolExecuteResult | null> {
  if (!req) {
    return errorResult(tc, 'Skill creation is not configured for this request.');
  }
  if (!options.canCreateSkill) {
    return errorResult(tc, 'Skill creation is not configured.');
  }
  const allowed = await options.canCreateSkill({ req });
  return allowed ? null : errorResult(tc, 'Insufficient permissions to create skills.');
}

async function loadSkillFileTextForAuthoring({
  skill,
  relativePath,
  options,
  req,
}: {
  skill: AuthoringSkill;
  relativePath: string;
  options: ToolExecuteOptions;
  req?: ServerRequest;
}): Promise<LoadedSkillText> {
  if (relativePath === SKILL_MD) {
    return {
      status: 'loaded',
      content: skill.body ?? '',
      bytes: Buffer.byteLength(skill.body ?? '', 'utf8'),
    };
  }

  const { getSkillFileByPath, getStrategyFunctions, updateSkillFileContent } = options;
  if (!getSkillFileByPath) {
    return { status: 'error', message: 'Skill file reading is not configured.' };
  }

  const file = await getSkillFileByPath(skill._id, relativePath);
  if (!file) {
    return { status: 'missing' };
  }
  if (file.isBinary === true) {
    return { status: 'error', message: `File "${relativePath}" is binary and cannot be edited.` };
  }
  if (file.content != null && file.content !== '') {
    return {
      status: 'loaded',
      content: file.content,
      bytes: Buffer.byteLength(file.content, 'utf8'),
    };
  }
  if (file.bytes > MAX_CACHE_BYTES) {
    return {
      status: 'error',
      message: `File "${relativePath}" is too large to edit directly (${file.bytes} bytes, limit: ${MAX_CACHE_BYTES}).`,
    };
  }
  if (!getStrategyFunctions || !req) {
    return { status: 'error', message: 'Storage access is not configured.' };
  }

  const strategy = getStrategyFunctions(file.source);
  if (!strategy.getDownloadStream) {
    return { status: 'error', message: 'Download is not supported for this storage backend.' };
  }

  const stream = await strategy.getDownloadStream(req, file.filepath);
  const chunks: Uint8Array[] = [];
  let streamedBytes = 0;
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    streamedBytes += chunk.byteLength;
    if (streamedBytes > MAX_CACHE_BYTES) {
      if (
        'destroy' in stream &&
        typeof (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy === 'function'
      ) {
        (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
      }
      return {
        status: 'error',
        message: `File "${relativePath}" exceeded edit limit (${MAX_CACHE_BYTES} bytes).`,
      };
    }
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const checkLen = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) {
      if (updateSkillFileContent) {
        updateSkillFileContent(skill._id, relativePath, { isBinary: true }).catch(
          (err: unknown) => {
            logAxiosError({
              message: '[loadSkillFileTextForAuthoring] cache write failed',
              error: err,
            });
          },
        );
      }
      return { status: 'error', message: `File "${relativePath}" is binary and cannot be edited.` };
    }
  }

  const text = buffer.toString('utf-8');
  if (updateSkillFileContent) {
    updateSkillFileContent(skill._id, relativePath, { content: text, isBinary: false }).catch(
      (err: unknown) => {
        logAxiosError({
          message: '[loadSkillFileTextForAuthoring] cache write failed',
          error: err,
        });
      },
    );
  }
  return { status: 'loaded', content: text, bytes: buffer.length };
}

async function inspectBundledSkillFileForCreate({
  skill,
  relativePath,
  options,
  req,
}: {
  skill: AuthoringSkill;
  relativePath: string;
  options: ToolExecuteOptions;
  req?: ServerRequest;
}): Promise<ExistingSkillFile> {
  const { getSkillFileByPath } = options;
  if (!getSkillFileByPath) {
    return { status: 'error', message: 'Skill file reading is not configured.' };
  }

  const file = await getSkillFileByPath(skill._id, relativePath);
  if (!file) {
    return { status: 'missing' };
  }
  if (file.isBinary === true || file.bytes > MAX_CACHE_BYTES) {
    return { status: 'present' };
  }
  if (file.content != null && file.content !== '') {
    return { status: 'present', oldContent: file.content };
  }
  if (!options.getStrategyFunctions || !req) {
    return { status: 'present' };
  }

  const loaded = await loadSkillFileTextForAuthoring({
    skill,
    relativePath,
    options,
    req,
  });
  if (loaded.status === 'missing') {
    return { status: 'missing' };
  }
  if (loaded.status === 'error') {
    return { status: 'present' };
  }
  return { status: 'present', oldContent: loaded.content };
}

async function ensureBundledSkillVersionCurrent({
  tc,
  options,
  skill,
  displayPath,
}: {
  tc: ToolCallRequest;
  options: ToolExecuteOptions;
  skill: AuthoringSkill;
  displayPath: string;
}): Promise<ToolExecuteResult | null> {
  if (!options.getSkillByName) {
    return null;
  }

  const current = await options.getSkillByName(skill.name, [skill._id], {});
  if (!current) {
    return errorResult(tc, `Skill "${skill.name}" not found or not accessible.`);
  }
  if (current.version !== skill.version) {
    return errorResult(
      tc,
      `Skill "${skill.name}" changed while editing. Re-read ${displayPath} and retry.`,
    );
  }
  return null;
}

async function writeSkillMd({
  tc,
  options,
  req,
  mergedConfigurable,
  sourceConfigurable,
  skill,
  skillName,
  content,
}: {
  tc: ToolCallRequest;
  options: ToolExecuteOptions;
  req?: ServerRequest;
  mergedConfigurable: Record<string, unknown>;
  sourceConfigurable?: Record<string, unknown>;
  skill: AuthoringSkill | null;
  skillName: string;
  content: string;
}): AuthoringResult {
  const normalized = normalizeSkillMdContent(content, skillName);
  if (normalized.status === 'error') {
    return errorResult(tc, normalized.error);
  }
  content = normalized.content;
  const structured = parseStructuredSkillFrontmatter(content);
  if (structured.error) {
    return errorResult(tc, structured.error);
  }

  if (!skill) {
    const createDenied = await ensureCanCreateSkill(tc, options, req);
    if (createDenied) {
      return createDenied;
    }
    if (!req || !options.createSkill || !options.grantSkillOwner) {
      return errorResult(tc, 'Skill creation is not configured.');
    }
    const author = getAuthorInfo(req);
    if (!author) {
      return errorResult(tc, 'Authentication required to create a skill.');
    }
    const parsed = parseSkillMdUpdate(content);
    let result: Awaited<ReturnType<NonNullable<ToolExecuteOptions['createSkill']>>>;
    try {
      result = await options.createSkill({
        name: skillName,
        description: parsed.description,
        body: content,
        ...(parsed.frontmatter !== undefined ? { frontmatter: parsed.frontmatter } : {}),
        author: author.author,
        authorName: author.authorName,
        ...(parsed.alwaysApply !== undefined ? { alwaysApply: parsed.alwaysApply } : {}),
        ...(author.tenantId ? { tenantId: author.tenantId } : {}),
      });
    } catch (error) {
      if (isDuplicateSkillNameError(error)) {
        return errorResult(
          tc,
          `Skill "${skillName}" already exists for this author. It cannot be created again or overwritten blindly. Read or enable the existing skill, then use edit_file for targeted changes, or choose a new skill name.`,
        );
      }
      throw error;
    }
    try {
      await options.grantSkillOwner({ req, skillId: result.skill._id });
    } catch (error) {
      if (options.deleteSkill) {
        await options.deleteSkill(result.skill._id.toString()).catch((rollbackError: unknown) => {
          logger.error('[create_file] Failed to roll back skill after permission error', {
            rollbackError,
          });
        });
      }
      throw error;
    }
    rememberAuthoredSkill([mergedConfigurable, sourceConfigurable], result.skill);
    return successResult(
      tc,
      `Created ${SKILL_FILE_PREFIX}${skillName}/${SKILL_MD} (${content.length} chars).`,
      {
        path: `${SKILL_FILE_PREFIX}${skillName}/${SKILL_MD}`,
        bytes_written: Buffer.byteLength(content, 'utf8'),
        created: true,
      },
    );
  }

  const editDenied = await ensureCanEditSkill(tc, options, req, skill._id);
  if (editDenied) {
    return editDenied;
  }
  if (!options.updateSkill) {
    return errorResult(tc, 'Skill updating is not configured.');
  }
  const parsedUpdate = parseSkillMdUpdate(content);
  const result = await options.updateSkill({
    id: skill._id.toString(),
    expectedVersion: skill.version,
    update: {
      body: content,
      description: parsedUpdate.description,
      ...(parsedUpdate.frontmatter !== undefined ? { frontmatter: parsedUpdate.frontmatter } : {}),
      ...(parsedUpdate.alwaysApply !== undefined ? { alwaysApply: parsedUpdate.alwaysApply } : {}),
    },
  });
  if (result.status === 'conflict') {
    return errorResult(
      tc,
      `Skill "${skillName}" changed while editing. Re-read ${SKILL_FILE_PREFIX}${skillName}/${SKILL_MD} and retry.`,
    );
  }
  if (result.status === 'not_found') {
    return errorResult(tc, `Skill "${skillName}" not found or not accessible.`);
  }

  const diff = createUnifiedDiff(
    `${SKILL_FILE_PREFIX}${skillName}/${SKILL_MD}`,
    skill.body,
    content,
  );
  const summary = `Updated ${SKILL_FILE_PREFIX}${skillName}/${SKILL_MD} (${content.length} chars).`;
  return successResult(tc, diff ? `${summary}\n\n${diff}` : summary, {
    path: `${SKILL_FILE_PREFIX}${skillName}/${SKILL_MD}`,
    bytes_written: Buffer.byteLength(content, 'utf8'),
    created: false,
    ...(diff ? { diff } : {}),
  });
}

async function writeBundledSkillFile({
  tc,
  options,
  req,
  skill,
  relativePath,
  displayPath,
  content,
  oldContent,
  created,
}: {
  tc: ToolCallRequest;
  options: ToolExecuteOptions;
  req?: ServerRequest;
  skill: AuthoringSkill;
  relativePath: string;
  displayPath: string;
  content: string;
  oldContent?: string;
  created: boolean;
}): AuthoringResult {
  const editDenied = await ensureCanEditSkill(tc, options, req, skill._id);
  if (editDenied) {
    return editDenied;
  }
  if (!req || !options.saveSkillFileContent) {
    return errorResult(tc, 'Skill file writing is not configured.');
  }
  const staleDenied = await ensureBundledSkillVersionCurrent({
    tc,
    options,
    skill,
    displayPath,
  });
  if (staleDenied) {
    return staleDenied;
  }

  await options.saveSkillFileContent({
    req,
    skillId: skill._id,
    relativePath,
    content,
    mimeType: guessMimeType(relativePath),
  });
  const diff =
    oldContent !== undefined ? createUnifiedDiff(displayPath, oldContent, content) : undefined;
  const action = created ? 'Created' : 'Updated';
  const summary = `${action} ${displayPath} (${content.length} chars).`;
  return successResult(tc, diff ? `${summary}\n\n${diff}` : summary, {
    path: displayPath,
    bytes_written: Buffer.byteLength(content, 'utf8'),
    created,
    ...(diff ? { diff } : {}),
  });
}

async function handleSandboxCreateFileCall({
  tc,
  options,
  req,
  filePath,
  content,
  overwrite,
  sandboxContext,
}: {
  tc: ToolCallRequest;
  options: ToolExecuteOptions;
  req?: ServerRequest;
  filePath: string;
  content: string;
  overwrite: boolean;
  sandboxContext?: SandboxSessionContext;
}): AuthoringResult {
  const pathError = invalidSandboxAuthoringPath(filePath);
  if (pathError) {
    return errorResult(tc, pathError);
  }

  const current = await loadSandboxTextForAuthoring({
    filePath,
    tc,
    options,
    req,
    sandboxContext,
  });
  if (current.status === 'error') {
    return errorResult(tc, current.message);
  }
  if (current.status === 'loaded' && !overwrite) {
    return errorResult(tc, 'File already exists. Pass overwrite: true to replace.');
  }

  return await writeSandboxTextForAuthoring({
    tc,
    options,
    req,
    filePath,
    content,
    oldContent: current.status === 'loaded' ? current.content : undefined,
    created: current.status === 'missing',
    sandboxContext,
  });
}

async function handleSandboxEditFileCall({
  tc,
  options,
  req,
  filePath,
  edits,
  sandboxContext,
}: {
  tc: ToolCallRequest;
  options: ToolExecuteOptions;
  req?: ServerRequest;
  filePath: string;
  edits: TextEdit[];
  sandboxContext?: SandboxSessionContext;
}): AuthoringResult {
  const pathError = invalidSandboxAuthoringPath(filePath);
  if (pathError) {
    return errorResult(tc, pathError);
  }

  const current = await loadSandboxTextForAuthoring({
    filePath,
    tc,
    options,
    req,
    sandboxContext,
  });
  if (current.status === 'missing') {
    return errorResult(tc, `File not found: "${filePath}"`);
  }
  if (current.status === 'error') {
    return errorResult(tc, current.message);
  }

  let edited: { content: string; strategies: string[] };
  try {
    edited = applyTextEdits(current.content, edits);
  } catch (error) {
    return errorResult(tc, error instanceof Error ? error.message : 'Failed to edit file');
  }
  if (Buffer.byteLength(edited.content, 'utf8') > MAX_AUTHORING_BYTES) {
    return errorResult(tc, `edited content exceeds ${MAX_AUTHORING_BYTES} byte limit`);
  }

  const result = await writeSandboxTextForAuthoring({
    tc,
    options,
    req,
    filePath,
    content: edited.content,
    oldContent: current.content,
    created: false,
    sandboxContext,
  });
  if (result.status === 'success') {
    result.artifact = {
      ...(typeof result.artifact === 'object' && result.artifact ? result.artifact : {}),
      edits: edits.length,
      strategies: edited.strategies,
    };
    result.content = `${String(result.content)}\n\nStrategies: ${edited.strategies.join(', ')}`;
  }
  return result;
}

async function handleCreateFileCall(
  tc: ToolCallRequest,
  mergedConfigurable: Record<string, unknown>,
  options: ToolExecuteOptions,
  req?: ServerRequest,
  sourceConfigurable?: Record<string, unknown>,
  sandboxContext?: SandboxSessionContext,
): AuthoringResult {
  const args = tc.args as { path?: unknown; content?: unknown; overwrite?: unknown };
  if (typeof args.path !== 'string' || args.path.length === 0) {
    return errorResult(tc, 'path is required');
  }
  if (typeof args.content !== 'string') {
    return errorResult(
      tc,
      'content is required. If the file is large, your response may have been cut off at the ' +
        'output token limit before content finished. Keep the main file lean and move bulky ' +
        'sections (templates, schemas, long docs) into separate files written in their own calls.',
    );
  }
  if (Buffer.byteLength(args.content, 'utf8') > MAX_AUTHORING_BYTES) {
    return errorResult(tc, `content exceeds ${MAX_AUTHORING_BYTES} byte limit`);
  }

  const overwrite = args.overwrite === true;
  if (!args.path.startsWith(SKILL_FILE_PREFIX)) {
    if (mergedConfigurable?.codeEnvAvailable !== true) {
      return errorResult(
        tc,
        `Path "${args.path}" is not a skill file, and this agent does not have code execution enabled.`,
      );
    }
    return await handleSandboxCreateFileCall({
      tc,
      options,
      req,
      filePath: args.path,
      content: args.content,
      overwrite,
      sandboxContext,
    });
  }

  const parsed = parseSkillAuthoringPath(args.path);
  if (typeof parsed === 'string') {
    return errorResult(tc, parsed);
  }
  if (!isSkillAuthoringAvailable(mergedConfigurable)) {
    return errorResult(tc, 'Skill file authoring is not available for this agent.');
  }

  let skill = await resolveSkillForAuthoring(parsed.skillName, mergedConfigurable, options);
  if (!skill) {
    skill = await resolveAuthorSkillForCurrentUser({
      skillName: parsed.skillName,
      mergedConfigurable,
      sourceConfigurable,
      options,
      req,
    });
  }
  const hiddenDenied = hiddenSkillAuthoringDenied(tc, skill, parsed.skillName, mergedConfigurable);
  if (hiddenDenied) {
    return hiddenDenied;
  }
  if (parsed.relativePath === SKILL_MD) {
    if (skill && !overwrite) {
      return errorResult(
        tc,
        `Skill "${parsed.skillName}" already exists. Use edit_file for targeted changes, or pass overwrite: true only if replacing the entire ${parsed.displayPath} is intended.`,
      );
    }
    return await writeSkillMd({
      tc,
      options,
      req,
      mergedConfigurable,
      sourceConfigurable,
      skill,
      skillName: parsed.skillName,
      content: args.content,
    });
  }

  if (!skill) {
    return errorResult(tc, `Skill "${parsed.skillName}" not found or not accessible.`);
  }

  const current = await inspectBundledSkillFileForCreate({
    skill,
    relativePath: parsed.relativePath,
    options,
    req,
  });
  if (current.status === 'error') {
    return errorResult(tc, current.message);
  }
  if (current.status === 'present' && !overwrite) {
    return errorResult(tc, 'File already exists. Pass overwrite: true to replace.');
  }
  return await writeBundledSkillFile({
    tc,
    options,
    req,
    skill,
    relativePath: parsed.relativePath,
    displayPath: parsed.displayPath,
    content: args.content,
    oldContent: current.status === 'present' ? current.oldContent : undefined,
    created: current.status === 'missing',
  });
}

async function handleEditFileCall(
  tc: ToolCallRequest,
  mergedConfigurable: Record<string, unknown>,
  options: ToolExecuteOptions,
  req?: ServerRequest,
  sandboxContext?: SandboxSessionContext,
): AuthoringResult {
  const args = tc.args as {
    path?: unknown;
    old_text?: unknown;
    new_text?: unknown;
    edits?: unknown;
  };
  if (typeof args.path !== 'string' || args.path.length === 0) {
    return errorResult(tc, 'path is required');
  }

  const edits = normalizeEditArgs(args);
  if (typeof edits === 'string') {
    return errorResult(tc, edits);
  }

  if (!args.path.startsWith(SKILL_FILE_PREFIX)) {
    if (mergedConfigurable?.codeEnvAvailable !== true) {
      return errorResult(
        tc,
        `Path "${args.path}" is not a skill file, and this agent does not have code execution enabled.`,
      );
    }
    return await handleSandboxEditFileCall({
      tc,
      options,
      req,
      filePath: args.path,
      edits,
      sandboxContext,
    });
  }

  const parsed = parseSkillAuthoringPath(args.path);
  if (typeof parsed === 'string') {
    return errorResult(tc, parsed);
  }
  if (!isSkillAuthoringAvailable(mergedConfigurable)) {
    return errorResult(tc, 'Skill file authoring is not available for this agent.');
  }

  let skill = await resolveSkillForAuthoring(parsed.skillName, mergedConfigurable, options);
  if (!skill) {
    skill = await resolveAuthorSkillForCurrentUser({
      skillName: parsed.skillName,
      mergedConfigurable,
      options,
      req,
    });
  }
  if (!skill) {
    return errorResult(tc, `Skill "${parsed.skillName}" not found or not accessible.`);
  }
  const hiddenDenied = hiddenSkillAuthoringDenied(tc, skill, parsed.skillName, mergedConfigurable);
  if (hiddenDenied) {
    return hiddenDenied;
  }

  const current = await loadSkillFileTextForAuthoring({
    skill,
    relativePath: parsed.relativePath,
    options,
    req,
  });
  if (current.status === 'missing') {
    return errorResult(
      tc,
      `File not found: "${parsed.relativePath}" in skill "${parsed.skillName}"`,
    );
  }
  if (current.status === 'error') {
    return errorResult(tc, current.message);
  }

  let edited: { content: string; strategies: string[] };
  try {
    edited = applyTextEdits(current.content, edits);
  } catch (error) {
    return errorResult(tc, error instanceof Error ? error.message : 'Failed to edit file');
  }
  if (Buffer.byteLength(edited.content, 'utf8') > MAX_AUTHORING_BYTES) {
    return errorResult(tc, `edited content exceeds ${MAX_AUTHORING_BYTES} byte limit`);
  }

  if (parsed.relativePath === SKILL_MD) {
    const result = await writeSkillMd({
      tc,
      options,
      req,
      mergedConfigurable,
      skill,
      skillName: parsed.skillName,
      content: edited.content,
    });
    if (result.status === 'success') {
      result.artifact = {
        ...(typeof result.artifact === 'object' && result.artifact ? result.artifact : {}),
        edits: edits.length,
        strategies: edited.strategies,
      };
      result.content = `${String(result.content)}\n\nStrategies: ${edited.strategies.join(', ')}`;
    }
    return result;
  }

  const result = await writeBundledSkillFile({
    tc,
    options,
    req,
    skill,
    relativePath: parsed.relativePath,
    displayPath: parsed.displayPath,
    content: edited.content,
    oldContent: current.content,
    created: false,
  });
  if (result.status === 'success') {
    result.artifact = {
      ...(typeof result.artifact === 'object' && result.artifact ? result.artifact : {}),
      edits: edits.length,
      strategies: edited.strategies,
    };
    result.content = `${String(result.content)}\n\nStrategies: ${edited.strategies.join(', ')}`;
  }
  return result;
}

async function handleReadFileCall(
  tc: ToolCallRequest,
  mergedConfigurable: Record<string, unknown>,
  options: ToolExecuteOptions,
  req?: ServerRequest,
): Promise<ToolExecuteResult> {
  const { getSkillByName, getSkillFileByPath, getStrategyFunctions, updateSkillFileContent } =
    options;
  const args = tc.args as { path?: string };
  if (!args.path) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'path is required',
    };
  }

  const codeEnvAvailable = mergedConfigurable?.codeEnvAvailable === true;
  let accessibleIds = (mergedConfigurable?.accessibleSkillIds as Types.ObjectId[]) ?? [];

  /**
   * Short-circuit absolute code-env paths: the path can never be a skill
   * reference (skill paths are relative `{skillName}/...`), and consulting
   * `getSkillByName` would just burn a DB round-trip on a guaranteed miss.
   */
  if (args.path.startsWith('/mnt/data/')) {
    if (codeEnvAvailable) {
      return handleSandboxFileFallback(tc, args.path, options, req);
    }
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Path "${args.path}" is a code-execution sandbox path, but this agent does not have code execution enabled.`,
    };
  }

  let skillName: string;
  let relativePath: string;
  const explicitSkillNamespace = args.path.startsWith(SKILL_FILE_PREFIX);
  if (explicitSkillNamespace) {
    const parsed = parseSkillAuthoringPath(args.path);
    if (typeof parsed === 'string') {
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: parsed,
      };
    }
    skillName = parsed.skillName;
    relativePath = parsed.relativePath;
  } else {
    const slashIdx = args.path.indexOf('/');
    if (slashIdx < 1) {
      if (codeEnvAvailable) {
        return handleSandboxFileFallback(tc, args.path, options, req);
      }
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: `Invalid file path "${args.path}". Use format: {skillName}/{path}`,
      };
    }

    skillName = args.path.slice(0, slashIdx);
    relativePath = args.path.slice(slashIdx + 1);
    if (!relativePath) {
      /**
       * `read_file("output/")`: a malformed-but-unambiguously-not-a-skill
       * path. Stay consistent with the other malformed-path branches and
       * route to the sandbox when code execution is available, instead of
       * dead-ending with a skill-centric error message.
       */
      if (codeEnvAvailable) {
        return handleSandboxFileFallback(tc, args.path, options, req);
      }
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: 'Missing file path after skill name',
      };
    }
  }

  let skillPrimedIdsByName =
    (mergedConfigurable?.skillPrimedIdsByName as Record<string, string> | undefined) ?? {};
  let primedIdString = skillPrimedIdsByName[skillName];
  let isPrimedThisTurn = primedIdString != null;
  const refreshSkillReadScope = () => {
    accessibleIds = (mergedConfigurable?.accessibleSkillIds as Types.ObjectId[]) ?? [];
    skillPrimedIdsByName =
      (mergedConfigurable?.skillPrimedIdsByName as Record<string, string> | undefined) ?? {};
    primedIdString = skillPrimedIdsByName[skillName];
    isPrimedThisTurn = primedIdString != null;
  };
  let recoveredAuthorSkill: AuthoringSkill | null | undefined;
  const recoverAuthorSkill = async () => {
    if (recoveredAuthorSkill !== undefined) {
      return recoveredAuthorSkill;
    }
    recoveredAuthorSkill = await resolveAuthorSkillForCurrentUser({
      skillName,
      mergedConfigurable,
      options,
      req,
    });
    refreshSkillReadScope();
    return recoveredAuthorSkill;
  };
  /**
   * `accessibleSkillIds` is the resolver's normal output (admin
   * capability AND ACL access AND ephemeral badge / persisted
   * `skills_enabled`). A skill authored earlier in this run is also
   * resolvable through `skillPrimedIdsByName`, even when the run started
   * with an empty accessible set for a first-time creator.
   */
  let skillsEffectivelyEnabled = accessibleIds.length > 0 || isPrimedThisTurn;
  if (
    !skillsEffectivelyEnabled &&
    explicitSkillNamespace &&
    isSkillAuthoringAvailable(mergedConfigurable)
  ) {
    await recoverAuthorSkill();
    skillsEffectivelyEnabled = accessibleIds.length > 0 || isPrimedThisTurn;
  }

  /**
   * Skills not in scope (admin capability off, ephemeral badge off, or
   * persisted `skills_enabled !== true` — all already collapsed into
   * `accessibleSkillIds.length === 0` by `resolveAgentScopedSkillIds`):
   * route to the sandbox fallback when code execution is available, else
   * the lookup truly has nowhere to go.
   */
  if (!skillsEffectivelyEnabled) {
    if (codeEnvAvailable && !explicitSkillNamespace) {
      return handleSandboxFileFallback(tc, args.path, options, req);
    }
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage:
        'Skill files are not available for this agent and code execution is not enabled.',
    };
  }

  /**
   * Read the primed-skills map BEFORE the `activeSkillNames` shortcut.
   *
   * `activeSkillNames` is the catalog-visible set after the
   * `SKILL_CATALOG_LIMIT` cap and the active-state filter run in
   * `injectSkillCatalog`. Manual ($-popover) primes and always-apply
   * primes are intentionally resolved off the wider `accessibleSkillIds`
   * ACL set BEFORE catalog injection — see `resolveManualSkills` for
   * why a skill outside the catalog cap can still be authorized for
   * direct manual invocation. So a primed skill name may legitimately
   * be absent from `activeSkillNames`. Treat any name in
   * `skillPrimedIdsByName` as "known" for the gate below; otherwise the
   * shortcut would misroute `read_file("primed-skill/references/foo.md")`
   * to the sandbox even though the primed skill is in scope.
   */
  /**
   * Skills are in scope, but the first segment isn't a name we know.
   * Use the catalog-derived `activeSkillNames` Set (no DB read) to detect
   * this and fall through to the sandbox so the model doesn't have to
   * eat a wasted `read_file` error before retrying with `bash_tool`.
   * Primed names bypass this shortcut even when absent from the catalog
   * (see comment on `skillPrimedIdsByName` above).
   */
  const activeSkillNames = mergedConfigurable?.activeSkillNames as Set<string> | undefined;
  if (activeSkillNames && !activeSkillNames.has(skillName) && !isPrimedThisTurn) {
    const recovered = await recoverAuthorSkill();
    if (!recovered) {
      if (codeEnvAvailable && !explicitSkillNamespace) {
        return handleSandboxFileFallback(tc, args.path, options, req);
      }
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: `Skill "${skillName}" not found or not accessible`,
      };
    }
  }

  if (!getSkillByName) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'File reading is not configured',
    };
  }
  /* On a primed lookup (manual `$` OR always-apply), pin the accessible
     set to ONLY the primed `_id`. This guarantees the doc whose body got
     primed is the SAME doc whose files we read, even when same-name
     duplicates exist and `activeSkillIds` had to drop some via the
     disable-model dedup. For autonomous probes we keep the full ACL set
     + `preferModelInvocable` so the lookup matches the catalog the model
     saw (and falls back to newest so the disabled-only case still fires
     the explicit rejection gate below). Constructing a real `ObjectId`
     (rather than relying on mongoose's string auto-cast in `$in` queries)
     keeps the value correct for any future consumer that compares with
     `.equals()` or `===`. */
  const lookupAccessibleIds = primedIdString ? [new Types.ObjectId(primedIdString)] : accessibleIds;
  const lookupOptions: { preferUserInvocable?: boolean; preferModelInvocable?: boolean } =
    primedIdString ? {} : { preferModelInvocable: true };
  let skill = await getSkillByName(skillName, lookupAccessibleIds, lookupOptions);
  if (!skill) {
    skill = await recoverAuthorSkill();
    if (!skill) {
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: `Skill "${skillName}" not found or not accessible`,
      };
    }
  }

  /**
   * `disable-model-invocation: true` blocks AUTONOMOUS read_file probes:
   * a model that learned a hidden skill's name (stale catalog, hallucination)
   * shouldn't be able to read its SKILL.md body or bundled files. But when
   * the skill was primed this turn (manual `$` invocation OR always-apply),
   * the body is already in context — and a primed skill that depends on
   * `references/foo.md` would be non-functional if read_file were blocked.
   * Bypass the gate for primed names so this stays usable end-to-end for
   * both prime sources.
   *
   * Sticky-primed skills (manually or model-invoked in prior turns) are not
   * yet in this exception list — that's a known limitation tracked for
   * a follow-up. Same-turn priming is the load-bearing path.
   */
  if (skill.disableModelInvocation === true && !isPrimedThisTurn) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Skill "${skillName}" cannot be invoked by the model`,
    };
  }

  // SKILL.md special case: read from skill.body directly
  if (relativePath === 'SKILL.md') {
    if (!skill.body) {
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: `SKILL.md is empty for skill "${skillName}"`,
      };
    }
    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File: ${args.path}\n\n${addLineNumbers(skill.body)}`,
    };
  }

  /* Bundled skill files are primed into the sandbox under the `skills/`
   * namespace (see `primeSkillFiles`), so the on-disk path is always
   * `/mnt/data/skills/{skillName}/{relativePath}` regardless of whether the
   * model addressed the file with or without the explicit prefix. Use this
   * canonical path in the bash-fallback hints below so they never echo a
   * prefix-less `args.path` that points nowhere on disk. */
  const sandboxFilePath = `/mnt/data/${SKILL_FILE_PREFIX}${skillName}/${relativePath}`;

  if (!getSkillFileByPath) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'File reading is not configured',
    };
  }

  const file = await getSkillFileByPath(skill._id, relativePath);
  if (!file) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `File not found: "${relativePath}" in skill "${skillName}"`,
    };
  }

  // Known binary — serve images as artifacts, others as metadata
  if (file.isBinary === true) {
    if (IMAGE_MIMES.has(file.mimeType) && file.bytes <= MAX_BINARY_BYTES) {
      // Stream and return as image artifact (handled below in stream path)
    } else {
      return {
        toolCallId: tc.id,
        status: 'success',
        content: `Binary file (${file.mimeType}, ${file.bytes} bytes). Use bash to process: ${sandboxFilePath}`,
      };
    }
  }

  // Cached text content
  if (file.isBinary !== true && file.content != null && file.content !== '') {
    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File: ${args.path} (${file.bytes} bytes)\n\n${addLineNumbers(file.content)}`,
    };
  }

  // Early size check from DB metadata before streaming
  const isImage = IMAGE_MIMES.has(file.mimeType);
  if (!isImage && file.bytes > MAX_READABLE_BYTES) {
    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File "${args.path}" is too large to read directly (${file.bytes} bytes, limit: ${MAX_READABLE_BYTES}). Invoke the skill first, then use bash to read it at ${sandboxFilePath}.`,
    };
  }
  if (isImage && file.bytes > MAX_BINARY_BYTES) {
    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File too large (${file.bytes} bytes, limit: ${MAX_BINARY_BYTES}). Use bash to process: ${sandboxFilePath}`,
    };
  }

  // Stream from storage
  if (!getStrategyFunctions || !req) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'Storage access not available',
    };
  }

  try {
    const strategy = getStrategyFunctions(file.source);
    if (!strategy.getDownloadStream) {
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: 'Download not supported for this storage backend',
      };
    }

    const stream = await strategy.getDownloadStream(req, file.filepath);
    const chunks: Uint8Array[] = [];
    // Use the larger binary limit as streaming cap; cheaper type-specific
    // checks happen after binary detection on the assembled buffer.
    const streamLimit = MAX_BINARY_BYTES;
    let streamedBytes = 0;
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      streamedBytes += chunk.byteLength;
      if (streamedBytes > streamLimit) {
        // Destroy the stream if possible to free resources
        if (
          'destroy' in stream &&
          typeof (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy === 'function'
        ) {
          (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
        }
        return {
          toolCallId: tc.id,
          status: 'success',
          content: `File "${args.path}" exceeded streaming limit (${streamLimit} bytes). Invoke the skill first, then use bash to read it at ${sandboxFilePath}.`,
        };
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Binary detection on first 8KB
    const checkLen = Math.min(buffer.length, 8192);
    let isBinary = file.isBinary === true;
    if (!isBinary) {
      for (let i = 0; i < checkLen; i++) {
        if (buffer[i] === 0) {
          isBinary = true;
          break;
        }
      }
    }

    if (isBinary) {
      // Cache the binary flag (first read only)
      if (file.isBinary == null && updateSkillFileContent) {
        updateSkillFileContent(skill._id, relativePath, { isBinary: true }).catch(
          (err: unknown) => {
            logAxiosError({
              message: '[handleReadFileCall] cache write failed',
              error: err,
            });
          },
        );
      }

      // Return images/PDFs as artifacts
      if (IMAGE_MIMES.has(file.mimeType) && buffer.length <= MAX_BINARY_BYTES) {
        return buildImageArtifactResult(
          tc.id,
          args.path,
          file.mimeType,
          buffer.length,
          buffer.toString('base64'),
        );
      }

      // TODO: PDF artifact support requires a document content block path
      // (image_url runs image processing which fails for PDFs). Falls through
      // to the generic binary handler below.

      return {
        toolCallId: tc.id,
        status: 'success',
        content: `Binary file (${file.mimeType}, ${buffer.length} bytes). Use bash to process: ${sandboxFilePath}`,
      };
    }

    const text = buffer.toString('utf-8');

    // Cache text on first read (skill files are immutable)
    if (file.content == null && updateSkillFileContent && buffer.length <= MAX_CACHE_BYTES) {
      updateSkillFileContent(skill._id, relativePath, { content: text, isBinary: false }).catch(
        (err: unknown) => {
          logAxiosError({
            message: '[handleReadFileCall] cache write failed',
            error: err,
          });
        },
      );
    }

    if (buffer.length > MAX_READABLE_BYTES) {
      return {
        toolCallId: tc.id,
        status: 'success',
        content: `File too large (${buffer.length} bytes, limit: ${MAX_READABLE_BYTES}). Use bash: cat ${sandboxFilePath}`,
      };
    }

    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File: ${args.path} (${buffer.length} bytes)\n\n${addLineNumbers(text)}`,
    };
  } catch (error) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleSkillToolCall(
  tc: ToolCallRequest,
  mergedConfigurable: Record<string, unknown>,
  options: ToolExecuteOptions,
  req?: ServerRequest,
): Promise<ToolExecuteResult> {
  const {
    getSkillByName,
    listSkillFiles,
    getStrategyFunctions,
    batchUploadCodeEnvFiles,
    getSessionInfo,
    checkIfActive,
    updateSkillFileCodeEnvIds,
  } = options;
  const args = tc.args as { skillName?: string; args?: string };
  if (!args.skillName) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'skillName is required',
    };
  }

  if (!getSkillByName) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'Skill execution is not configured',
    };
  }

  const accessibleIds = (mergedConfigurable?.accessibleSkillIds as Types.ObjectId[]) ?? [];
  /* `preferModelInvocable` keeps name-collision resolution aligned with
     the catalog: a newer `disable-model-invocation: true` duplicate
     can't shadow the cataloged invocable doc. Model-only
     (`userInvocable: false`) skills are intentionally still resolvable
     here — they're valid model-invocation targets. Falls back to the
     newest match so the disabled-only case still resolves and the gate
     below fires its explicit error. */
  const skill = await getSkillByName(args.skillName, accessibleIds, {
    preferModelInvocable: true,
  });

  if (!skill) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Skill "${args.skillName}" not found or not accessible`,
    };
  }

  /**
   * `disable-model-invocation: true` skills are excluded from the catalog
   * the model sees, but a model that learned the name elsewhere (stale
   * cache, hallucinated guess) could still try to invoke it. Reject
   * explicitly so the error message tells the model exactly why and it
   * doesn't loop retrying. Manual `$` invocation goes through
   * `resolveManualSkills`, which is unaffected by this flag.
   */
  if (skill.disableModelInvocation === true) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Skill "${args.skillName}" cannot be invoked by the model`,
    };
  }

  let body = skill.body;
  if (args.args) {
    body = body.replace(/\$ARGUMENTS/g, args.args);
  }

  const injectedMessages: InjectedMessage[] = [buildSkillPrimeMessage({ name: skill.name, body })];

  const contentText = `Skill "${args.skillName}" loaded. Follow the instructions below.`;
  let artifact:
    | {
        session_id: string;
        files: Array<{
          id: string;
          /** Resource id (skill `_id`). codeapi requires this distinct
           *  from the storage `id` to scope sessionKey by resource. */
          resource_id: string;
          name: string;
          storage_session_id: string;
          kind?: 'skill' | 'agent' | 'user';
          version?: number;
        }>;
      }
    | undefined;

  // Prime skill files to code env — only when the `execute_code` capability
  // is enabled for this run. The flag is threaded via configurable upstream
  // so this gate cannot be bypassed.
  const codeEnvAvailable = mergedConfigurable?.codeEnvAvailable === true;
  if (
    codeEnvAvailable &&
    skill.fileCount > 0 &&
    req &&
    listSkillFiles &&
    getStrategyFunctions &&
    batchUploadCodeEnvFiles
  ) {
    try {
      const skillFiles = await listSkillFiles(skill._id);
      const primeResult = await primeSkillFiles({
        skill,
        skillFiles,
        req,
        getStrategyFunctions,
        batchUploadCodeEnvFiles,
        getSessionInfo,
        checkIfActive,
        updateSkillFileCodeEnvIds,
      });
      if (primeResult) {
        /* `session_id` at the top of the artifact is the (representative)
         * execution session — ToolNode reads it for CodeSessionContext
         * continuity. Per-file storage lives on each file's
         * `storage_session_id`. Skill files carry `kind: 'skill'` and
         * the skill's version so codeapi's sessionKey scopes the
         * cache per-revision. */
        artifact = {
          session_id: primeResult.storage_session_id,
          files: primeResult.files.map((f) => ({
            id: f.id,
            /* `resource_id` (skill `_id`) is what codeapi feeds into
             * `<tenant>:skill:<id>:v:<version>` — without it the next
             * /exec authorizer sees `resource_id: undefined` and 400s. */
            resource_id: f.resource_id,
            name: f.name,
            storage_session_id: f.storage_session_id,
            kind: 'skill',
            version: skill.version,
          })),
        };
      }
    } catch (error) {
      logger.error(
        `[handleSkillToolCall] Failed to prime files for skill "${args.skillName}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return {
    toolCallId: tc.id,
    content: contentText,
    status: 'success',
    artifact,
    injectedMessages,
  };
}

function getFileAuthoringQueueKey(
  tc: ToolCallRequest,
  mergedConfigurable: Record<string, unknown>,
): string | undefined {
  if (!isHostFileAuthoringToolCall(tc.name, mergedConfigurable)) {
    return undefined;
  }
  const args = tc.args as { path?: unknown };
  if (typeof args.path !== 'string' || args.path.length === 0) {
    return undefined;
  }
  if (!args.path.startsWith(SKILL_FILE_PREFIX)) {
    return `sandbox:${args.path}`;
  }
  const parsed = parseSkillAuthoringPath(args.path);
  if (typeof parsed === 'string') {
    return `skill:${args.path}`;
  }
  return `skill:${parsed.skillName}`;
}

/**
 * Creates the ON_TOOL_EXECUTE handler for event-driven tool execution.
 * This handler receives batched tool calls, loads the required tools,
 * executes them in parallel, and resolves with the results.
 */
export function createToolExecuteHandler(options: ToolExecuteOptions): EventHandler {
  const { loadTools, toolEndCallback } = options;

  return {
    handle: async (_event: string, data: ToolExecuteBatchRequest) => {
      const { toolCalls, agentId, configurable, metadata, resolve, reject } = data;
      /** Optional per-call channel (agents SDK > 3.2.33); cast keeps older
       * installed SDK typings compiling until the release lands. */
      const onResult = (
        data as ToolExecuteBatchRequest & {
          onResult?: (result: ToolExecuteResult) => void;
        }
      ).onResult;
      /** Reports a settled result so the agent graph can emit that call's
       * completion immediately instead of waiting for the whole batch;
       * `resolve` below remains the authoritative batch outcome. */
      const reportResult = (result: ToolExecuteResult): ToolExecuteResult => {
        try {
          onResult?.(result);
        } catch (callbackError) {
          logger.warn('[ON_TOOL_EXECUTE] onResult callback error:', callbackError);
        }
        return result;
      };

      try {
        await runOutsideTracing(async () => {
          try {
            const toolNames = [...new Set(toolCalls.map((tc: ToolCallRequest) => tc.name))];
            const { loadedTools, configurable: toolConfigurable } = await loadTools(
              toolNames,
              agentId,
            );
            const toolMap = new Map(loadedTools.map((t) => [t.name, t]));
            const sourceConfigurable = configurable as Record<string, unknown> | undefined;
            const loadedConfigurable = toolConfigurable as Record<string, unknown> | undefined;
            const mergedConfigurable = mergeToolConfigurables(
              sourceConfigurable,
              loadedConfigurable,
            );
            const authoringQueues = new Map<string, Promise<void>>();
            const sandboxAuthoringContexts = new Map<string, SandboxSessionContext>();

            /**
             * Background tool calls. The set of tools that received the injected
             * `run_in_background` param is threaded per-agent from `initializeAgent`
             * via `configurable.backgroundToolNames` (a reliable channel, unlike
             * `toolRegistry` which only reaches the executor for PTC/tool_search).
             * A non-empty set is the exact condition under which the run registered
             * the poll tool and the model could have been shown the param, so it
             * also gates the `check_background_task` interception and enforces the
             * per-tool opt-in (a tool not in the set never had the param).
             */
            const backgroundToolNames = mergedConfigurable?.backgroundToolNames as
              | string[]
              | undefined;
            const backgroundEnabledForRun = (backgroundToolNames?.length ?? 0) > 0;
            const backgroundToolSet: ReadonlySet<string> = backgroundEnabledForRun
              ? new Set(backgroundToolNames)
              : EMPTY_BACKGROUND_TOOL_SET;
            const backgroundReq = backgroundEnabledForRun
              ? (mergedConfigurable?.req as ServerRequest | undefined)
              : undefined;
            const backgroundUserId = backgroundEnabledForRun
              ? resolveBackgroundUserId(mergedConfigurable)
              : '';
            const backgroundConversationId = backgroundEnabledForRun
              ? (((metadata as Record<string, unknown>)?.thread_id as string | undefined) ??
                (mergedConfigurable?.thread_id as string | undefined) ??
                (backgroundReq?.body as { conversationId?: string } | undefined)?.conversationId ??
                '')
              : '';

            /**
             * Registers the task, returns a synthetic handle immediately, and
             * runs the real tool as a floating promise whose result lands in the
             * registry for `check_background_task` to collect. Idempotent by
             * `toolCallId` so graph re-execution (resume/replay) never double-fires.
             */
            const backgroundRunId = (metadata as Record<string, unknown>)?.run_id as
              | string
              | undefined;
            const dispatchBackgroundToolCall = (tc: ToolCallRequest): ToolExecuteResult => {
              /** A tool that failed to load must error immediately (matching the
               *  foreground path) — a synthetic "started" handle would tell the
               *  model a side effect is in flight that never executed. */
              const tool = toolMap.get(tc.name);
              if (!tool) {
                return {
                  toolCallId: tc.id,
                  status: 'error' as const,
                  content: '',
                  errorMessage: `Tool ${tc.name} not found`,
                };
              }
              const created = backgroundTaskRegistry.create({
                userId: backgroundUserId,
                conversationId: backgroundConversationId,
                toolCallId: tc.id,
                toolName: tc.name,
                /** Scope idempotency to the agent + run + turn so a later turn's
                 *  or a second agent's repeated provider id (e.g. `call_0`)
                 *  starts a fresh task instead of colliding. */
                agentId,
                runId: `${backgroundRunId ?? ''}:${tc.turn ?? ''}`,
              });
              if ('atCapacity' in created) {
                return {
                  toolCallId: tc.id,
                  status: 'success' as const,
                  content: buildBackgroundCapacityContent(tc.name),
                };
              }
              const { task, isNew } = created;
              if (isNew) {
                const strippedArgs = stripRunInBackgroundArg(tc.args);
                void (async () => {
                  try {
                    const result = (await tool.invoke(normalizeToolInvokeArgs(strippedArgs, tool), {
                      toolCall: { id: tc.id, stepId: tc.stepId, turn: tc.turn },
                      configurable: mergedConfigurable,
                      metadata,
                    } as Record<string, unknown>)) as { content?: unknown; artifact?: unknown };
                    /** Hold any artifact (images, files, UI resources,
                     *  citations) on the task instead of routing it through
                     *  this dispatch turn's callback: a slow background call
                     *  resolves after the turn finalized, when its
                     *  artifactPromises are already awaited and the stream is
                     *  closed, so that push would be silently dropped. The poll
                     *  turn delivers it live in `check_background_task`. */
                    backgroundTaskRegistry.complete(
                      backgroundUserId,
                      backgroundConversationId,
                      task.id,
                      { content: result.content, artifact: result.artifact },
                    );
                  } catch (toolError) {
                    const { message } = getSafeToolError(toolError);
                    backgroundTaskRegistry.fail(
                      backgroundUserId,
                      backgroundConversationId,
                      task.id,
                      message,
                    );
                  }
                })();
              }
              return {
                toolCallId: tc.id,
                status: 'success' as const,
                content: buildBackgroundHandleContent(task),
              };
            };

            const results: ToolExecuteResult[] = await Promise.all(
              toolCalls.map(async (tc: ToolCallRequest) => {
                if (backgroundEnabledForRun && tc.name === CHECK_BACKGROUND_TASK_NAME) {
                  const pollContent = runCheckBackgroundTask({
                    userId: backgroundUserId,
                    conversationId: backgroundConversationId,
                    args: tc.args,
                  });
                  /** Deliver a completed task's artifact through THIS live poll
                   *  turn's callback (once): the tool's own turn finalized before
                   *  the artifact resolved, so this is where it can be persisted. */
                  if (toolEndCallback) {
                    const pending = claimBackgroundArtifact({
                      userId: backgroundUserId,
                      conversationId: backgroundConversationId,
                      args: tc.args,
                    });
                    if (pending) {
                      try {
                        await toolEndCallback(
                          {
                            output: {
                              name: pending.toolName,
                              tool_call_id: tc.id,
                              content: pending.content,
                              artifact: pending.artifact,
                            },
                          },
                          (metadata ?? {}) as ToolEndCallbackMetadata,
                        );
                      } catch (callbackError) {
                        /** Only synchronous callback throws land here (e.g. a
                         *  malformed artifact shape); the callback's downstream
                         *  persistence is fire-and-forget, so a storage failure
                         *  is at-most-once — the same semantics as a foreground
                         *  artifact. */
                        restoreBackgroundArtifact({
                          userId: backgroundUserId,
                          conversationId: backgroundConversationId,
                          taskId: pending.taskId,
                          artifact: pending.artifact,
                        });
                        logger.warn(
                          '[background] toolEndCallback error delivering artifact on poll:',
                          callbackError,
                        );
                      }
                    }
                  }
                  return reportResult({
                    toolCallId: tc.id,
                    status: 'success' as const,
                    content: pollContent,
                  });
                }

                if (
                  backgroundToolSet.has(tc.name) &&
                  isBackgroundRequested(tc.args) &&
                  !toolRequiresEphemeralConnection(toolMap.get(tc.name))
                ) {
                  return reportResult(dispatchBackgroundToolCall(tc));
                }

                const execute = async (
                  sandboxContext?: SandboxSessionContext,
                ): Promise<ToolExecuteResult> => {
                  const isFileAuthoringCall = isHostFileAuthoringToolCall(
                    tc.name,
                    mergedConfigurable,
                  );
                  const isSandboxFileAuthoringCall =
                    isFileAuthoringCall &&
                    typeof (tc.args as { path?: unknown }).path === 'string' &&
                    !(tc.args as { path: string }).path.startsWith(SKILL_FILE_PREFIX);
                  if (
                    tc.name === Constants.SKILL_TOOL ||
                    tc.name === Constants.READ_FILE ||
                    isFileAuthoringCall
                  ) {
                    const req = mergedConfigurable?.req as ServerRequest | undefined;
                    let handlerResult: ToolExecuteResult;
                    try {
                      if (tc.name === Constants.SKILL_TOOL) {
                        handlerResult = await handleSkillToolCall(
                          tc,
                          mergedConfigurable,
                          options,
                          req,
                        );
                      } else if (tc.name === Constants.READ_FILE) {
                        handlerResult = await handleReadFileCall(
                          tc,
                          mergedConfigurable,
                          options,
                          req,
                        );
                      } else if (tc.name === CREATE_FILE_TOOL_NAME && isFileAuthoringCall) {
                        handlerResult = await handleCreateFileCall(
                          tc,
                          mergedConfigurable,
                          options,
                          req,
                          sourceConfigurable,
                          sandboxContext,
                        );
                      } else if (tc.name === EDIT_FILE_TOOL_NAME && isFileAuthoringCall) {
                        handlerResult = await handleEditFileCall(
                          tc,
                          mergedConfigurable,
                          options,
                          req,
                          sandboxContext,
                        );
                      } else {
                        handlerResult = errorResult(tc, `Tool ${tc.name} not found`);
                      }
                    } catch (toolError) {
                      const { message, logContext } = getSafeToolError(toolError);
                      logger.error(`[ON_TOOL_EXECUTE] Tool ${tc.name} error`, {
                        ...logContext,
                        toolCallArgsShape: getValueShape(tc.args),
                      });
                      return {
                        toolCallId: tc.id,
                        status: 'error' as const,
                        content: '',
                        errorMessage: message,
                      };
                    }

                    if (
                      isSandboxFileAuthoringCall &&
                      handlerResult.status === 'success' &&
                      sandboxContext
                    ) {
                      mergeSandboxSessionArtifact(sandboxContext, handlerResult.artifact);
                    }

                    if (toolEndCallback && handlerResult.artifact) {
                      await toolEndCallback(
                        {
                          output: {
                            name: tc.name,
                            tool_call_id: tc.id,
                            content: handlerResult.content,
                            artifact: handlerResult.artifact,
                          },
                        },
                        {
                          run_id: (metadata as Record<string, unknown>)?.run_id as
                            | string
                            | undefined,
                          thread_id: (metadata as Record<string, unknown>)?.thread_id as
                            | string
                            | undefined,
                          ...metadata,
                        },
                      );
                    }

                    /* Sandbox-routed create_file/edit_file return before the
                     * generic invoke path's marker below, so refresh the warm
                     * window here. Gated on `isSandboxFileAuthoringCall`:
                     * skill-path writes and skill/read_file calls on this
                     * branch may resolve without touching the Code API, and
                     * under-marking only costs a redundant cold-boot label. */
                    if (
                      isSandboxFileAuthoringCall &&
                      handlerResult.status === 'success' &&
                      tc.runtimeSessionHint != null &&
                      tc.runtimeSessionHint !== ''
                    ) {
                      void markSandboxReady(tc.runtimeSessionHint);
                    }

                    return handlerResult;
                  }

                  const tool = toolMap.get(tc.name);

                  if (!tool) {
                    logger.warn(
                      `[ON_TOOL_EXECUTE] Tool "${tc.name}" not found. Available: ${[...toolMap.keys()].map((k) => `"${k}"`).join(', ')}`,
                    );
                    return {
                      toolCallId: tc.id,
                      status: 'error' as const,
                      content: '',
                      errorMessage: `Tool ${tc.name} not found`,
                    };
                  }

                  try {
                    const toolCallConfig: Record<string, unknown> = {
                      id: tc.id,
                      stepId: tc.stepId,
                      turn: tc.turn,
                    };

                    /* Stateful runtime-session hint: the SDK resolves it onto
                     * the request for execute_code/bash (orthogonal to the
                     * transient exec-session below — a first call has a hint but
                     * no session yet). The remote executors read it off
                     * `config.toolCall._runtime_session_hint`; without this the
                     * event-driven ON_TOOL_EXECUTE path drops it and every
                     * conversation collapses onto the Code API's `default`
                     * session (no per-conversation isolation). */
                    if (tc.runtimeSessionHint != null && tc.runtimeSessionHint !== '') {
                      toolCallConfig._runtime_session_hint = tc.runtimeSessionHint;
                    }

                    if (
                      tc.codeSessionContext &&
                      isCodeSessionAwareToolCall(tc.name, mergedConfigurable)
                    ) {
                      toolCallConfig.session_id = tc.codeSessionContext.session_id;
                      if (tc.codeSessionContext.files && tc.codeSessionContext.files.length > 0) {
                        toolCallConfig._injected_files = tc.codeSessionContext.files;
                        /* Last LC-controlled point before the wire. Mirrors
                         * codeapi's validator context so the two log sides
                         * correlate on a single grep. */
                        const refs = tc.codeSessionContext.files as Array<{
                          id?: unknown;
                          resource_id?: unknown;
                          storage_session_id?: unknown;
                          kind?: unknown;
                          version?: unknown;
                          name?: unknown;
                        }>;
                        const summary = refs.map((f) => ({
                          kind: f.kind,
                          hasResourceId: typeof f.resource_id === 'string' && !!f.resource_id,
                          hasStorageSessionId:
                            typeof f.storage_session_id === 'string' && !!f.storage_session_id,
                          hasVersion: typeof f.version === 'number',
                        }));
                        let missingResourceId = 0;
                        let missingStorageSessionId = 0;
                        let missingVersion = 0;
                        const kindCounts: Record<string, number> = {};
                        for (const s of summary) {
                          if (!s.hasResourceId) missingResourceId++;
                          if (!s.hasStorageSessionId) missingStorageSessionId++;
                          if (!s.hasVersion) missingVersion++;
                          const k = typeof s.kind === 'string' ? s.kind : 'unknown';
                          kindCounts[k] = (kindCounts[k] ?? 0) + 1;
                        }
                        logger.debug(
                          `[code-env:inject] tool=${tc.name} files=${refs.length} ` +
                            `missingResourceId=${missingResourceId} ` +
                            `missingStorageSessionId=${missingStorageSessionId} ` +
                            `missingVersion=${missingVersion} ` +
                            `kinds=${JSON.stringify(kindCounts)}`,
                        );
                        if (missingResourceId > 0) {
                          logger.warn(
                            `[code-env:inject] ${missingResourceId}/${refs.length} files missing resource_id ` +
                              `for tool=${tc.name} — codeapi will reject with 400`,
                            { summary },
                          );
                        }
                      } else {
                        /* Empty `_injected_files` on a code-execution tool
                         * call. Almost always means the seeding chain
                         * (primeCodeFiles → initialSessions →
                         * CodeSessionContext) dropped the file upstream.
                         * `session_id` is still emitted for continuity, but
                         * concrete file refs must arrive through
                         * `_injected_files`; agents no longer falls back to
                         * `/files/<sid>`. Pair with `[primeCodeFiles]`
                         * traces below to locate the layer that lost the ref. */
                        logger.warn(
                          `[code-env:inject] tool=${tc.name} _injected_files=0 — sandbox will see no input files`,
                          {
                            tool: tc.name,
                            session_id: tc.codeSessionContext.session_id,
                            codeSessionContextHasFiles: tc.codeSessionContext.files !== undefined,
                            codeSessionContextFileCount: tc.codeSessionContext.files?.length ?? 0,
                          },
                        );
                      }
                    }

                    if (
                      tc.name === Constants.BASH_PROGRAMMATIC_TOOL_CALLING ||
                      tc.name === Constants.PROGRAMMATIC_TOOL_CALLING
                    ) {
                      const toolRegistry = mergedConfigurable?.toolRegistry as
                        | LCToolRegistry
                        | undefined;
                      const ptcToolMap = mergedConfigurable?.ptcToolMap as
                        | Map<string, StructuredToolInterface>
                        | undefined;
                      if (toolRegistry) {
                        const fileAuthoringToolNames =
                          getFileAuthoringToolNames(mergedConfigurable) ?? new Set<string>();
                        const filteredToolDefs: LCTool[] = Array.from(toolRegistry.values()).filter(
                          (t) =>
                            t.name !== Constants.PROGRAMMATIC_TOOL_CALLING &&
                            t.name !== Constants.BASH_PROGRAMMATIC_TOOL_CALLING &&
                            t.name !== Constants.TOOL_SEARCH &&
                            /* Host-only poll tool: implemented by the ON_TOOL_EXECUTE
                             * shortcut, not callable from PTC-generated code. */
                            t.name !== CHECK_BACKGROUND_TASK_NAME &&
                            !fileAuthoringToolNames.has(t.name),
                        );
                        /* PTC-generated calls don't go through the host background
                         * interceptor, so strip the injected `run_in_background`
                         * param from target schemas (the registry entries were
                         * mutated to include it) — mirrors the self-spawn path. */
                        const toolDefs = stripBackgroundFromToolDefinitions(
                          filteredToolDefs,
                          mergedConfigurable?.backgroundToolNames as string[] | undefined,
                        );
                        toolCallConfig.toolDefs = toolDefs;
                        toolCallConfig.toolMap = ptcToolMap ?? toolMap;
                      }
                    }

                    /** Strip the host-only `run_in_background` flag on foreground
                     *  calls (the model may emit it as `false`, or imitate it from
                     *  another agent's history on a tool this agent never opted
                     *  in), so a strict MCP/action schema doesn't reject an
                     *  undeclared argument. Only a tool whose own schema declares
                     *  the parameter receives it. */
                    const foregroundArgs =
                      backgroundToolSet.has(tc.name) ||
                      (hasRunInBackgroundArg(tc.args) && !toolDeclaresRunInBackgroundParam(tool))
                        ? stripRunInBackgroundArg(tc.args)
                        : tc.args;
                    const result = await tool.invoke(
                      normalizeToolInvokeArgs(foregroundArgs, tool),
                      {
                        toolCall: toolCallConfig,
                        configurable: mergedConfigurable,
                        metadata,
                      } as Record<string, unknown>,
                    );

                    /* Only sandbox-bound calls carry a runtime session hint, so
                     * this refreshes the prewarm module's warm window without
                     * inspecting tool names. */
                    if (tc.runtimeSessionHint != null && tc.runtimeSessionHint !== '') {
                      void markSandboxReady(tc.runtimeSessionHint);
                    }

                    // Code-execution tools emit per-call boilerplate
                    // ("Note: ..." paragraphs and `| <annotation>` per-file
                    // suffixes) that wastes tokens when re-injected into
                    // every subsequent model turn. Strip it here, *after*
                    // the tool resolved but *before* downstream consumers
                    // (model context, SSE forwarding, persistence) see it.
                    // Non-code-execution tools pass through unchanged.
                    const cleanedContent =
                      isCodeSessionAwareToolCall(tc.name, mergedConfigurable) &&
                      typeof result.content === 'string'
                        ? cleanCodeToolOutput(result.content)
                        : result.content;

                    if (toolEndCallback) {
                      await toolEndCallback(
                        {
                          output: {
                            name: tc.name,
                            tool_call_id: tc.id,
                            content: cleanedContent,
                            artifact: result.artifact,
                          },
                        },
                        {
                          run_id: (metadata as Record<string, unknown>)?.run_id as
                            | string
                            | undefined,
                          thread_id: (metadata as Record<string, unknown>)?.thread_id as
                            | string
                            | undefined,
                          ...metadata,
                        },
                      );
                    }

                    return {
                      toolCallId: tc.id,
                      content: cleanedContent,
                      artifact: result.artifact,
                      status: 'success' as const,
                    };
                  } catch (toolError) {
                    const { message, logContext } = getSafeToolError(toolError);
                    logger.error(`[ON_TOOL_EXECUTE] Tool ${tc.name} error`, {
                      ...logContext,
                      toolCallArgsShape: getValueShape(tc.args),
                      toolInputSchemaKind: getToolInputSchemaKind(tool),
                    });
                    return {
                      toolCallId: tc.id,
                      status: 'error' as const,
                      content: '',
                      errorMessage: message,
                    };
                  }
                };

                const queueKey = getFileAuthoringQueueKey(tc, mergedConfigurable);
                if (!queueKey) {
                  return reportResult(await execute());
                }
                let sandboxContext: SandboxSessionContext | undefined;
                if (queueKey.startsWith('sandbox:')) {
                  sandboxContext =
                    sandboxAuthoringContexts.get(queueKey) ??
                    cloneSandboxSessionContext(sandboxSessionContext(tc));
                  sandboxAuthoringContexts.set(queueKey, sandboxContext);
                }
                const previous = authoringQueues.get(queueKey) ?? Promise.resolve();
                const resultPromise = previous.then(
                  () => execute(sandboxContext),
                  () => execute(sandboxContext),
                );
                authoringQueues.set(
                  queueKey,
                  resultPromise.then(
                    () => undefined,
                    () => undefined,
                  ),
                );
                return reportResult(await resultPromise);
              }),
            );

            resolve(results);
          } catch (error) {
            logger.error('[ON_TOOL_EXECUTE] Fatal error:', error);
            reject(error as Error);
          }
        });
      } catch (outerError) {
        logger.error('[ON_TOOL_EXECUTE] Unexpected error:', outerError);
        reject(outerError as Error);
      }
    },
  };
}

/**
 * Creates a handlers object that includes ON_TOOL_EXECUTE.
 * Can be merged with other handler objects.
 */
export function createToolExecuteHandlers(
  options: ToolExecuteOptions,
): Record<string, EventHandler> {
  return {
    [GraphEvents.ON_TOOL_EXECUTE]: createToolExecuteHandler(options),
  };
}
