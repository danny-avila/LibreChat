import type { JsonPointer } from './types';

export const MAX_USER_SUBMITTED_PATHS = 256;
export const MAX_USER_SUBMITTED_PATH_LENGTH = 2048;

const BLOCKED_POINTER_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const STORED_MESSAGE_SUBMITTED_ROOTS = new Set([
  'attachments',
  'content',
  'files',
  'name',
  'original',
  'quotes',
  'sender',
  'summary',
  'text',
  'tool_calls',
  'updated',
]);
const SHARED_MESSAGE_SUBMITTED_ROOTS = new Set([
  ...STORED_MESSAGE_SUBMITTED_ROOTS,
  'alwaysAppliedSkills',
  'finish_reason',
  'iconURL',
  'manualSkills',
]);

export interface UserSubmittedPathState {
  readonly paths: JsonPointer[];
  readonly overflowed: boolean;
}

export interface UserSubmittedPathOptions {
  readonly scope?: 'stored_message' | 'shared_message';
}

type UserSubmittedPathCarrier = object & {
  readonly userSubmittedPaths?: readonly unknown[];
  readonly content?: readonly unknown[];
};

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function getSafeUserSubmittedPathSegments(path: JsonPointer): readonly string[] | undefined {
  const encodedSegments = path.slice(1).split('/');
  if (encodedSegments.some((segment) => /~(?:[^01]|$)/.test(segment))) {
    return undefined;
  }
  const segments = encodedSegments.map(decodeJsonPointerSegment);
  if (segments.length === 0 || segments.some((segment) => BLOCKED_POINTER_SEGMENTS.has(segment))) {
    return undefined;
  }
  return segments;
}

function isEffectiveUserSubmittedPath(
  message: UserSubmittedPathCarrier,
  path: JsonPointer,
  scope: NonNullable<UserSubmittedPathOptions['scope']>,
): boolean {
  const segments = getSafeUserSubmittedPathSegments(path);
  if (segments == null) {
    return false;
  }
  const submittedRoots =
    scope === 'shared_message' ? SHARED_MESSAGE_SUBMITTED_ROOTS : STORED_MESSAGE_SUBMITTED_ROOTS;
  if (!submittedRoots.has(segments[0])) {
    return false;
  }
  let source: unknown = message;
  for (const segment of segments) {
    if (
      source == null ||
      typeof source !== 'object' ||
      !Object.prototype.hasOwnProperty.call(source, segment)
    ) {
      return false;
    }
    source = (source as Record<string, unknown>)[segment];
  }
  return source !== undefined;
}

function getSemanticUserSubmittedPaths(message: UserSubmittedPathCarrier): JsonPointer[] {
  if (!Array.isArray(message.content)) {
    return [];
  }
  const paths: JsonPointer[] = [];
  for (let index = 0; index < message.content.length; index++) {
    const part = message.content[index];
    if (
      part != null &&
      typeof part === 'object' &&
      Object.prototype.hasOwnProperty.call(part, 'type') &&
      (part as Record<string, unknown>).type === 'steer'
    ) {
      paths.push(`/content/${index}` as JsonPointer);
    }
  }
  return paths;
}

/**
 * Resolves durable caller-authorship pointers against the exact stored row.
 * Ineffective or unsafe pointers never suppress strict whole-row attribution;
 * excessive unique bounded candidates still fail closed via `overflowed`.
 */
export function getUserSubmittedPathState(
  message: UserSubmittedPathCarrier,
  options: UserSubmittedPathOptions = {},
): UserSubmittedPathState {
  const candidates = [
    ...(Array.isArray(message.userSubmittedPaths) ? message.userSubmittedPaths : []),
    ...getSemanticUserSubmittedPaths(message),
  ];
  const paths: JsonPointer[] = [];
  const seen = new Set<string>();

  for (const path of candidates) {
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.length > MAX_USER_SUBMITTED_PATH_LENGTH ||
      seen.has(path)
    ) {
      continue;
    }
    seen.add(path);
    if (seen.size > MAX_USER_SUBMITTED_PATHS) {
      return { paths, overflowed: true };
    }
    const pointer = path as JsonPointer;
    if (isEffectiveUserSubmittedPath(message, pointer, options.scope ?? 'stored_message')) {
      paths.push(pointer);
    }
  }
  return { paths, overflowed: false };
}
