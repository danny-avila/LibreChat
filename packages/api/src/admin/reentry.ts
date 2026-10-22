import { getAtPath, isPlainRecord, applyConfigTombstones } from '@librechat/data-schemas';
import type { ConfigOverrideState } from '@librechat/data-schemas';
import type { TCustomConfig } from 'librechat-data-provider';
import type { CredentialBindingConfig } from '~/mcp/registry/binding';
import {
  diffApiKeyBinding,
  preserveOmittedOAuthBindingFields,
  getChangedOAuthSecretBindingFields,
} from '~/mcp/registry/binding';
import { MCPApiKeyReentryRequiredError, MCPOAuthSecretReentryRequiredError } from '~/mcp/errors';
import { isSameStoredSecret, isMCPCredentialReference } from './secrets';

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
