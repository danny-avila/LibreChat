import { EModelEndpoint } from 'librechat-data-provider';
import { foldConfigMergeKey } from '@librechat/data-schemas';
import type {
  AppConfig,
  ConfigMergeStep,
  ConfigOverrideLayer,
  AdminConfigIgnoredSecret,
} from '@librechat/data-schemas';
import type { CredentialBindingConfig } from '~/mcp/registry/binding';
import { diffApiKeyBinding, getChangedOAuthSecretBindingFields } from '~/mcp/registry/binding';
import { isUserVariableTemplate } from '~/admin/secrets';
import { isUserProvided } from '~/utils/common';

type JsonRecord = Record<string, unknown>;

/**
 * What one override layer's merge left out because it would send a credential somewhere it was not
 * entered for: a secret it dropped, or a destination it set back (for a credential the reader takes
 * from the deployment when the config holds none, which dropping cannot stop).
 */
export interface SecretRebinding {
  layer: ConfigOverrideLayer;
  kind: 'secret' | 'destination';
  /** Where the value is, in YAML keys; an `endpoints.custom` entry is named by its `name`. */
  segments: string[];
  /** The same location as text: `endpoints.custom["Name"].apiKey`, `summarization.parameters.baseURL`. */
  path: string;
}

/**
 * A secret and the settings beside it that decide where it is sent, in one object of the resolved
 * config (whose keys match librechat.yaml for these sections).
 */
interface SecretBinding {
  path: readonly string[];
  secretKey: string;
  bindingKeys: readonly string[];
}

const SECRET_BINDINGS: readonly SecretBinding[] = [
  { path: ['ocr'], secretKey: 'apiKey', bindingKeys: ['baseURL'] },
  { path: ['speech', 'tts', 'openai'], secretKey: 'apiKey', bindingKeys: ['url'] },
  { path: ['speech', 'tts', 'azureOpenAI'], secretKey: 'apiKey', bindingKeys: ['instanceName'] },
  {
    path: ['speech', 'tts', 'elevenlabs'],
    secretKey: 'apiKey',
    bindingKeys: ['url', 'websocketUrl'],
  },
  { path: ['speech', 'tts', 'localai'], secretKey: 'apiKey', bindingKeys: ['url'] },
  { path: ['speech', 'stt', 'openai'], secretKey: 'apiKey', bindingKeys: ['url'] },
  { path: ['speech', 'stt', 'azureOpenAI'], secretKey: 'apiKey', bindingKeys: ['instanceName'] },
];

/**
 * The librechat.yaml sections that hold a bound credential or its destination (`mcpConfig` is the
 * alias of `mcpServers`). Writes anywhere else cannot change where a credential is sent.
 */
export const REBINDING_SECTIONS: readonly string[] = [
  'mcpServers',
  'mcpConfig',
  'endpoints',
  'ocr',
  'speech',
  'webSearch',
  'summarization',
];

/**
 * A key a layer can enter for a destination it chooses, and the client that reads both. A key is
 * bound to that client as much as to the destination: another client reads other destination
 * settings, or authenticates some other way.
 */
interface DestinationSecret {
  /** Where the key is in the destination's object. */
  key: string;
  /** The setting that picks the client which reads the destination and the key. */
  client: (config: AppConfig) => unknown;
  /** Whether that client authenticates with the key, rather than a credential it finds itself. */
  isUsed: (config: AppConfig) => boolean;
}

/**
 * A destination whose credential the reader takes from the deployment when the config holds none,
 * so dropping a secret cannot keep it home; the destination is set back instead.
 */
interface DestinationBinding {
  /** The object in the resolved config that holds the destination (and the secret, if any). */
  path: readonly string[];
  /** Whether a key of that object chooses where requests, and the credential, go. */
  isDestination: (key: string) => boolean;
  /**
   * A key a layer can enter for a destination it chooses. Without one, only the deployment's
   * credential is ever sent, so only the destination librechat.yaml chose is used.
   */
  secret?: DestinationSecret;
  /**
   * What picks the deployment credential the reader uses when the config holds no key. A
   * destination librechat.yaml chose stays only while it picks the credential librechat.yaml's does.
   */
  fallback?: (config: AppConfig) => readonly unknown[];
}

