import type { FileFilterField, FiltersConfig } from 'librechat-data-provider';
import { escapeJsonPointer, isDataUri, isLikelyEncodedPayload } from './adapters/nested';

type UninspectablePolicy = 'allow' | 'block';

type FilePiiConfig = NonNullable<FiltersConfig['files']>['pii'] & {
  readonly uninspectable?: UninspectablePolicy;
};

export interface UninspectableFileBlockResponse {
  readonly error: 'content_filter_uninspectable';
  readonly message: string;
  readonly source: 'file';
  readonly field: FileFilterField;
}

interface PendingOpaqueValue {
  readonly value: unknown;
  readonly path: string;
  readonly depth: number;
}

const MAX_OPAQUE_DEPTH = 24;
const MAX_OPAQUE_NODES = 4096;
const CONTENT_FIELDS = ['content'] as const;
const AUDIO_FIELDS = ['content', 'transcript'] as const;
const DERIVED_FILE_FIELDS = ['content', 'extracted_text', 'transcript'] as const;

function getFilePii(filters: FiltersConfig | undefined): FilePiiConfig | undefined {
  return filters?.files?.pii as FilePiiConfig | undefined;
}

export function isFileFilterFieldEnabled(
  filters: FiltersConfig | undefined,
  field: FileFilterField,
): boolean {
  const pii = getFilePii(filters);
  return pii != null && (pii.fields == null || pii.fields.includes(field));
}

export function getBlockedUninspectableFileField(
  filters: FiltersConfig | undefined,
  fields: readonly FileFilterField[],
): FileFilterField | null {
  const pii = getFilePii(filters);
  if (pii?.uninspectable !== 'block') {
    return null;
  }
  for (const field of fields) {
    if (pii.fields == null || pii.fields.includes(field)) {
      return field;
    }
  }
  return null;
}

export function contentFilterUninspectableResponse(
  field: FileFilterField,
): UninspectableFileBlockResponse {
  return {
    error: 'content_filter_uninspectable',
    message: 'Submitted file content could not be inspected before processing.',
    source: 'file',
    field,
  };
}

export class UninspectableFileError extends Error {
  public readonly code = 'content_filter_uninspectable';
  public readonly statusCode = 400;
  public readonly body: UninspectableFileBlockResponse;

  constructor(field: FileFilterField) {
    const body = contentFilterUninspectableResponse(field);
    super(body.message);
    this.name = 'UninspectableFileError';
    this.body = body;
    Object.setPrototypeOf(this, UninspectableFileError.prototype);
  }
}

function hasSubmittedPayload(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (value == null || typeof value !== 'object') {
    return false;
  }
  let entries: [string, unknown][];
  try {
    entries = Object.entries(value);
  } catch {
    return false;
  }
  return entries.some(
    ([key, entryValue]) =>
      ['data', 'file_data', 'file_id', 'uri', 'url'].includes(key) &&
      typeof entryValue === 'string' &&
      entryValue.length > 0,
  );
}

function getObjectType(entries: readonly [string, unknown][]): string {
  const type = entries.find(([key]) => key === 'type')?.[1];
  return typeof type === 'string' ? type.toLowerCase() : '';
}

function isRemoteUri(value: string): boolean {
  return /^https?:\/\//i.test(value.trimStart());
}

function getDataUriFields(value: string): readonly FileFilterField[] {
  return value.trimStart().slice(5).toLowerCase().startsWith('audio/')
    ? AUDIO_FIELDS
    : CONTENT_FIELDS;
}

