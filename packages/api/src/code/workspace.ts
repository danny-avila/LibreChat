import type { CodeBridgeFetch } from './bridge';

const WORKSPACE_TOOL_TIMEOUT_MS = 30_000;
const MAX_PATH_LENGTH = 4096;
const MAX_QUERY_LENGTH = 4096;
const MAX_READ_BYTES = 1024 * 1024;
const MAX_READ_LINES = 500;
const MAX_SEARCH_RESULTS = 200;
const MAX_SEARCH_TEXT_LENGTH = 2000;
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

export type WorkspaceToolRequest = WorkspaceReadRequest | WorkspaceSearchRequest;

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

export type WorkspaceToolResult = WorkspaceReadResult | WorkspaceSearchResult;

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
    !value.includes('\\') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/.test(value) &&
    value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function isPositiveInteger(value: unknown, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= maximum;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

async function readBoundedJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
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
    value.workspaceId !== request.workspaceId ||
    typeof value.truncated !== 'boolean'
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
  const maxResults = request.maxResults ?? 50;
  return (
    hasOnlyKeys(value, SEARCH_RESULT_KEYS) &&
    Array.isArray(value.matches) &&
    value.matches.length <= maxResults &&
    value.matches.every(
      (match) =>
        isRecord(match) &&
        hasOnlyKeys(match, SEARCH_MATCH_KEYS) &&
        isSafePath(match.path) &&
        isPositiveInteger(match.line, Number.MAX_SAFE_INTEGER) &&
        isPositiveInteger(match.column, Number.MAX_SAFE_INTEGER) &&
        typeof match.text === 'string' &&
        match.text.length <= MAX_SEARCH_TEXT_LENGTH,
    )
  );
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
    const timeoutSignal = AbortSignal.timeout(WORKSPACE_TOOL_TIMEOUT_MS);
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