/**
 * Names of client options that choose where requests, and the credential, go. Summarization's
 * `parameters` become the summarizer's client options: LibreChat reads `baseURL`, and the
 * provider clients read their own (`anthropicApiUrl`, `azureOpenAIBasePath`,
 * `azureOpenAIEndpoint`, `azureOpenAIApiInstanceName`, Google's `baseUrl`, Vertex's `endpoint` and
 * `location`, Bedrock's `endpointHost` and `region`, Mistral's `serverURL`). A custom endpoint's
 * `addParams` reach its client the same way: the native Anthropic client (`provider: anthropic`)
 * sends to an `anthropicApiUrl` there over the endpoint's `baseURL`. The pattern errs strict, so a
 * name a client adds later is covered before anyone lists it; the options it matches that only
 * shape requests are named in {@link REQUEST_OPTIONS}.
 */
const DESTINATION_OPTION = /(?:url|endpoint|host|path|instancename|proxy|location|region)$/i;

/**
 * Client options whose names match the destination pattern but which change how requests are
 * shaped, not where they go: `firstPartyEndpoint` turns on OpenAI's first-party request rules for
 * the host the client already uses.
 */
const REQUEST_OPTIONS: ReadonlySet<string> = new Set(['firstPartyEndpoint']);

function isDestinationOption(key: string): boolean {
  return DESTINATION_OPTION.test(key) && !REQUEST_OPTIONS.has(key);
}

function getSummarizationProvider(config: AppConfig): string | undefined {
  const provider = config.summarization?.provider;
  return isKeyString(provider) ? provider : undefined;
}

/**
 * Whether the summarizer authenticates with `parameters.apiKey`. Without a provider it runs on
 * each agent's own, which may not; Bedrock never does, and signs with the AWS credentials of the
 * agent or the environment.
 */
function summarizationUsesKey(config: AppConfig): boolean {
  const provider = getSummarizationProvider(config);
  return provider != null && provider.trim().toLowerCase() !== EModelEndpoint.bedrock;
}

/**
 * The deployment credential a summarizer without a key uses: its provider's, and for an Azure
 * model (named, or summarized on an Azure agent's own provider) the key of the group it maps to.
 */
function getSummarizationFallback(config: AppConfig): readonly unknown[] {
  const provider = getSummarizationProvider(config);
  const model = config.summarization?.model;
  const azure = provider == null || provider === EModelEndpoint.azureOpenAI;
  const group =
    azure && typeof model === 'string'
      ? getAt(config.endpoints?.azureOpenAI?.modelGroupMap, [model, 'group'])
      : undefined;
  return [provider, group];
}

const DESTINATION_BINDINGS: readonly DestinationBinding[] = [
  /**
   * Without a key it authenticates with, summarization uses its provider's own credential:
   * `OPENAI_API_KEY`, the Azure group's key, a custom endpoint's key, the agent's resolved client
   * options (when it summarizes on the agent's provider) or the provider SDK's env default. Only a
   * string `parameters.apiKey` replaces it, and only for a named provider other than Bedrock.
   */
  {
    path: ['summarization', 'parameters'],
    isDestination: isDestinationOption,
    secret: { key: 'apiKey', client: getSummarizationProvider, isUsed: summarizationUsesKey },
    fallback: getSummarizationFallback,
  },
  /**
   * `vertexConfig` is what librechat.yaml's `endpoints.anthropic.vertex` resolves to, and an
   * override can write it directly. Its region is part of the API host, and the credential is
   * always the deployment's service account.
   */
  { path: ['endpoints', 'anthropic', 'vertexConfig'], isDestination: (key) => key === 'region' },
];

function asRecord(value: unknown): JsonRecord | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function getAt(root: unknown, segments: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const segment of segments) {
    const record = asRecord(cursor);
    if (record == null) {
      return undefined;
    }
    cursor = record[segment];
  }
  return cursor;
}

/** A non-empty string: the only value a reader sends as a key. */
function isKeyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** `user_provided` or a whole `{{VAR}}` template: a value each user enters for themselves. */
function isUserEntered(value: string): boolean {
  const trimmed = value.trim();
  return isUserProvided(trimmed) || isUserVariableTemplate(trimmed);
}

/** A key the deployment or an admin entered, in the form a reader sends it. */
function isEnteredKey(value: unknown): boolean {
  return isKeyString(value) && !isUserEntered(value);
}

