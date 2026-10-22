import {
  getAtPath,
  isPlainRecord,
  resolveAzureGroups,
  applyConfigTombstones,
} from '@librechat/data-schemas';
import type { ConfigOverrideState } from '@librechat/data-schemas';
import type { TCustomConfig } from 'librechat-data-provider';
import type { CredentialBindingConfig } from '~/mcp/registry/binding';
import type { SecretReentryIssue } from './binding';
import {
  diffApiKeyBinding,
  preserveOmittedOAuthBindingFields,
  getChangedOAuthSecretBindingFields,
} from '~/mcp/registry/binding';
import { MCPApiKeyReentryRequiredError, MCPOAuthSecretReentryRequiredError } from '~/mcp/errors';
import { isSameStoredSecret, isCredentialReference, isMCPCredentialReference } from './secrets';
import { diffAzureGroupBinding } from '~/app/rebinding';
import { SECRET_REENTRY_REQUIRED } from './binding';

type JsonRecord = Record<string, unknown>;

/** A write that keeps a stored MCP credential while changing where it is sent. */
export interface SecretReentry {
  code: MCPApiKeyReentryRequiredError['code'] | MCPOAuthSecretReentryRequiredError['code'];
  message: string;
  /** The server whose credential must be entered again. */
  server: string;
  /** The binding fields the write changed. */
  fields: string[];
}

interface StoredDocument {
  overrides?: unknown;
  tombstones?: unknown[];
}

/** Whether a stored value is a credential a read hides: set, and not a `${VAR}`/`{{VAR}}` reference. */
function isHiddenSecret(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed !== '' && !isMCPCredentialReference(trimmed);
}

/**
 * The override sections that hold MCP servers: `mcpServers` and its AppConfig name `mcpConfig`,
 * which the merge also applies. A document's later section replaces the earlier one whole, so a
 * server's credential and destination are only ever combined within one section.
 */
export const MCP_SERVER_SECTIONS = ['mcpServers', 'mcpConfig'] as const;
type MCPServerSection = (typeof MCP_SERVER_SECTIONS)[number];

function getServers(overrides: unknown, section: MCPServerSection): JsonRecord {
  const servers = isPlainRecord(overrides) ? overrides[section] : undefined;
  return isPlainRecord(servers) ? servers : {};
}

/** Tombstones as librechat.yaml paths: one under `mcpConfig` removes the same `mcpServers` field. */
function toYamlTombstones(tombstones: unknown[] | undefined): unknown[] | undefined {
  return tombstones?.map((path) =>
    typeof path === 'string' && (path === 'mcpConfig' || path.startsWith('mcpConfig.'))
      ? `mcpServers${path.slice('mcpConfig'.length)}`
      : path,
  );
}

/** Layers `override` over `base` as the config merge does: objects merge, anything else replaces. */
function mergeLayer(base: unknown, override: unknown): unknown {
  if (override === undefined) {
    return base;
  }
  if (!isPlainRecord(base) || !isPlainRecord(override)) {
    return override;
  }
  const merged: JsonRecord = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeLayer(base[key], value);
  }
  return merged;
}

/**
 * A server as it resolves for this document: librechat.yaml under its tombstones, then the
 * override. Only its binding fields are read, each compared for equality.
 */
function getEffectiveServer(
  base: Partial<TCustomConfig>,
  tombstones: unknown[] | undefined,
  name: string,
  override: unknown,
): CredentialBindingConfig {
  const baseServer = getAtPath(applyConfigTombstones(base, toYamlTombstones(tombstones)), [
    'mcpServers',
    name,
  ]);
  const merged = mergeLayer(baseServer, override);
  return isPlainRecord(merged) ? (merged as CredentialBindingConfig) : {};
}

const MCP_SECRETS = [
  { parent: 'apiKey', key: 'key' },
  { parent: 'oauth', key: 'client_secret' },
] as const;

function getChangedBindingFields(
  parent: 'apiKey' | 'oauth',
  stored: CredentialBindingConfig,
  candidate: CredentialBindingConfig,
): string[] {
  if (parent === 'apiKey') {
    return diffApiKeyBinding(stored, candidate);
  }
  return getChangedOAuthSecretBindingFields(stored, {
    ...candidate,
    oauth: preserveOmittedOAuthBindingFields(stored.oauth ?? {}, candidate.oauth ?? {}),
  });
}

function toReentry(parent: 'apiKey' | 'oauth', server: string, fields: string[]): SecretReentry {
  const error =
    parent === 'apiKey'
      ? new MCPApiKeyReentryRequiredError(fields)
      : new MCPOAuthSecretReentryRequiredError(fields);
  return { code: error.code, message: error.message, server, fields };
}

type MCPSecret = (typeof MCP_SECRETS)[number];

/** A server of the stored document that holds a credential a read hides. */
interface StoredCredential {
  section: MCPServerSection;
  name: string;
  server: unknown;
  value: string;
}

