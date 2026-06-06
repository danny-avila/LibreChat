import { klona } from 'klona';
import winston from 'winston';
import type { TraverseContext } from '../utils/object-traverse';
import { SYSTEM_TENANT_ID } from './tenantContext';
import traverse from '../utils/object-traverse';

const SPLAT_SYMBOL = Symbol.for('splat');
const MESSAGE_SYMBOL = Symbol.for('message');
const CONSOLE_JSON_STRING_LENGTH: number =
  parseInt(process.env.CONSOLE_JSON_STRING_LENGTH || '', 10) || 255;
const DEBUG_MESSAGE_LENGTH: number = parseInt(process.env.DEBUG_MESSAGE_LENGTH || '', 10) || 150;
const LOG_CONTEXT_KEYS = ['tenantId', 'userId', 'requestId'] as const;
const REDACTED_VALUE = '[REDACTED]';
const REDACTION_TRUNCATED_KEY = '__redaction_truncated__';
const MAX_REDACTION_DEPTH = 8;
const MAX_REDACTION_ENTRIES = 50;
const DEFAULT_REDACTION_STRING_LENGTH = 8192;
const MAX_REDACTION_STRING_LENGTH = Math.max(
  CONSOLE_JSON_STRING_LENGTH,
  DEFAULT_REDACTION_STRING_LENGTH,
);
const MAX_REDACTION_BUFFER_BYTES = MAX_REDACTION_STRING_LENGTH;