/**
 * Whether a value is a credential the deployment or an admin supplies, which a new destination
 * must not receive: any set value except `user_provided` and a whole `{{VAR}}` template. Anything
 * that is not a string counts too, so a value no reader expects is dropped rather than kept.
 */
function isBoundSecret(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  return typeof value !== 'string' || isEnteredKey(value);
}

/** A URL in canonical form (fragment dropped), so a cosmetic respelling is not a change. */
function normalizeBindingValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return value;
  }
}

function bindingChanged(
  reference: JsonRecord | null,
  merged: JsonRecord,
  keys: readonly string[],
): boolean {
  return keys.some(
    (key) => normalizeBindingValue(reference?.[key]) !== normalizeBindingValue(merged[key]),
  );
}

/**
 * Copies `root` along `segments` (array items by index) and sets the last one to `value`, so
 * objects the merge shares with lower layers and the base config are never mutated.
 */
function setAt(root: unknown, segments: readonly (string | number)[], value: unknown): unknown {
  if (segments.length === 0) {
    return value;
  }
  const [segment, ...rest] = segments;
  if (Array.isArray(root) && typeof segment === 'number') {
    const next = [...root];
    next[segment] = setAt(root[segment], rest, value);
    return next;
  }
  const record = asRecord(root) ?? {};
  return { ...record, [segment]: setAt(record[segment], rest, value) };
}

/** An inherited secret to drop: where it is in the merged config, and how a write names it. */
interface Drop {
  at: readonly (string | number)[];
  segments: string[];
  path: string;
}

/**
 * Which config a merged secret's destination must match for the secret to stay:
 * - `below`: the layer inherited the secret, so the destination it inherited with it;
 * - `alone`: the layer supplied the secret, so the destination librechat.yaml and the layer
 *   itself define, whatever another layer below it changed;
 * - `null`: nothing to check (no secret, or a value each user supplies).
 */
type BindingReference = 'below' | 'alone' | null;

function getBindingReference(below: unknown, merged: unknown, applied: unknown): BindingReference {
  if (!isBoundSecret(merged)) {
    return null;
  }
  if (applied === undefined) {
    return merged === below ? 'below' : null;
  }
  return merged === applied ? 'alone' : null;
}

function findScalarDrops(step: ConfigMergeStep): Drop[] {
  return SECRET_BINDINGS.flatMap(({ path, secretKey, bindingKeys }) => {
    const merged = asRecord(getAt(step.merged, path));
    if (merged == null) {
      return [];
    }
    const below = asRecord(getAt(step.below, path));
    const applied = asRecord(getAt(step.applied, path));
    const reference = getBindingReference(
      below?.[secretKey],
      merged[secretKey],
      applied?.[secretKey],
    );
    if (reference == null) {
      return [];
    }
    const expected = reference === 'below' ? below : asRecord(getAt(step.alone(), path));
    if (!bindingChanged(expected, merged, bindingKeys)) {
      return [];
    }
    const segments = [...path, secretKey];
    return [{ at: segments, segments, path: segments.join('.') }];
  });
}

const CUSTOM_ENDPOINTS: readonly string[] = ['endpoints', 'custom'];
const CUSTOM_ENDPOINTS_PATH = CUSTOM_ENDPOINTS.join('.');

/**
 * Options a custom endpoint's `dropParams` can remove that hold a destination: the native
 * Anthropic client sends to `anthropicApiUrl`, else to `clientOptions.baseURL`, and without both
 * to its SDK's default host.
 */
const CLIENT_OPTION_GROUPS: ReadonlySet<string> = new Set(['clientOptions', 'configuration']);

/**
 * The identity a custom endpoint merges on and is served by: its name as the merge folds it
 * (`foldConfigMergeKey`), so `Ollama` and `ollama` are one endpoint.
 */
function getEndpointIdentity(name: string): string {
  return foldConfigMergeKey(CUSTOM_ENDPOINTS_PATH, name);
}

/** A custom endpoint list's entries by identity, in list order. */
function groupByIdentity(value: unknown): Map<string, JsonRecord[]> {
  const groups = new Map<string, JsonRecord[]>();
  if (!Array.isArray(value)) {
    return groups;
  }
  for (const item of value) {
    const entry = asRecord(item);
    if (entry == null || typeof entry.name !== 'string') {
      continue;
    }
    const identity = getEndpointIdentity(entry.name);
    const group = groups.get(identity);
    if (group == null) {
      groups.set(identity, [entry]);
    } else {
      group.push(entry);
    }
  }
  return groups;
}

