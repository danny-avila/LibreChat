import { HITL_MESSAGE_FILTER_FIELDS } from 'librechat-data-provider';
import type { UserSubmittedMessageFieldPath } from 'librechat-data-provider';
import type { JsonPointer } from './types';

export const MAX_USER_SUBMITTED_PATHS = 256;
export const MAX_USER_SUBMITTED_PATH_LENGTH = 2048;

const BLOCKED_POINTER_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const HITL_MESSAGE_FILTER_FIELD_SET = new Set<string>(HITL_MESSAGE_FILTER_FIELDS);
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
  readonly userSubmittedMessageFieldPaths?: readonly unknown[];
  readonly content?: readonly unknown[];
  readonly text?: unknown;
};

export interface UserSubmittedMessageFieldPathState {
  readonly entries: UserSubmittedMessageFieldPath[];
  readonly overflowed: boolean;
}

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

/**
 * Resolves exact HITL message-field identities against the stored row. Invalid,
 * stale, or unsafe metadata is ignored; excessive distinct entries retain a
 * fail-closed overflow signal without broadening any individual field label.
 */
export function getUserSubmittedMessageFieldPathState(
  message: UserSubmittedPathCarrier,
  options: UserSubmittedPathOptions = {},
): UserSubmittedMessageFieldPathState {
  if (!Array.isArray(message.userSubmittedMessageFieldPaths)) {
    return { entries: [], overflowed: false };
  }
  const entries: UserSubmittedMessageFieldPath[] = [];
  const seen = new Set<string>();
  for (const value of message.userSubmittedMessageFieldPaths) {
    if (value == null || typeof value !== 'object') {
      continue;
    }
    const { path, field } = value as { readonly path?: unknown; readonly field?: unknown };
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.length > MAX_USER_SUBMITTED_PATH_LENGTH ||
      typeof field !== 'string' ||
      !HITL_MESSAGE_FILTER_FIELD_SET.has(field)
    ) {
      continue;
    }
    const key = `${field}:${path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (seen.size > MAX_USER_SUBMITTED_PATHS) {
      return { entries, overflowed: true };
    }
    const pointer = path as JsonPointer;
    if (!isEffectiveUserSubmittedPath(message, pointer, options.scope ?? 'stored_message')) {
      continue;
    }
    entries.push({
      path,
      field: field as UserSubmittedMessageFieldPath['field'],
    });
  }
  return { entries, overflowed: false };
}
