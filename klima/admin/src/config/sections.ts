import type { TCustomConfig } from 'librechat-data-provider';
import type { JsonObject, JsonValue } from '../json';
import type { FieldEntry } from './types';

type ConfigSectionName = keyof TCustomConfig & string;

export interface BlockedSection {
  section: string;
  reason: string;
}

/**
 * Mirrors `BASE_ONLY_CONFIG_SECTIONS` (packages/data-provider/src/config.ts:59). The panel
 * keeps its own copy because importing the value pulls the whole data-provider bundle into
 * this standalone app; the `ConfigSectionName` annotation makes a rename break the typecheck.
 */
const BASE_ONLY_SECTIONS: readonly ConfigSectionName[] = ['filters'];

/** Mirrors `BASE_PRINCIPAL_CONFIG_SECTIONS` (packages/data-provider/src/config.ts:62). */
const BASE_PRINCIPAL_SECTIONS: readonly ConfigSectionName[] = ['langfuse'];

const BASE_ONLY_REASON =
  'is a deployment-level section: it can only be set in librechat.yaml, never per principal. The server drops it silently.';

const BASE_PRINCIPAL_REASON =
  'is tenant-wide and has its own admin surface. The generic config API drops it from a principal override.';

export const topLevelSection = (fieldPath: string): string => fieldPath.split('.')[0];

/** A plain-language reason this section cannot live on a principal override, or null. */
export const describeBlockedSection = (section: string): string | null => {
  if (BASE_ONLY_SECTIONS.includes(section as ConfigSectionName)) {
    return `"${section}" ${BASE_ONLY_REASON}`;
  }
  if (BASE_PRINCIPAL_SECTIONS.includes(section as ConfigSectionName)) {
    return `"${section}" ${BASE_PRINCIPAL_REASON}`;
  }
  return null;
};

export const findBlockedSections = (overrides: JsonObject): BlockedSection[] => {
  const blocked: BlockedSection[] = [];
  for (const key of Object.keys(overrides)) {
    const section = topLevelSection(key);
    const reason = describeBlockedSection(section);
    if (reason) {
      blocked.push({ section, reason });
    }
  }
  return blocked;
};

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  value != null && typeof value === 'object' && !Array.isArray(value);

/**
 * Reads a dot-path out of a stored `overrides` document.
 *
 * `overrides` is a Mixed field, so a key may itself contain a dot; this walks segments and
 * therefore only resolves paths written the nested way, which is how the panel writes them.
 */
export const readPath = (overrides: JsonObject, fieldPath: string): JsonValue | undefined => {
  let cursor: JsonValue | undefined = overrides;
  for (const segment of fieldPath.split('.')) {
    if (!isJsonObject(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
};

/**
 * Field paths that were sent but are absent from the config the server wrote back.
 *
 * The backend strips base-only sections, tenant-wide sections and interface permission
 * fields with nothing but a `logger.warn`, then answers 200 with the surviving document —
 * so a partially dropped patch is indistinguishable from a saved one unless it is diffed.
 */
export const findDroppedPaths = (entries: FieldEntry[], stored: JsonObject): string[] =>
  entries
    .filter((entry) => readPath(stored, entry.fieldPath) === undefined)
    .map((entry) => entry.fieldPath);

/** The same check for a whole-object replace: missing sections, then missing sub-keys. */
export const findDroppedKeys = (sent: JsonObject, stored: JsonObject): string[] => {
  const dropped: string[] = [];
  for (const [section, value] of Object.entries(sent)) {
    const landed = stored[section];
    if (landed === undefined) {
      dropped.push(section);
      continue;
    }
    if (!isJsonObject(value) || !isJsonObject(landed)) {
      continue;
    }
    for (const key of Object.keys(value)) {
      if (landed[key] === undefined) {
        dropped.push(`${section}.${key}`);
      }
    }
  }
  return dropped;
};

export const describeDropped = (dropped: string[]): string =>
  `The server accepted the request but did not store ${dropped.join(', ')}. Fields that map to a role permission are stripped from config overrides — set them under Roles instead. Base-only and tenant-wide sections are stripped the same way.`;

/** Mirrors `BASE_CONFIG_PRINCIPAL_ID` (packages/data-schemas/src/admin/capabilities.ts:217). */
export const BASE_PRINCIPAL_ID = '__base__';
