import type { AgentToolOptions } from 'librechat-data-provider';

// Security ceilings, not tunable quotas: legacy reads and authoring must share the same bounds.
export const MAX_TOOL_OPTION_KEY_LENGTH = 1024;
export const MAX_TOOL_OPTION_ENTRIES = 1024;
export const MAX_TOOL_OPTION_KEY_BYTES = 64 * 1024;

export function getToolOptionsLimitError(options?: object): string | undefined {
  let count = 0;
  let bytes = 0;
  for (const name in options) {
    if (!Object.prototype.hasOwnProperty.call(options, name)) continue;
    if (name.length > MAX_TOOL_OPTION_KEY_LENGTH) {
      return 'Tool option key exceeds the safety length limit';
    }
    if (++count > MAX_TOOL_OPTION_ENTRIES) {
      return 'Tool options exceed the safety entry limit';
    }
    bytes += Buffer.byteLength(name, 'utf8');
    if (bytes > MAX_TOOL_OPTION_KEY_BYTES) {
      return 'Tool option keys exceed the safety byte limit';
    }
  }
  return undefined;
}

export function assertToolOptionsWithinLimits(options?: object): void {
  const error = getToolOptionsLimitError(options);
  if (error) throw new RangeError(error);
}

const persistedToolOptions = new WeakMap<AgentToolOptions, AgentToolOptions>();

/** Runtime aliases do not count toward persisted authoring limits. */
export function getPersistedToolOptions(options?: AgentToolOptions): AgentToolOptions | undefined {
  return options && (persistedToolOptions.get(options) ?? options);
}

/** Capture the bounded persisted view before the first in-place alias is added. */
export function capturePersistedToolOptions(options: AgentToolOptions): void {
  if (persistedToolOptions.has(options)) return;
  assertToolOptionsWithinLimits(options);
  persistedToolOptions.set(options, { ...options });
}
