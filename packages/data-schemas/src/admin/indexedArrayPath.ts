import { configSchema } from 'librechat-data-provider';

const WRAPPER_TYPES = new Set([
  'ZodOptional',
  'ZodNullable',
  'ZodDefault',
  'ZodCatch',
  'ZodBranded',
  'ZodReadonly',
  'ZodEffects',
  'ZodPipeline',
  'ZodLazy',
]);

interface ZodLike {
  _def?: {
    typeName?: string;
    innerType?: ZodLike;
    schema?: ZodLike;
    getter?: () => ZodLike;
    out?: ZodLike;
    options?: ZodLike[];
    left?: ZodLike;
    right?: ZodLike;
    valueType?: ZodLike;
  };
  shape?: Record<string, ZodLike>;
}

function unwrapSchema(schema: ZodLike | undefined): ZodLike | undefined {
  const seen = new Set<ZodLike>();
  let current = schema;
  while (current?._def?.typeName && WRAPPER_TYPES.has(current._def.typeName)) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);
    const def = current._def;
    let next: ZodLike | undefined;
    if (def.typeName === 'ZodLazy') {
      next = def.getter?.();
    } else if (def.typeName === 'ZodPipeline') {
      next = def.out;
    } else if (def.typeName === 'ZodEffects') {
      next = def.schema;
    } else {
      next = def.innerType;
    }
    if (!next) {
      break;
    }
    current = next;
  }
  return current;
}

function schemaContainerFlags(schema: ZodLike | undefined): {
  canBeArray: boolean;
  canBeRecord: boolean;
} {
  const unwrapped = unwrapSchema(schema);
  if (!unwrapped?._def) {
    return { canBeArray: false, canBeRecord: false };
  }
  const typeName = unwrapped._def.typeName;
  if (typeName === 'ZodArray') {
    return { canBeArray: true, canBeRecord: false };
  }
  if (typeName === 'ZodRecord') {
    return { canBeArray: false, canBeRecord: true };
  }
  if (typeName === 'ZodUnion' || typeName === 'ZodDiscriminatedUnion') {
    let canBeArray = false;
    let canBeRecord = false;
    for (const opt of unwrapped._def.options ?? []) {
      const flags = schemaContainerFlags(opt);
      canBeArray = canBeArray || flags.canBeArray;
      canBeRecord = canBeRecord || flags.canBeRecord;
    }
    return { canBeArray, canBeRecord };
  }
  return { canBeArray: false, canBeRecord: false };
}

function descendNonArraySegment(schema: ZodLike, segment: string): ZodLike | null {
  const unwrapped = unwrapSchema(schema);
  if (!unwrapped?._def) {
    return null;
  }
  const typeName = unwrapped._def.typeName;
  if (unwrapped.shape && typeof unwrapped.shape === 'object') {
    return unwrapped.shape[segment] ?? null;
  }
  if (typeName === 'ZodRecord') {
    return unwrapped._def.valueType ?? null;
  }
  if (typeName === 'ZodUnion' || typeName === 'ZodDiscriminatedUnion') {
    const candidates: ZodLike[] = [];
    for (const opt of unwrapped._def.options ?? []) {
      const resolved = descendNonArraySegment(opt, segment);
      if (resolved) {
        candidates.push(resolved);
      }
    }
    if (candidates.length === 0) {
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0];
    }
    return { _def: { typeName: 'ZodUnion', options: candidates } };
  }
  if (typeName === 'ZodIntersection') {
    const left = unwrapSchema(unwrapped._def.left);
    const right = unwrapSchema(unwrapped._def.right);
    const merged = { ...(left?.shape ?? {}), ...(right?.shape ?? {}) };
    return merged[segment] ?? null;
  }
  return null;
}

/**
 * Returns an error when `fieldPath` addresses a schema array by index
 * (`endpoints.custom.0`) or crosses an array (`endpoints.custom.0.baseURL`).
 * Unknown non-array paths and whole-array writes (`endpoints.custom`) are allowed.
 */
export function indexedArrayPathError(fieldPath: string): string | null {
  const segments = fieldPath.split('.');
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    return null;
  }

  let current: ZodLike = configSchema as unknown as ZodLike;
  for (let i = 0; i < segments.length; i += 1) {
    const flags = schemaContainerFlags(current);
    if (flags.canBeArray) {
      return flags.canBeRecord
        ? `Unsupported array path: ${fieldPath}`
        : `Indexed array paths are not supported: ${fieldPath}`;
    }
    const next = descendNonArraySegment(current, segments[i]);
    if (!next) {
      return null;
    }
    current = next;
  }
  return null;
}

/**
 * Returns whether a dotted path resolves through the live configuration
 * schema. Record keys remain dynamic, while object keys must be declared by
 * the schema. Array descendants are intentionally unsupported by the atomic
 * API and therefore do not count as valid paths here.
 */
export function isConfigFieldPath(fieldPath: string): boolean {
  const segments = fieldPath.split('.');
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    return false;
  }

  let current: ZodLike = configSchema as unknown as ZodLike;
  for (const segment of segments) {
    if (schemaContainerFlags(current).canBeArray) {
      return false;
    }
    const next = descendNonArraySegment(current, segment);
    if (!next) {
      return false;
    }
    current = next;
  }
  return true;
}