/** A destination option's value in the form two spellings of one destination share. */
function toBindingValue(value: unknown): unknown {
  return asRecord(value) != null || Array.isArray(value)
    ? JSON.stringify(value)
    : normalizeBindingValue(value);
}

/**
 * Each option named like a destination in `options`, at any depth (array items included), keyed
 * by its location.
 */
function collectDestinationOptions(
  options: unknown,
  segments: readonly string[],
  into: Map<string, unknown>,
): void {
  const record: JsonRecord | null = Array.isArray(options) ? { ...options } : asRecord(options);
  if (record == null) {
    return;
  }
  for (const [key, value] of Object.entries(record)) {
    const location = [...segments, key];
    if (isDestinationOption(key)) {
      into.set(JSON.stringify(location), toBindingValue(value));
    } else {
      collectDestinationOptions(value, location, into);
    }
  }
}

/**
 * The settings of a custom endpoint that decide where its `apiKey` is sent, keyed by location:
 * - `baseURL`;
 * - `provider`, which picks the client that reads the rest;
 * - each option in `addParams` named like a destination ({@link isDestinationOption}), at any
 *   depth: the native Anthropic client sends to `addParams.anthropicApiUrl` over `baseURL`;
 * - each name in `dropParams` that removes such an option or the client options holding one
 *   ({@link CLIENT_OPTION_GROUPS}).
 */
function getCustomEndpointBinding(entry: JsonRecord | null): Map<string, unknown> {
  const binding = new Map<string, unknown>([
    [JSON.stringify(['baseURL']), normalizeBindingValue(entry?.baseURL)],
    [JSON.stringify(['provider']), entry?.provider],
  ]);
  collectDestinationOptions(entry?.addParams, ['addParams'], binding);
  const dropped = entry?.dropParams;
  if (!Array.isArray(dropped)) {
    return binding;
  }
  for (const name of dropped) {
    if (typeof name === 'string' && (isDestinationOption(name) || CLIENT_OPTION_GROUPS.has(name))) {
      binding.set(JSON.stringify(['dropParams', name]), true);
    }
  }
  return binding;
}

function customEndpointBindingChanged(reference: JsonRecord | null, merged: JsonRecord): boolean {
  const expected = getCustomEndpointBinding(reference);
  const actual = getCustomEndpointBinding(merged);
  if (expected.size !== actual.size) {
    return true;
  }
  for (const [location, value] of actual) {
    if (!expected.has(location) || expected.get(location) !== value) {
      return true;
    }
  }
  return false;
}

/**
 * Custom endpoints merge by name, folded as the merge folds it; each one's `apiKey` is bound to
 * the settings {@link getCustomEndpointBinding} lists. A merged entry is judged against the
 * entry of the layer that supplied it (the last of its identity, as the merge applies them) and
 * the entry it was merged onto: the merge keeps one merged entry per entry below, in order, so
 * the n-th merged entry of an identity comes from the n-th one below. A drop names the entry by
 * the spelling the merge keeps, the lower layer's.
 */
function findCustomEndpointDrops(step: ConfigMergeStep): Drop[] {
  const merged = getAt(step.merged, CUSTOM_ENDPOINTS);
  const applied = getAt(step.applied, CUSTOM_ENDPOINTS);
  if (!Array.isArray(merged) || !Array.isArray(applied)) {
    return [];
  }
  const appliedGroups = groupByIdentity(applied);
  const belowGroups = groupByIdentity(getAt(step.below, CUSTOM_ENDPOINTS));
  const occurrences = new Map<string, number>();
  let aloneGroups: Map<string, JsonRecord[]> | undefined;
  const drops: Drop[] = [];
  merged.forEach((item, index) => {
    const entry = asRecord(item);
    const name = entry?.name;
    if (entry == null || typeof name !== 'string') {
      return;
    }
    const identity = getEndpointIdentity(name);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const appliedGroup = appliedGroups.get(identity);
    const appliedEntry = appliedGroup?.[appliedGroup.length - 1];
    if (appliedEntry == null) {
      return;
    }
    const belowEntry = belowGroups.get(identity)?.[occurrence] ?? null;
    const reference = getBindingReference(belowEntry?.apiKey, entry.apiKey, appliedEntry.apiKey);
    if (reference == null) {
      return;
    }
    if (reference === 'alone') {
      aloneGroups ??= groupByIdentity(getAt(step.alone(), CUSTOM_ENDPOINTS));
    }
    const expected =
      reference === 'below' ? belowEntry : (aloneGroups?.get(identity)?.[occurrence] ?? null);
    if (!customEndpointBindingChanged(expected, entry)) {
      return;
    }
    drops.push({
      at: [...CUSTOM_ENDPOINTS, index, 'apiKey'],
      segments: [...CUSTOM_ENDPOINTS, name, 'apiKey'],
      path: `endpoints.custom[${JSON.stringify(name)}].apiKey`,
    });
  });
  return drops;
}