function getStoredCredentials(
  stored: StoredDocument | null | undefined,
  { parent, key }: MCPSecret,
): StoredCredential[] {
  return MCP_SERVER_SECTIONS.flatMap((section) =>
    Object.entries(getServers(stored?.overrides, section)).flatMap(([name, server]) => {
      const value = getAtPath(server, [parent, key]);
      return isHiddenSecret(value) ? [{ section, name, server, value }] : [];
    }),
  );
}

/**
 * The stored servers a kept credential came from, the server of the same name first: those that
 * hold the same value, wherever the write moved it (a rename, a duplicate, a chain of either).
 * When none does, the stored server of the same name, so an unexpected value is still judged.
 */
function findOrigins(
  held: readonly StoredCredential[],
  value: string,
  section: MCPServerSection,
  name: string,
): StoredCredential[] {
  const isSameServer = (credential: StoredCredential) =>
    credential.section === section && credential.name === name;
  const matches = held.filter((credential) => isSameStoredSecret(credential.value, value));
  const origins = matches.length > 0 ? matches : held.filter(isSameServer);
  return [...origins.filter(isSameServer), ...origins.filter((origin) => !isSameServer(origin))];
}

/**
 * The admin config tier's version of the user-managed tier's key re-entry rule
 * (`mcp/registry/binding.ts`): a write that keeps a stored MCP credential (`apiKey.key`,
 * `oauth.client_secret`) while changing where the server sends it must enter the credential
 * again.
 *
 * - **Kept is judged by value.** A credential counts as entered again only when the planned
 *   document holds a value the request itself entered (`getEnteredConfigSecrets`). A key one
 *   write supplied and a later write of the same request replaced with the stored one was not,
 *   whatever paths the request wrote.
 * - **Compared with where it was.** A kept credential is compared with every stored server that
 *   held the same value, so a rename, a duplicate or a chain of them is followed, and a name
 *   swap that moves each key with its own server changes nothing. The write is refused unless
 *   one of them sends it where the candidate does.
 * - **As servers resolve.** Servers are compared as they resolve for this document:
 *   librechat.yaml under the document's tombstones, then its override.
 *
 * Only credentials a read hides count: a `${VAR}` or `{{VAR}}` reference is visible, so a client
 * can resend it. Both sections that hold MCP servers (`mcpServers` and its alias `mcpConfig`)
 * are checked. Rebinding across layers (a profile changing a server another layer holds the key
 * for) is the merge's to handle (`app/rebinding.ts`).
 */
export function findSecretReentry(params: {
  stored: StoredDocument | null | undefined;
  candidate: ConfigOverrideState;
  base: Partial<TCustomConfig>;
  /** The secret values the request itself entered, encrypted. */
  entered: ReadonlySet<string>;
}): SecretReentry | null {
  const { stored, candidate, base, entered } = params;
  const held = new Map<MCPSecret, StoredCredential[]>();
  for (const section of MCP_SERVER_SECTIONS) {
    for (const [name, server] of Object.entries(getServers(candidate.overrides, section))) {
      for (const secret of MCP_SECRETS) {
        const value = getAtPath(server, [secret.parent, secret.key]);
        if (!isHiddenSecret(value) || entered.has(value)) {
          continue;
        }
        const credentials = held.get(secret) ?? getStoredCredentials(stored, secret);
        held.set(secret, credentials);
        const origins = findOrigins(credentials, value, section, name);
        if (origins.length === 0) {
          continue;
        }
        const target = getEffectiveServer(base, candidate.tombstones, name, server);
        const changes = origins.map((origin) =>
          getChangedBindingFields(
            secret.parent,
            getEffectiveServer(base, stored?.tombstones, origin.name, origin.server),
            target,
          ),
        );
        if (changes.every((fields) => fields.length > 0)) {
          return toReentry(secret.parent, name, changes[0]);
        }
      }
    }
  }
  return null;
}

/** Where Azure groups sit, in an override document and in the resolved config alike. */
const AZURE_SEGMENTS = ['endpoints', 'azureOpenAI'] as const;

/** Whether an Azure group key is one a read hides: set, and not `${VAR}` or `user_provided`. */
function isHiddenGroupKey(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed !== '' && !isCredentialReference(trimmed);
}

function getAzureSection(overrides: unknown): JsonRecord {
  const azure = getAtPath(overrides, AZURE_SEGMENTS);
  return isPlainRecord(azure) ? azure : {};
}

function getGroupItems(azure: JsonRecord): JsonRecord[] {
  return Array.isArray(azure.groups) ? azure.groups.filter(isPlainRecord) : [];
}

function getGroupMap(azure: JsonRecord): JsonRecord {
  return isPlainRecord(azure.groupMap) ? azure.groupMap : {};
}

/**
 * The Azure groups a document resolves to on its own over librechat.yaml, by name, as the merge
 * resolves one layer: its `groups` replace librechat.yaml's whole when they resolve
 * (`resolveAzureGroups`), else librechat.yaml's resolved groups (`baseGroupMap`) stay under its
 * tombstones; its `groupMap` entries merge over either.
 */