function getOpaqueFields(
  key: string,
  value: unknown,
  path: string,
  parentType: string,
): readonly FileFilterField[] | null {
  if (
    (key === 'file_ids' || key === 'vector_store_ids') &&
    Array.isArray(value) &&
    value.some((item) => typeof item === 'string' && item.length > 0)
  ) {
    return DERIVED_FILE_FIELDS;
  }
  if (key === 'file_id' && typeof value === 'string' && value.length > 0) {
    const pathLower = path.toLowerCase();
    if (
      parentType.includes('image') ||
      parentType.includes('video') ||
      pathLower.includes('/image_file/')
    ) {
      return CONTENT_FIELDS;
    }
    if (parentType.includes('audio')) {
      return AUDIO_FIELDS;
    }
    return DERIVED_FILE_FIELDS;
  }
  if (key === 'file_data' && hasSubmittedPayload(value)) {
    return DERIVED_FILE_FIELDS;
  }
  if (key === 'input_audio' && hasSubmittedPayload(value)) {
    return AUDIO_FIELDS;
  }
  if ((key === 'image_url' || key === 'video_url') && hasSubmittedPayload(value)) {
    return CONTENT_FIELDS;
  }
  if (key === 'audio_url' && hasSubmittedPayload(value)) {
    return AUDIO_FIELDS;
  }
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (isDataUri(value)) {
    return getDataUriFields(value);
  }

  const pathLower = path.toLowerCase();
  if (key === 'data') {
    if (parentType.includes('audio') || pathLower.includes('/input_audio/')) {
      return AUDIO_FIELDS;
    }
    if (
      parentType.includes('base64') ||
      parentType.includes('document') ||
      parentType.includes('file')
    ) {
      return DERIVED_FILE_FIELDS;
    }
    if (
      parentType.includes('image') ||
      parentType.includes('video') ||
      pathLower.includes('/image_url/') ||
      pathLower.includes('/video_url/')
    ) {
      return CONTENT_FIELDS;
    }
    if (isLikelyEncodedPayload(value, key, { type: parentType })) {
      return DERIVED_FILE_FIELDS;
    }
  }
  if (
    (key === 'uri' || key === 'filepath') &&
    (isRemoteUri(value) ||
      pathLower.includes('/attachments/') ||
      pathLower.includes('/files/') ||
      pathLower.includes('/image_file/'))
  ) {
    if (pathLower.includes('/image_file/')) {
      return CONTENT_FIELDS;
    }
    return DERIVED_FILE_FIELDS;
  }
  if (key === 'url' && isRemoteUri(value)) {
    if (parentType.includes('audio') || pathLower.includes('/audio_url/')) {
      return AUDIO_FIELDS;
    }
    if (
      parentType.includes('image') ||
      parentType.includes('video') ||
      parentType === 'url' ||
      pathLower.includes('/image_url/') ||
      pathLower.includes('/video_url/')
    ) {
      return parentType === 'url' ? DERIVED_FILE_FIELDS : CONTENT_FIELDS;
    }
  }
  return null;
}

/**
 * Returns the first configured file field whose submitted content is opaque.
 * Detection is skipped unless fail-close is enabled.
 */
export function getBlockedOpaqueFileField(
  filters: FiltersConfig | undefined,
  input: unknown,
): FileFilterField | null {
  if (getFilePii(filters)?.uninspectable !== 'block') {
    return null;
  }

  const pending: PendingOpaqueValue[] = [{ value: input, path: '', depth: 0 }];
  const seen = new WeakSet<object>();
  let visitedNodes = 0;
  let traversalTruncated = false;

  while (pending.length > 0 && visitedNodes < MAX_OPAQUE_NODES) {
    const current = pending.pop();
    if (current == null) {
      continue;
    }
    if (current.depth > MAX_OPAQUE_DEPTH) {
      traversalTruncated = true;
      continue;
    }
    visitedNodes++;

    if (typeof current.value === 'string') {
      if (isDataUri(current.value)) {
        const blockedField = getBlockedUninspectableFileField(
          filters,
          getDataUriFields(current.value),
        );
        if (blockedField != null) {
          return blockedField;
        }
      }
      continue;
    }
    if (current.value == null || typeof current.value !== 'object') {
      continue;
    }
    if (seen.has(current.value)) {
      continue;
    }
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      if (current.depth >= MAX_OPAQUE_DEPTH && current.value.length > 0) {
        traversalTruncated = true;
        continue;
      }
      const availableNodes = Math.max(0, MAX_OPAQUE_NODES - visitedNodes - pending.length);
      const scheduledNodes = Math.min(current.value.length, availableNodes);
      if (scheduledNodes < current.value.length) {
        traversalTruncated = true;
      }
      try {
        for (let index = scheduledNodes - 1; index >= 0; index--) {
          pending.push({
            value: current.value[index],
            path: `${current.path}/${index}`,
            depth: current.depth + 1,
          });
        }
      } catch {
        traversalTruncated = true;
      }
      continue;
    }

    let entries: [string, unknown][];
    try {
      entries = Object.entries(current.value);
    } catch {
      traversalTruncated = true;
      continue;
    }
    if (current.depth >= MAX_OPAQUE_DEPTH && entries.length > 0) {
      traversalTruncated = true;
      continue;
    }
    const parentType = getObjectType(entries);
    const availableNodes = Math.max(0, MAX_OPAQUE_NODES - visitedNodes - pending.length);
    const scheduledNodes = Math.min(entries.length, availableNodes);
    if (scheduledNodes < entries.length) {
      traversalTruncated = true;
    }
    for (let index = scheduledNodes - 1; index >= 0; index--) {
      const [key, value] = entries[index];
      const path = `${current.path}/${escapeJsonPointer(key)}`;
      const fields = getOpaqueFields(key, value, path, parentType);
      if (fields != null) {
        const blockedField = getBlockedUninspectableFileField(filters, fields);
        if (blockedField != null) {
          return blockedField;
        }
      }
      pending.push({ value, path, depth: current.depth + 1 });
    }
  }

  if (pending.length > 0 || traversalTruncated) {
    return getBlockedUninspectableFileField(filters, DERIVED_FILE_FIELDS);
  }
  return null;
}
