import type { CodeBridgeFetch } from './bridge';

const WORKSPACE_TOOL_TIMEOUT_MS = 30_000;
const MAX_PATH_LENGTH = 4096;
const MAX_QUERY_LENGTH = 4096;
const MAX_READ_BYTES = 1024 * 1024;
const MAX_READ_LINES = 500;
const MAX_SEARCH_RESULTS = 200;
const MAX_SEARCH_TEXT_LENGTH = 2000;
const MAX_LIST_RESULTS = 500;
export const WORKSPACE_WRITE_MAX_BYTES: number = 1024 * 1024;
export const WORKSPACE_EDIT_MAX_COUNT: number = 100;
const MAX_COMMAND_BYTES = 32 * 1024;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_COMMAND_OUTPUT_BYTES = 256 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const MAX_COMMAND_SIGNAL_LENGTH = 32;
const WORKSPACE_COMMAND_TRANSPORT_GRACE_MS = 5_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const READ_RESULT_KEYS = new Set([
  'protocolVersion',
  'operation',
  'workspaceId',
  'path',
  'content',
  'startLine',
  'endLine',
  'truncated',
  'nextStartLine',
]);
const SEARCH_RESULT_KEYS = new Set([
  'protocolVersion',
  'operation',
  'workspaceId',
  'matches',
  'truncated',
]);
const SEARCH_MATCH_KEYS = new Set(['path', 'line', 'column', 'text']);
const LIST_RESULT_KEYS = new Set([
  'protocolVersion',
  'operation',
  'workspaceId',
  'paths',
  'truncated',
  'nextAfterPath',
]);
const COMMAND_RESULT_KEYS = new Set([
  'protocolVersion',
  'operation',
  'workspaceId',
  'exitCode',
  'signal',
  'stdout',
  'stderr',
  'truncated',
  'timedOut',
]);
const WRITE_RESULT_KEYS = new Set([
  'protocolVersion',
  'operation',
  'workspaceId',
  'path',
  'created',
  'bytesWritten',
]);
const EDIT_RESULT_KEYS = new Set([
  'protocolVersion',
  'operation',
  'workspaceId',
  'path',
  'replacements',
  'bytesWritten',
]);
const PREVIEW_EDIT_RESULT_KEYS = new Set([
  'protocolVersion',
  'operation',
  'workspaceId',
  'path',
  'content',
  'baseSha256',
  'replacements',
  'bytesWritten',
]);
const TEXT_EDIT_KEYS = new Set(['oldText', 'newText']);

export interface WorkspaceReadRequest {
  protocolVersion: 1;
  operation: 'read_file';
  workspaceId: string;
  path: string;
  startLine?: number;
  maxLines?: number;
}

export interface WorkspaceSearchRequest {
  protocolVersion: 1;
  operation: 'search_text';
  workspaceId: string;
  query: string;
  path?: string;
  maxResults?: number;
}

export interface WorkspaceListRequest {
  protocolVersion: 1;
  operation: 'list_files';
  workspaceId: string;
  path?: string;
  maxResults?: number;
  afterPath?: string;
}