function getEffectiveAzureGroups(
  document: StoredDocument | null | undefined,
  baseGroupMap: unknown,
): Map<string, JsonRecord> {
  const azure = getAzureSection(document?.overrides);
  const resolved = Array.isArray(azure.groups) ? resolveAzureGroups(azure.groups) : undefined;
  const below = resolved?.isValid
    ? resolved.groupMap
    : getAtPath(
        applyConfigTombstones(
          { endpoints: { azureOpenAI: { groupMap: baseGroupMap } } } as Partial<TCustomConfig>,
          document?.tombstones,
        ),
        [...AZURE_SEGMENTS, 'groupMap'],
      );
  const merged = mergeLayer(below, getGroupMap(azure));
  return new Map(
    Object.entries(isPlainRecord(merged) ? merged : {}).flatMap(([name, group]) =>
      isPlainRecord(group) ? [[name, group]] : [],
    ),
  );
}

/** Every hidden group key a document stores, in `groups` and in `groupMap`. */
function getStoredGroupKeys(azure: JsonRecord): string[] {
  return [...getGroupItems(azure), ...Object.values(getGroupMap(azure))].flatMap((group) => {
    const value = isPlainRecord(group) ? group.apiKey : undefined;
    return isHiddenGroupKey(value) ? [value] : [];
  });
}

/**
 * Where a document writes the group a key belongs to, in librechat.yaml keys: its `groupMap`
 * entry when that holds the field (or the key), else its `groups` item of that name.
 */
function locateGroupField(azure: JsonRecord, name: string, field: string): string[] {
  const mapped = getGroupMap(azure)[name];
  if (isPlainRecord(mapped) && field in mapped) {
    return [...AZURE_SEGMENTS, 'groupMap', name, field];
  }
  const index = getGroupItems(azure).findIndex((group) => group.group === name);
  if (index >= 0) {
    return [...AZURE_SEGMENTS, 'groups', String(index), field];
  }
  return [...AZURE_SEGMENTS, 'groupMap', name, field];
}

/**
 * The Azure form of the re-entry rule web search and MCP keys follow: a write that keeps a
 * stored group key (in `groups` or `groupMap`) while changing where the group sends it must enter
 * the key again. Groups are compared as the document resolves them on its own over
 * librechat.yaml ({@link getEffectiveAzureGroups}), and each `groups` item also as written, so
 * groups that do not resolve yet cannot carry a key to a new destination for a later write to
 * put to use; destinations are compared by `diffAzureGroupBinding`. A
 * key counts as entered again only when the planned document holds a value the request entered;
 * a kept one is compared with every stored group that held the same value, so the write is
 * refused unless one of them sent it where the candidate does. Only keys the stored document
 * holds are judged: librechat.yaml's own are the merge's to bind (`app/rebinding.ts`).
 */
export function getAzureGroupReentryIssues(params: {
  stored: StoredDocument | null | undefined;
  candidate: ConfigOverrideState;
  /** librechat.yaml's resolved Azure groups (`endpoints.azureOpenAI.groupMap` of the base config). */
  baseGroupMap: unknown;
  /** The secret values the request itself entered, encrypted. */
  entered: ReadonlySet<string>;
}): SecretReentryIssue[] {
  const { stored, candidate, baseGroupMap, entered } = params;
  const storedAzure = getAzureSection(stored?.overrides);
  const held = getStoredGroupKeys(storedAzure);
  if (held.length === 0) {
    return [];
  }
  const candidateAzure = getAzureSection(candidate.overrides);
  /** As the document resolves, and each `groups` item as written, which may not resolve yet. */
  const candidates: Array<[string, JsonRecord]> = [
    ...getEffectiveAzureGroups(candidate, baseGroupMap),
    ...getGroupItems(candidateAzure).flatMap(
      (item): Array<[string, JsonRecord]> =>
        typeof item.group === 'string' ? [[item.group, item]] : [],
    ),
  ];
  let origins: JsonRecord[] | undefined;
  const issues = new Map<string, SecretReentryIssue>();
  for (const [name, group] of candidates) {
    const value = group.apiKey;
    if (
      !isHiddenGroupKey(value) ||
      entered.has(value) ||
      !held.some((stored) => isSameStoredSecret(stored, value))
    ) {
      continue;
    }
    /** Every stored definition of a group: as it resolved, and each complete `groups` item. */
    origins ??= [
      ...getEffectiveAzureGroups(stored, baseGroupMap).values(),
      ...getGroupItems(storedAzure),
    ];
    const changes = origins
      .filter((origin) => isSameStoredSecret(origin.apiKey, value))
      .map((origin) => diffAzureGroupBinding(origin, group));
    if (changes.length === 0 || changes.some((fields) => fields.length === 0)) {
      continue;
    }
    const segments = locateGroupField(candidateAzure, name, changes[0][0]);
    const path = segments.join('.');
    issues.set(path, {
      path,
      segments,
      code: SECRET_REENTRY_REQUIRED,
      secretPath: locateGroupField(candidateAzure, name, 'apiKey').join('.'),
    });
  }
  return [...issues.values()];
}