/** A secret inside each entry of a record keyed by entry name, and what decides where it goes. */
interface RecordSecret {
  /** Where the secret is inside an entry. */
  segments: readonly string[];
  /** The fields that decide where the secret is sent and differ between two entries. */
  changedFields: (reference: JsonRecord, merged: JsonRecord) => string[];
}

/** A record of entries, keyed by name, each with its own bound secrets. */
interface RecordBinding {
  /** The record in the resolved config. */
  path: readonly string[];
  /** The record as librechat.yaml and the admin API name it. */
  reportPath: readonly string[];
  secrets: readonly RecordSecret[];
}

/** Where an Azure group's key is sent: its own base URL, or its instance's Azure host. */
const AZURE_GROUP_BINDING_KEYS = ['baseURL', 'instanceName'];

const RECORD_BINDINGS: readonly RecordBinding[] = [
  /**
   * MCP servers merge by name. `apiKey.key` and `oauth.client_secret` are bound by the same rules
   * the user-managed tier enforces when a stored key is kept (`mcp/registry/binding.ts`).
   */
  {
    path: ['mcpConfig'],
    reportPath: ['mcpServers'],
    secrets: [
      {
        segments: ['apiKey', 'key'],
        changedFields: (reference, merged) =>
          diffApiKeyBinding(
            reference as CredentialBindingConfig,
            merged as CredentialBindingConfig,
          ),
      },
      {
        segments: ['oauth', 'client_secret'],
        changedFields: (reference, merged) =>
          getChangedOAuthSecretBindingFields(
            reference as CredentialBindingConfig,
            merged as CredentialBindingConfig,
          ),
      },
    ],
  },
  /**
   * `groupMap` is what librechat.yaml's Azure `groups` resolve to and what runtime readers use; an
   * override can write it directly, so each group's key is bound to its own destination.
   */
  {
    path: ['endpoints', 'azureOpenAI', 'groupMap'],
    reportPath: ['endpoints', 'azureOpenAI', 'groupMap'],
    secrets: [
      {
        segments: ['apiKey'],
        changedFields: (reference, merged) =>
          AZURE_GROUP_BINDING_KEYS.filter((key) => bindingChanged(reference, merged, [key])),
      },
    ],
  },
];

/**
 * Binding fields not compared for a secret the layer supplies: a transport `type` set below it
 * changes the protocol spoken to the same URL, not the host the secret reaches, so a profile that
 * sets a key and URL for a server another layer defines need not restate its type.
 */
const OWN_SECRET_IGNORED_FIELDS = new Set(['type']);

/** Entries the merge left untouched (the same object as below) cannot have moved. */
function findRecordDrops(step: ConfigMergeStep, binding: RecordBinding): Drop[] {
  const merged = asRecord(getAt(step.merged, binding.path));
  const below = asRecord(getAt(step.below, binding.path));
  if (merged == null || merged === below) {
    return [];
  }
  const applied = asRecord(getAt(step.applied, binding.path));
  const drops: Drop[] = [];
  for (const [name, mergedEntry] of Object.entries(merged)) {
    const entry = asRecord(mergedEntry);
    const belowEntry = below?.[name];
    if (entry == null || mergedEntry === belowEntry) {
      continue;
    }
    const appliedEntry = applied?.[name];
    for (const { segments, changedFields } of binding.secrets) {
      const reference = getBindingReference(
        getAt(belowEntry, segments),
        getAt(entry, segments),
        getAt(appliedEntry, segments),
      );
      if (reference == null) {
        continue;
      }
      const expected =
        reference === 'below' ? belowEntry : getAt(step.alone(), [...binding.path, name]);
      const changed = changedFields(asRecord(expected) ?? {}, entry);
      const moved =
        reference === 'below'
          ? changed
          : changed.filter((field) => !OWN_SECRET_IGNORED_FIELDS.has(field));
      if (moved.length === 0) {
        continue;
      }
      const reported = [...binding.reportPath, name, ...segments];
      drops.push({
        at: [...binding.path, name, ...segments],
        segments: reported,
        path: reported.join('.'),
      });
    }
  }
  return drops;
}

