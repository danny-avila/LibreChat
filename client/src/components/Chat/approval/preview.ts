import type { Agents } from 'librechat-data-provider';

const MAX_PREVIEW_CHARS = 16 * 1024;
const MAX_PREVIEW_LINES = 200;
const MAX_BATCH_PREVIEW_CHARS = 64 * 1024;

export interface ApprovalPreview {
  kind: 'command' | 'create' | 'edit' | 'generic';
  toolName: string;
  target?: string;
  body: string;
  truncated: boolean;
}

/* eslint-disable no-control-regex -- reviewing hidden controls requires matching the C0 ranges */
const CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;
/* eslint-enable no-control-regex */

function revealControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARACTERS, (character) => {
    const codePoint = character.codePointAt(0)?.toString(16).padStart(4, '0') ?? '????';
    return `\\u${codePoint}`;
  });
}

function boundPreview(
  value: string,
  maxChars = MAX_PREVIEW_CHARS,
): { body: string; truncated: boolean } {
  const lines = value.split('\n');
  const lineBounded = lines.length > MAX_PREVIEW_LINES ? lines.slice(0, MAX_PREVIEW_LINES) : lines;
  const rawBody = lineBounded.join('\n');
  let body = revealControlCharacters(rawBody);
  const truncatedByLines = lineBounded.length < lines.length;
  const truncatedByChars = body.length > maxChars;
  if (truncatedByChars) {
    body = body.slice(0, maxChars);
  }
  return {
    body,
    truncated: truncatedByLines || truncatedByChars,
  };
}

function parseArguments(
  args: Agents.ToolApprovalRequest['arguments'],
): Record<string, unknown> | undefined {
  if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    return args;
  }
  if (typeof args !== 'string') {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(args);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function stringField(args: Record<string, unknown> | undefined, ...keys: string[]): string {
  for (const key of keys) {
    const value = args?.[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function stringifyArguments(args: unknown): string {
  if (typeof args === 'string') {
    return args;
  }
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

/** Build a bounded, inert preview from the exact effective arguments in the interrupt. */
export function buildApprovalPreview(
  request: Agents.ToolApprovalRequest,
  maxChars = MAX_PREVIEW_CHARS,
): ApprovalPreview {
  const parsed = parseArguments(request.arguments);
  let kind: ApprovalPreview['kind'] = 'generic';
  let target: string | undefined;
  let rawBody = stringifyArguments(request.arguments);

  if (request.name === 'bash_tool' && parsed) {
    kind = 'command';
    rawBody = stringField(parsed, 'command');
  } else if (request.name === 'create_file' && parsed) {
    kind = 'create';
    target = stringField(parsed, 'path', 'file_path') || undefined;
    rawBody = stringField(parsed, 'content') || stringifyArguments(request.arguments);
  } else if (request.name === 'edit_file' && parsed) {
    kind = 'edit';
    target = stringField(parsed, 'path', 'file_path') || undefined;
    rawBody = stringifyArguments(parsed.edits ?? parsed);
  }

  const { body, truncated } = boundPreview(rawBody, Math.max(0, maxChars));
  return { kind, toolName: request.name, target, body, truncated };
}

/** Keep a large approval batch from multiplying per-action preview work in the composer. */
export function buildApprovalPreviews(requests: Agents.ToolApprovalRequest[]): ApprovalPreview[] {
  let remainingChars = MAX_BATCH_PREVIEW_CHARS;
  return requests.map((request) => {
    const preview = buildApprovalPreview(request, Math.min(MAX_PREVIEW_CHARS, remainingChars));
    remainingChars = Math.max(0, remainingChars - preview.body.length);
    return preview;
  });
}