export interface WorkspaceExecuteCommandRequest {
  protocolVersion: 1;
  operation: 'execute_command';
  workspaceId: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface WorkspaceWriteRequest {
  protocolVersion: 1;
  operation: 'write_file';
  workspaceId: string;
  path: string;
  content: string;
  overwrite?: boolean;
}

export interface WorkspaceTextEdit {
  oldText: string;
  newText: string;
}

export interface WorkspaceEditRequest {
  protocolVersion: 1;
  operation: 'edit_file';
  workspaceId: string;
  path: string;
  edits: WorkspaceTextEdit[];
  expectedBaseSha256?: string;
}

export interface WorkspacePreviewEditRequest {
  protocolVersion: 1;
  operation: 'preview_edit';
  workspaceId: string;
  path: string;
  edits: WorkspaceTextEdit[];
}

export type WorkspaceToolRequest =
  | WorkspaceReadRequest
  | WorkspaceSearchRequest
  | WorkspaceListRequest
  | WorkspaceWriteRequest
  | WorkspacePreviewEditRequest
  | WorkspaceEditRequest
  | WorkspaceExecuteCommandRequest;

export interface WorkspaceReadResult {
  protocolVersion: 1;
  operation: 'read_file';
  workspaceId: string;
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  truncated: boolean;
  nextStartLine?: number;
}

export interface WorkspaceSearchResult {
  protocolVersion: 1;
  operation: 'search_text';
  workspaceId: string;
  matches: Array<{ path: string; line: number; column: number; text: string }>;
  truncated: boolean;
}

export interface WorkspaceListResult {
  protocolVersion: 1;
  operation: 'list_files';
  workspaceId: string;
  paths: string[];
  truncated: boolean;
  nextAfterPath?: string;
}

export interface WorkspaceExecuteCommandResult {
  protocolVersion: 1;
  operation: 'execute_command';
  workspaceId: string;
  exitCode: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
}

export interface WorkspaceWriteResult {
  protocolVersion: 1;
  operation: 'write_file';
  workspaceId: string;
  path: string;
  created: boolean;
  bytesWritten: number;
}

export interface WorkspaceEditResult {
  protocolVersion: 1;
  operation: 'edit_file';
  workspaceId: string;
  path: string;
  replacements: number;
  bytesWritten: number;
}

export interface WorkspacePreviewEditResult {
  protocolVersion: 1;
  operation: 'preview_edit';
  workspaceId: string;
  path: string;
  content: string;
  baseSha256: string;
  replacements: number;
  bytesWritten: number;
}

export type WorkspaceToolResult =
  | WorkspaceReadResult
  | WorkspaceSearchResult
  | WorkspaceListResult
  | WorkspaceWriteResult
  | WorkspacePreviewEditResult
  | WorkspaceEditResult
  | WorkspaceExecuteCommandResult;

export class WorkspaceToolHttpError extends Error {
  constructor(
    public readonly reason: 'rejected' | 'invalid' | 'timeout' | 'failed',
    public readonly upstreamStatus?: number,
  ) {
    super(`Workspace tool request ${reason}`);
    this.name = 'WorkspaceToolHttpError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function isSafePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PATH_LENGTH &&
    !value.includes('\0') &&
    !value.includes('\r') &&
    !value.includes('\n') &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/.test(value) &&
    value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function isPositiveInteger(value: unknown, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= maximum;
}

function isUtf8StringWithinBytes(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    Buffer.from(value).toString('utf8') === value &&
    new TextEncoder().encode(value).byteLength <= maximum
  );
}

function areValidWorkspaceEdits(edits: unknown): edits is WorkspaceTextEdit[] {
  if (!Array.isArray(edits)) return false;
  if (edits.length < 1 || edits.length > WORKSPACE_EDIT_MAX_COUNT) return false;
  let bytes = 0;
  for (const edit of edits) {
    if (
      !isRecord(edit) ||
      !hasOnlyKeys(edit, TEXT_EDIT_KEYS) ||
      !isUtf8StringWithinBytes(edit.oldText, WORKSPACE_WRITE_MAX_BYTES) ||
      edit.oldText.length === 0 ||
      !isUtf8StringWithinBytes(edit.newText, WORKSPACE_WRITE_MAX_BYTES)
    ) {
      return false;
    }
    bytes +=
      new TextEncoder().encode(edit.oldText).byteLength +
      new TextEncoder().encode(edit.newText).byteLength;
    if (bytes > WORKSPACE_WRITE_MAX_BYTES) return false;
  }
  return true;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function normalizeRelativePath(value: string): string {
  return value
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}

function isWithinRequestedPath(candidate: string, requestedPath: string | undefined): boolean {
  const prefix = requestedPath == null ? '' : normalizeRelativePath(requestedPath);
  if (prefix === '') return true;
  const normalizedCandidate = normalizeRelativePath(candidate);
  return normalizedCandidate === prefix || normalizedCandidate.startsWith(`${prefix}/`);
}

function comparePortablePaths(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const sharedLength = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftBytes[index] - rightBytes[index];
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

async function readBoundedJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new WorkspaceToolHttpError('invalid');
  }

  if (!response.body) {
    throw new WorkspaceToolHttpError('invalid');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new WorkspaceToolHttpError('invalid');
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof WorkspaceToolHttpError) throw error;
    if (
      signal?.aborted === true &&
      (error === signal.reason ||
        (isRecord(error) && (error.name === 'AbortError' || error.name === 'TimeoutError')))
    ) {
      throw signal.reason ?? error;
    }
    if (isRecord(error) && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw error;
    }
    throw new WorkspaceToolHttpError('invalid');
  } finally {
    reader.releaseLock();
  }
}

function isValidRequest(request: WorkspaceToolRequest): boolean {
  if (
    request.protocolVersion !== 1 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(request.workspaceId)
  ) {
    return false;
  }
  if (request.operation === 'read_file') {
    return (
      isSafePath(request.path) &&
      (request.startLine == null ||
        isPositiveInteger(request.startLine, Number.MAX_SAFE_INTEGER)) &&
      (request.maxLines == null || isPositiveInteger(request.maxLines, MAX_READ_LINES))
    );
  }
  if (request.operation === 'list_files') {
    return (
      (request.path == null || isSafePath(request.path)) &&
      (request.afterPath == null ||
        (isSafePath(request.afterPath) &&
          isWithinRequestedPath(request.afterPath, request.path))) &&
      (request.maxResults == null || isPositiveInteger(request.maxResults, MAX_LIST_RESULTS))
    );
  }
  if (request.operation === 'execute_command') {
    return (
      isUtf8StringWithinBytes(request.command, MAX_COMMAND_BYTES) &&
      request.command.trim().length > 0 &&
      !request.command.includes('\0') &&
      (request.cwd == null || isSafePath(request.cwd)) &&
      (request.timeoutMs == null || isPositiveInteger(request.timeoutMs, MAX_COMMAND_TIMEOUT_MS)) &&
      (request.maxOutputBytes == null ||
        isPositiveInteger(request.maxOutputBytes, MAX_COMMAND_OUTPUT_BYTES))
    );
  }
  if (request.operation === 'write_file') {
    return (
      isSafePath(request.path) &&
      isUtf8StringWithinBytes(request.content, WORKSPACE_WRITE_MAX_BYTES) &&
      (request.overwrite === undefined || typeof request.overwrite === 'boolean')
    );
  }
  if (request.operation === 'preview_edit') {
    return isSafePath(request.path) && areValidWorkspaceEdits(request.edits);
  }
  if (request.operation === 'edit_file') {
    return (
      isSafePath(request.path) &&
      areValidWorkspaceEdits(request.edits) &&
      (request.expectedBaseSha256 == null || /^[a-f0-9]{64}$/.test(request.expectedBaseSha256))
    );
  }
  if (request.operation !== 'search_text') {
    return false;
  }
  return (
    typeof request.query === 'string' &&
    request.query.length > 0 &&
    request.query.length <= MAX_QUERY_LENGTH &&
    !request.query.includes('\0') &&
    (request.path == null || isSafePath(request.path)) &&
    (request.maxResults == null || isPositiveInteger(request.maxResults, MAX_SEARCH_RESULTS))
  );
}

function isValidResult(
  request: WorkspaceToolRequest,
  value: unknown,
): value is WorkspaceToolResult {
  if (
    !isRecord(value) ||
    value.protocolVersion !== 1 ||
    value.operation !== request.operation ||
    value.workspaceId !== request.workspaceId
  ) {
    return false;
  }
  if (request.operation === 'read_file') {
    const startLine = request.startLine ?? 1;
    const maxLines = request.maxLines ?? 200;
    const content = typeof value.content === 'string' ? value.content : null;
    const reportedLineCount =
      Number.isSafeInteger(value.endLine) && Number(value.endLine) >= startLine - 1
        ? Number(value.endLine) - startLine + 1
        : -1;
    let actualLineCount = -1;
    if (content != null) {
      actualLineCount = content.length === 0 ? reportedLineCount : content.split('\n').length;
    }
    return (
      hasOnlyKeys(value, READ_RESULT_KEYS) &&
      value.path === request.path &&
      isSafePath(value.path) &&
      content != null &&
      typeof value.truncated === 'boolean' &&
      new TextEncoder().encode(content).byteLength <= MAX_READ_BYTES &&
      value.startLine === startLine &&
      Number.isSafeInteger(value.endLine) &&
      Number(value.endLine) >= startLine - 1 &&
      Number(value.endLine) < startLine + maxLines &&
      reportedLineCount >= 0 &&
      reportedLineCount <= maxLines &&
      (content.length !== 0 || reportedLineCount <= 1) &&
      actualLineCount === reportedLineCount &&
      (value.truncated === true
        ? Number.isSafeInteger(value.nextStartLine) &&
          Number(value.nextStartLine) === Number(value.endLine) + 1
        : value.nextStartLine == null)
    );
  }
  if (request.operation === 'list_files') {
    const maxResults = request.maxResults ?? 100;
    if (
      !hasOnlyKeys(value, LIST_RESULT_KEYS) ||
      !Array.isArray(value.paths) ||
      value.paths.length > maxResults
    ) {
      return false;
    }
    let previousPath = request.afterPath;
    for (const path of value.paths) {
      if (
        !isSafePath(path) ||
        !isWithinRequestedPath(path, request.path) ||
        (previousPath != null && comparePortablePaths(path, previousPath) <= 0)
      ) {
        return false;
      }
      previousPath = path;
    }
    return value.truncated === true
      ? value.paths.length > 0 && value.nextAfterPath === value.paths[value.paths.length - 1]
      : value.nextAfterPath == null;
  }
  if (request.operation === 'execute_command') {
    const stdout = typeof value.stdout === 'string' ? value.stdout : null;
    const stderr = typeof value.stderr === 'string' ? value.stderr : null;
    const outputLimit = request.maxOutputBytes ?? DEFAULT_COMMAND_OUTPUT_BYTES;
    return (
      hasOnlyKeys(value, COMMAND_RESULT_KEYS) &&
      typeof value.truncated === 'boolean' &&
      stdout != null &&
      stderr != null &&
      Buffer.from(stdout).toString('utf8') === stdout &&
      Buffer.from(stderr).toString('utf8') === stderr &&
      new TextEncoder().encode(stdout).byteLength + new TextEncoder().encode(stderr).byteLength <=
        outputLimit &&
      (value.exitCode === null ||
        (Number.isSafeInteger(value.exitCode) &&
          Number(value.exitCode) >= 0 &&
          Number(value.exitCode) <= 255)) &&
      (value.signal == null ||
        (typeof value.signal === 'string' &&
          value.signal.length <= MAX_COMMAND_SIGNAL_LENGTH &&
          /^SIG[A-Z0-9]+$/.test(value.signal))) &&
      typeof value.timedOut === 'boolean' &&
      (value.exitCode === null
        ? value.timedOut === true || value.signal != null
        : value.timedOut === false && value.signal == null)
    );
  }
  if (request.operation === 'write_file') {
    return (
      hasOnlyKeys(value, WRITE_RESULT_KEYS) &&
      value.path === request.path &&
      typeof value.created === 'boolean' &&
      (request.overwrite !== false || value.created === true) &&
      Number.isSafeInteger(value.bytesWritten) &&
      Number(value.bytesWritten) === new TextEncoder().encode(request.content).byteLength
    );
  }
  if (request.operation === 'edit_file') {
    return (
      hasOnlyKeys(value, EDIT_RESULT_KEYS) &&
      value.path === request.path &&
      value.replacements === request.edits.length &&
      Number.isSafeInteger(value.bytesWritten) &&
      Number(value.bytesWritten) >= 0 &&
      Number(value.bytesWritten) <= WORKSPACE_WRITE_MAX_BYTES
    );
  }
  if (request.operation === 'preview_edit') {
    const content = typeof value.content === 'string' ? value.content : null;
    return (
      hasOnlyKeys(value, PREVIEW_EDIT_RESULT_KEYS) &&
      value.path === request.path &&
      content != null &&
      Buffer.from(content).toString('utf8') === content &&
      /^[a-f0-9]{64}$/.test(typeof value.baseSha256 === 'string' ? value.baseSha256 : '') &&
      value.replacements === request.edits.length &&
      Number.isSafeInteger(value.bytesWritten) &&
      Number(value.bytesWritten) === new TextEncoder().encode(content).byteLength &&
      Number(value.bytesWritten) <= WORKSPACE_WRITE_MAX_BYTES
    );
  }
  const maxResults = request.maxResults ?? 50;
  return (
    hasOnlyKeys(value, SEARCH_RESULT_KEYS) &&
    typeof value.truncated === 'boolean' &&
    Array.isArray(value.matches) &&
    value.matches.length <= maxResults &&
    value.matches.every(
      (match) =>
        isRecord(match) &&
        hasOnlyKeys(match, SEARCH_MATCH_KEYS) &&
        isSafePath(match.path) &&
        isWithinRequestedPath(match.path, request.path) &&
        isPositiveInteger(match.line, Number.MAX_SAFE_INTEGER) &&
        isPositiveInteger(match.column, Number.MAX_SAFE_INTEGER) &&
        typeof match.text === 'string' &&
        match.text.length <= MAX_SEARCH_TEXT_LENGTH,
    )
  );
}

function getWorkspaceToolTimeoutMs(request: WorkspaceToolRequest): number {
  if (request.operation !== 'execute_command') return WORKSPACE_TOOL_TIMEOUT_MS;
  return (request.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS) + WORKSPACE_COMMAND_TRANSPORT_GRACE_MS;
}

export async function executeWorkspaceTool({
  baseURL,
  authHeaders,
  request,
  signal,
  fetchImpl = fetch,
}: {
  baseURL: string;
  authHeaders: Record<string, string>;
  request: WorkspaceToolRequest;
  signal?: AbortSignal;
  fetchImpl?: CodeBridgeFetch;
}): Promise<WorkspaceToolResult> {
  if (!isValidRequest(request)) {
    throw new WorkspaceToolHttpError('invalid');
  }
  try {
    const timeoutSignal = AbortSignal.timeout(getWorkspaceToolTimeoutMs(request));
    const requestSignal =
      signal != null && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;
    const response = await fetchImpl(
      `${baseURL.trim().replace(/\/+$/, '')}/workspace-tools/execute`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        redirect: 'error',
        signal: requestSignal,
      },
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new WorkspaceToolHttpError('rejected', response.status);
    }
    const result = await readBoundedJson(response, requestSignal);
    if (!isValidResult(request, result)) {
      throw new WorkspaceToolHttpError('invalid');
    }
    return result;
  } catch (error) {
    if (error instanceof WorkspaceToolHttpError) throw error;
    if (
      signal?.aborted === true &&
      (error === signal.reason || (isRecord(error) && error.name === 'AbortError'))
    ) {
      throw error;
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new WorkspaceToolHttpError('timeout');
    }
    throw new WorkspaceToolHttpError('failed');
  }
}