const sensitiveKeys: RegExp[] = [
  /\b(sk-)[a-zA-Z0-9_-]+/g, // OpenAI API key pattern
  /\b(Bearer )[^\s"']+/g, // Header: Bearer token pattern
  /\b(api-key:? )[^\s"']+/gi, // Header: API key pattern
  /\b(api_key=)[^\s"'&]+/gi, // URL query param: API key pattern
  /\b(key=)[^\s"'&]+/g, // URL query param: sensitive key pattern
];

const sensitiveMetadataKey =
  /^(authorization|proxy-authorization|x-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|password)$/i;
const errorStringProperties = new Set(['name', 'message', 'stack']);

/**
 * Redacts sensitive information from a console message and trims it to a specified length if provided.
 * @param str - The console message to be redacted.
 * @param trimLength - The optional length at which to trim the redacted message.
 * @returns The redacted and optionally trimmed console message.
 */
function redactMessage(str: string, trimLength?: number): string {
  if (!str) {
    return '';
  }

  const redacted = sensitiveKeys.reduce(
    (currentMessage, pattern) => currentMessage.replace(pattern, '$1[REDACTED]'),
    str,
  );

  if (trimLength !== undefined && redacted.length > trimLength) {
    return `${redacted.substring(0, trimLength)}...`;
  }

  return redacted;
}

function redactLogString(str: string): string {
  if (str.length <= MAX_REDACTION_STRING_LENGTH) {
    return redactMessage(str);
  }

  const redacted = redactMessage(str.substring(0, MAX_REDACTION_STRING_LENGTH));
  return `${redacted}... [truncated ${str.length - MAX_REDACTION_STRING_LENGTH} chars]`;
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSensitiveMetadataKey(key: string): boolean {
  return sensitiveMetadataKey.test(key);
}

function redactRecordValue(
  key: string,
  value: unknown,
  seen: WeakMap<object, unknown>,
  depth: number,
): unknown {
  return isSensitiveMetadataKey(key) ? REDACTED_VALUE : redactLogValue(value, seen, depth);
}

function defineRedactedErrorProperty(
  error: Error & Record<string, unknown>,
  key: 'name' | 'message' | 'stack',
  value: string | undefined,
): void {
  if (value === undefined) {
    return;
  }

  Object.defineProperty(error, key, {
    value: redactLogString(value),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

function defineRedactedDescriptor(
  target: Error & Record<string, unknown>,
  key: string | symbol,
  descriptor: PropertyDescriptor,
  seen: WeakMap<object, unknown>,
  depth: number,
): void {
  if (!('value' in descriptor)) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Object.defineProperty(target, key, {
    ...descriptor,
    value:
      typeof key === 'string'
        ? redactRecordValue(key, descriptor.value, seen, depth)
        : redactLogValue(descriptor.value, seen, depth),
  });
}

function redactErrorValue(error: Error, seen: WeakMap<object, unknown>, depth: number): Error {
  const redacted = Object.create(Object.getPrototypeOf(error)) as Error & Record<string, unknown>;
  seen.set(error, redacted);

  defineRedactedErrorProperty(redacted, 'name', error.name);
  defineRedactedErrorProperty(redacted, 'message', error.message);
  defineRedactedErrorProperty(redacted, 'stack', error.stack);

  Reflect.ownKeys(error).forEach((key) => {
    if (typeof key === 'string' && errorStringProperties.has(key)) {
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (descriptor === undefined) {
      return;
    }
    defineRedactedDescriptor(redacted, key, descriptor, seen, depth + 1);
  });
  return redacted;
}

function isBufferValue(value: object): value is Buffer {
  return typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}

function getJsonValue(value: object): unknown {
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON !== 'function') {
    return undefined;
  }

  try {
    const jsonValue = toJSON.call(value);
    return jsonValue === value ? undefined : jsonValue;
  } catch {
    return undefined;
  }
}

function getCustomStringValue(value: object): string | undefined {
  const toString = (value as { toString?: unknown }).toString;
  if (typeof toString !== 'function' || toString === Object.prototype.toString) {
    return undefined;
  }

  try {
    const stringValue = toString.call(value);
    return typeof stringValue === 'string' ? stringValue : undefined;
  } catch {
    return undefined;
  }
}

function redactMapValue(
  value: Map<unknown, unknown>,
  seen: WeakMap<object, unknown>,
  depth: number,
): Map<unknown, unknown> {
  const redacted = new Map<unknown, unknown>();
  seen.set(value, redacted);
  let count = 0;
  for (const [mapKey, mapValue] of value) {
    if (count >= MAX_REDACTION_ENTRIES) {
      redacted.set(REDACTION_TRUNCATED_KEY, 'Additional map entries omitted');
      break;
    }
    redacted.set(
      mapKey,
      typeof mapKey === 'string'
        ? redactRecordValue(mapKey, mapValue, seen, depth + 1)
        : redactLogValue(mapValue, seen, depth + 1),
    );
    count += 1;
  }
  return redacted;
}

function redactSetValue(
  value: Set<unknown>,
  seen: WeakMap<object, unknown>,
  depth: number,
): Set<unknown> {
  const redacted = new Set<unknown>();
  seen.set(value, redacted);
  let count = 0;
  for (const setValue of value) {
    if (count >= MAX_REDACTION_ENTRIES) {
      redacted.add('Additional set values omitted');
      break;
    }
    redacted.add(redactLogValue(setValue, seen, depth + 1));
    count += 1;
  }
  return redacted;
}

function redactObjectEntries(
  value: object,
  seen: WeakMap<object, unknown>,
  depth: number,
): Record<string, unknown> | undefined {
  const record = value as Record<string, unknown>;
  let redacted: Record<string, unknown> | undefined;
  let count = 0;

  for (const key in record) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    if (redacted === undefined) {
      redacted = {};
      seen.set(value, redacted);
    }
    if (count >= MAX_REDACTION_ENTRIES) {
      redacted[REDACTION_TRUNCATED_KEY] = 'Additional object properties omitted';
      break;
    }
    redacted[key] = redactRecordValue(key, record[key], seen, depth + 1);
    count += 1;
  }

  return redacted;
}

function redactNonPlainValue(
  value: object,
  seen: WeakMap<object, unknown>,
  depth: number,
): unknown {
  if (isBufferValue(value)) {
    return value.length > MAX_REDACTION_BUFFER_BYTES
      ? `[REDACTED Buffer ${value.length} bytes]`
      : redactLogString(value.toString('utf8'));
  }

  if (value instanceof URL || value instanceof URLSearchParams) {
    return redactLogString(value.toString());
  }

  if (value instanceof Map) {
    return redactMapValue(value, seen, depth);
  }

  if (value instanceof Set) {
    return redactSetValue(value, seen, depth);
  }

  const jsonValue = getJsonValue(value);
  if (jsonValue !== undefined) {
    return redactLogValue(jsonValue, seen, depth + 1);
  }

  const redactedEntries = redactObjectEntries(value, seen, depth);
  if (redactedEntries !== undefined) {
    return redactedEntries;
  }

  const stringValue = getCustomStringValue(value);
  return stringValue !== undefined ? redactLogString(stringValue) : value;
}

function redactLogValue(value: unknown, seen = new WeakMap<object, unknown>(), depth = 0): unknown {
  if (typeof value === 'string') {
    return redactLogString(value);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }

  if (depth >= MAX_REDACTION_DEPTH) {
    return REDACTED_VALUE;
  }

  if (Array.isArray(value)) {
    const redacted: unknown[] = [];
    seen.set(value, redacted);
    const length = Math.min(value.length, MAX_REDACTION_ENTRIES);
    for (let index = 0; index < length; index++) {
      redacted.push(redactLogValue(value[index], seen, depth + 1));
    }
    if (value.length > MAX_REDACTION_ENTRIES) {
      redacted.push('Additional array values omitted');
    }
    return redacted;
  }

  if (value instanceof Error) {
    return redactErrorValue(value, seen, depth);
  }

  if (!isPlainRecord(value)) {
    return redactNonPlainValue(value, seen, depth);
  }

  return redactObjectEntries(value, seen, depth) ?? {};
}

/**
 * Redacts sensitive information from log messages at every level.
 * Note: Intentionally mutates the object.
 * @param info - The log information object.
 * @returns The modified log information object.
 */
const redactFormat = winston.format((info: winston.Logform.TransformableInfo) => {
  const infoRecord = info as Record<string | symbol, unknown>;

  if (info.message !== undefined) {
    info.message = redactLogValue(info.message);
  }

  const symbolValue = infoRecord[MESSAGE_SYMBOL];
  if (symbolValue !== undefined) {
    infoRecord[MESSAGE_SYMBOL] = redactLogValue(symbolValue);
  }

  if (infoRecord[SPLAT_SYMBOL] !== undefined) {
    infoRecord[SPLAT_SYMBOL] = redactLogValue(infoRecord[SPLAT_SYMBOL]);
  }
  return info;
});

/**
 * Truncates long strings, especially base64 image data, within log messages.
 *
 * @param value - The value to be inspected and potentially truncated.
 * @param length - The length at which to truncate the value. Default: 100.
 * @returns The truncated or original value.
 */
const truncateLongStrings = (value: unknown, length = 100): unknown => {
  if (typeof value === 'string') {
    return value.length > length ? value.substring(0, length) + '... [truncated]' : value;
  }

  return value;
};

/**
 * An array mapping function that truncates long strings (objects converted to JSON strings).
 * @param item - The item to be condensed.
 * @returns The condensed item.
 */
const condenseArray = (item: unknown): string | unknown => {
  if (typeof item === 'string') {
    return truncateLongStrings(JSON.stringify(item));
  } else if (typeof item === 'object') {
    return truncateLongStrings(JSON.stringify(item));
  }
  return item;
};

function formatRequestContext(metadata: Record<string, unknown>): string {
  const context: Partial<Record<(typeof LOG_CONTEXT_KEYS)[number], string>> = {};
  LOG_CONTEXT_KEYS.forEach((key) => {
    const value = metadata[key];
    if (key === 'tenantId' && value === SYSTEM_TENANT_ID) {
      return;
    }
    if (typeof value === 'string' && value) {
      context[key] = value;
    }
  });
  return Object.keys(context).length > 0 ? JSON.stringify(context) : '';
}

function appendRequestContext(line: string, metadata: Record<string, unknown>): string {
  const context = formatRequestContext(metadata);
  return context ? `${line} ${context}` : line;
}

/**
 * Formats log messages for debugging purposes.
 * - Truncates long strings within log messages.
 * - Condenses arrays by truncating long strings and objects as strings within array items.
 * - Message redaction is applied by redactFormat before this formatter.
 * - Converts log information object to a formatted string.
 *
 * @param options - The options for formatting log messages.
 * @returns The formatted log message.
 */
const debugTraverse = winston.format.printf(
  ({ level, message, timestamp, ...metadata }: Record<string, unknown>) => {
    if (!message) {
      return `${timestamp} ${level}`;
    }

    // Type-safe version of the CJS logic: !message?.trim || typeof message !== 'string'
    if (typeof message !== 'string' || !message.trim) {
      return `${timestamp} ${level}: ${JSON.stringify(message)}`;
    }

    const msgParts: string[] = [
      `${timestamp} ${level}: ${truncateLongStrings(message.trim(), DEBUG_MESSAGE_LENGTH)}`,
    ];

    try {
      if (level !== 'debug') {
        return appendRequestContext(msgParts[0], metadata);
      }

      if (!metadata) {
        return msgParts[0];
      }

      // Type-safe access to SPLAT_SYMBOL using bracket notation
      const metadataRecord = metadata as Record<string | symbol, unknown>;
      const splatArray = metadataRecord[SPLAT_SYMBOL];
      const debugValue = Array.isArray(splatArray) ? splatArray[0] : undefined;

      if (!debugValue) {
        return appendRequestContext(msgParts[0], metadata);
      }

      if (debugValue && Array.isArray(debugValue)) {
        msgParts.push(`\n${JSON.stringify(debugValue.map(condenseArray))}`);
        return appendRequestContext(msgParts.join(''), metadata);
      }

      if (typeof debugValue !== 'object') {
        msgParts.push(` ${debugValue}`);
        return appendRequestContext(msgParts.join(''), metadata);
      }

      msgParts.push('\n{');

      const copy = klona(metadata);
      if (copy.tenantId === SYSTEM_TENANT_ID) {
        delete copy.tenantId;
      }
      try {
        const traversal = traverse(copy);
        traversal.forEach(function (this: TraverseContext, value: unknown) {
          if (typeof this?.key === 'symbol') {
            return;
          }

          let _parentKey = '';
          const parent = this.parent;

          if (typeof parent?.key !== 'symbol' && parent?.key !== undefined) {
            _parentKey = String(parent.key);
          }

          const parentKey = `${parent && parent.notRoot ? _parentKey + '.' : ''}`;
          const tabs = `${parent && parent.notRoot ? '    ' : '  '}`;
          const currentKey = this?.key ?? 'unknown';

          if (this.isLeaf && typeof value === 'string') {
            const truncatedText = truncateLongStrings(value);
            msgParts.push(`\n${tabs}${parentKey}${currentKey}: ${JSON.stringify(truncatedText)},`);
          } else if (this.notLeaf && Array.isArray(value) && value.length > 0) {
            const currentMessage = `\n${tabs}// ${value.length} ${String(currentKey).replace(/s$/, '')}(s)`;
            this.update(currentMessage);
            msgParts.push(currentMessage);
            const stringifiedArray = value.map(condenseArray);
            msgParts.push(`\n${tabs}${parentKey}${currentKey}: [${stringifiedArray}],`);
          } else if (this.isLeaf && typeof value === 'function') {
            msgParts.push(`\n${tabs}${parentKey}${currentKey}: function,`);
          } else if (this.isLeaf) {
            msgParts.push(`\n${tabs}${parentKey}${currentKey}: ${value},`);
          }
        });
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        msgParts.push(`\n[LOGGER TRAVERSAL ERROR] ${errorMessage}`);
      }

      msgParts.push('\n}');
      return msgParts.join('');
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      msgParts.push(`\n[LOGGER PARSING ERROR] ${errorMessage}`);
      return msgParts.join('');
    }
  },
);

/**
 * Truncates long string values in JSON log objects.
 * Prevents outputting extremely long values (e.g., base64, blobs).
 */
const jsonTruncateFormat = winston.format((info: winston.Logform.TransformableInfo) => {
  const truncateLongStrings = (str: string, maxLength: number): string =>
    str.length > maxLength ? str.substring(0, maxLength) + '...' : str;

  const seen = new WeakSet<object>();

  const truncateObject = (obj: unknown): unknown => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    // Handle circular references - now with proper object type
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map((item) => truncateObject(item));
    }

    // We know this is an object at this point
    const objectRecord = obj as Record<string, unknown>;
    const newObj: Record<string, unknown> = {};
    Object.entries(objectRecord).forEach(([key, value]) => {
      if (typeof value === 'string') {
        newObj[key] = truncateLongStrings(value, CONSOLE_JSON_STRING_LENGTH);
      } else {
        newObj[key] = truncateObject(value);
      }
    });
    return newObj;
  };

  return truncateObject(info) as winston.Logform.TransformableInfo;
});

export { redactFormat, redactMessage, debugTraverse, jsonTruncateFormat };