/** A destination set back to the one its credential belongs with. */
interface Restore {
  path: readonly string[];
  /** The object at `path` with its destination keys set back and its secret, if dropped, removed. */
  record: JsonRecord;
  /** The destination keys that changed. */
  keys: string[];
  /** The secret removed because the client that reads it is not the one it was entered for. */
  droppedSecret?: string;
}

function isSameSelection(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The destination the deployment's own credential may keep: librechat.yaml's, while
 * librechat.yaml sends that same credential there (it sets no key its client uses, and picks the
 * same fallback); otherwise the reader's default, which holds no destination keys.
 */
function getFallbackReference(step: ConfigMergeStep, binding: DestinationBinding): JsonRecord {
  const base = asRecord(getAt(step.base, binding.path)) ?? {};
  const { secret, fallback } = binding;
  const baseKeyed = secret != null && secret.isUsed(step.base) && isKeyString(base[secret.key]);
  const sameFallback =
    fallback == null || isSameSelection(fallback(step.base), fallback(step.merged));
  return !baseKeyed && sameFallback ? base : {};
}

/** How a merged destination is judged: the object it must match, and whether its secret goes. */
interface DestinationPlan {
  reference: JsonRecord;
  dropSecret: boolean;
}

/**
 * - A key the layer entered, which its client authenticates with: the destination librechat.yaml
 *   and the layer itself define (`alone`).
 * - An inherited key: the destination it was inherited with (`below`).
 * - Either one, under another client than the one it was entered for: the key is dropped, and
 *   the destination judged as without one.
 * - A key each user enters (`user_provided`, `{{VAR}}`): nothing to judge.
 * - No key the client uses (absent, empty, not a string, or a client that ignores it): the
 *   deployment's credential is sent, so {@link getFallbackReference}.
 */
function getDestinationPlan(
  step: ConfigMergeStep,
  binding: DestinationBinding,
  merged: JsonRecord,
): DestinationPlan | null {
  const { path, secret } = binding;
  if (secret != null && secret.isUsed(step.merged)) {
    const value = merged[secret.key];
    const own = isEnteredKey(getAt(step.applied, [...path, secret.key]));
    if (own || isEnteredKey(value)) {
      const keyedWith = own ? step.alone() : step.below;
      if (secret.client(keyedWith) === secret.client(step.merged)) {
        return { reference: asRecord(getAt(keyedWith, path)) ?? {}, dropSecret: false };
      }
      return { reference: getFallbackReference(step, binding), dropSecret: true };
    }
    if (isKeyString(value)) {
      return null;
    }
  }
  return { reference: getFallbackReference(step, binding), dropSecret: false };
}

/**
 * Whether a layer left the destination object, and everything that picks the client and
 * credential reading it, as it was below.
 */
function isUntouched(step: ConfigMergeStep, binding: DestinationBinding, merged: unknown): boolean {
  if (merged !== getAt(step.below, binding.path)) {
    return false;
  }
  const { secret, fallback } = binding;
  return (
    (secret == null || secret.client(step.below) === secret.client(step.merged)) &&
    (fallback == null || isSameSelection(fallback(step.below), fallback(step.merged)))
  );
}

/**
 * Destinations a layer left somewhere their credential was not entered for. One the merge left
 * untouched cannot have moved, and one the merge removed sends nothing.
 */
function findDestinationRestores(step: ConfigMergeStep): Restore[] {
  return DESTINATION_BINDINGS.flatMap((binding) => {
    const merged = asRecord(getAt(step.merged, binding.path));
    if (merged == null || isUntouched(step, binding, merged)) {
      return [];
    }
    const plan = getDestinationPlan(step, binding, merged);
    if (plan == null) {
      return [];
    }
    const { reference, dropSecret } = plan;
    const keys = [...new Set([...Object.keys(merged), ...Object.keys(reference)])].filter(
      (key) => binding.isDestination(key) && bindingChanged(reference, merged, [key]),
    );
    const droppedSecret = dropSecret ? binding.secret?.key : undefined;
    if (keys.length === 0 && droppedSecret == null) {
      return [];
    }
    const record = { ...merged };
    if (droppedSecret != null) {
      delete record[droppedSecret];
    }
    for (const key of keys) {
      if (reference[key] === undefined) {
        delete record[key];
      } else {
        record[key] = reference[key];
      }
    }
    return [{ path: binding.path, record, keys, droppedSecret }];
  });
}

/**
 * The merge's `afterLayer` policy for credentials bound to a destination. A credential stays
 * only where it was entered:
 * - a layer that changes where an entry sends a secret it inherits (from librechat.yaml or a
 *   lower layer), without supplying the secret again, drops it;
 * - a secret a layer supplies is bound to the destination librechat.yaml and that layer define;
 *   when another layer below it changed that destination, the layer's secret is dropped;
 * - where a reader falls back to a deployment credential when the config holds no key it uses
 *   (summarization, Vertex AI), the destination is set back instead: it may differ from
 *   librechat.yaml's only together with a key the layer enters and the reader authenticates
 *   with, and stays librechat.yaml's only while it receives the credential librechat.yaml sends
 *   there. A key that another client would read than the one it was entered for is removed.
 *
 * Those are all the places a destination in the config meets a credential, apart from web
 * search: MCP servers (URL, transport, proxy, auth header, OAuth endpoints), custom endpoints
 * (base URL, `provider`, and the destination options of `addParams` and `dropParams`, matched by
 * the name the merge folds), OCR, speech, summarization parameters, and the resolved Azure groups
 * (`groupMap`) and Vertex AI settings (`vertexConfig`) an override can write directly. Web
 * search keys follow the merge's own rule (`unbindWebSearchKeys`, which keeps a key over an
 * inherited `${VAR}` or default URL), and its drops are reported like these
 * (`mergeOverrideLayers`). The built-in endpoints, assistants and the memory agent take their
 * URLs from the environment, and Langfuse only reaches destinations the deployment configures.
 * Header maps are not covered: their values are not registered secrets.
 *
 * A dropped bound secret is set to `''`, which those readers treat as missing. `user_provided`
 * and `{{VAR}}` name a value each user enters and are never dropped. Each change is reported to
 * `onRebinding`.
 *
 * A secret a layer writes counts as entered by it, whatever it is. That includes a `${VAR}`
 * reference, which config reads return as written: restating the reference librechat.yaml or a
 * lower layer uses, beside a destination of the layer's own, sends that variable there. Which
 * names a layer may reference is the env allowlist's to decide (`allowlist.ts`), so this guard
 * binds encrypted admin-entered secrets and literals, and stops a layer from moving a reference
 * it does not restate.
 */
export function createSecretRebindingGuard(
  onRebinding?: (rebinding: SecretRebinding) => void,
): (step: ConfigMergeStep) => AppConfig {
  return (step) => {
    const drops = [
      ...findScalarDrops(step),
      ...findCustomEndpointDrops(step),
      ...RECORD_BINDINGS.flatMap((binding) => findRecordDrops(step, binding)),
    ];
    const restores = findDestinationRestores(step);
    let result: unknown = step.merged;
    for (const { at, segments, path } of drops) {
      result = setAt(result, at, '');
      onRebinding?.({ layer: step.layer, kind: 'secret', segments, path });
    }
    for (const { path, record, keys, droppedSecret } of restores) {
      result = setAt(result, path, record);
      const changes = [
        ...(droppedSecret != null ? [{ kind: 'secret' as const, key: droppedSecret }] : []),
        ...keys.map((key) => ({ kind: 'destination' as const, key })),
      ];
      for (const { kind, key } of changes) {
        const segments = [...path, key];
        onRebinding?.({ layer: step.layer, kind, segments, path: segments.join('.') });
      }
    }
    return result as AppConfig;
  };
}

/** How a write reports a rebinding its own layer causes. */
export function toIgnoredSecretOverride(rebinding: SecretRebinding): AdminConfigIgnoredSecret {
  return { path: rebinding.path, segments: rebinding.segments, reason: 'secret_rebinding' };
}
