import isPlainObject from 'lodash/isPlainObject';
import { loadOCRConfig } from '@librechat/data-schemas';
import { EModelEndpoint, isSensitiveEnvVar } from 'librechat-data-provider';
import type { ConfigOverrideIssue } from '@librechat/data-schemas';
import type { TCustomConfig } from 'librechat-data-provider';
import { decryptConfigSecret, isEncryptedSecretPayload } from '~/admin/secrets';

/** A `${NAME}` reference, in the grammar `extractEnvVariable` expands inside any string. */
const ENV_REFERENCE = /\$\{([^}]+)\}/g;

/** The issue a write gets for a value that references an env name outside the allowlist. */
export const ENV_REFERENCE_NOT_ALLOWED = 'env_reference_not_allowed';

/**
 * Env names the built-in endpoints read for their credentials and base URLs
 * (`api/server/services/Config/EndpointService.js`). The deployment already uses them for
 * endpoint credentials, so an override may name them too.
 */
export const ENDPOINT_CREDENTIAL_ENV_NAMES: readonly string[] = [
  'OPENAI_API_KEY',
  'OPENAI_REVERSE_PROXY',
  'AZURE_API_KEY',
  'AZURE_OPENAI_BASEURL',
  'ASSISTANTS_API_KEY',
  'ASSISTANTS_BASE_URL',
  'AZURE_ASSISTANTS_API_KEY',
  'AZURE_ASSISTANTS_BASE_URL',
  'ANTHROPIC_API_KEY',
  'GOOGLE_KEY',
  'BEDROCK_AWS_BEARER_TOKEN',
  'BEDROCK_AWS_ACCESS_KEY_ID',
  'BEDROCK_AWS_SECRET_ACCESS_KEY',
  'BEDROCK_AWS_SESSION_TOKEN',
];

/**
 * Which `${NAME}` references a value from a database override layer may resolve. librechat.yaml
 * is the operator's own file and resolves any name; override layers are written through the
 * admin API, so their references are limited to names the deployment already uses for config.
 */
export interface EnvReferencePolicy {
  allows(name: string): boolean;
}

/**
 * Sections shown to users or sent to a model as written: nothing expands `${...}` in them
 * (`interface` copy, model spec labels, greetings and preset prompts).
 */
export const ENV_LITERAL_TEXT_SECTIONS: readonly string[] = ['interface', 'modelSpecs'];

/** Endpoints configured by name under `endpoints`; custom endpoints are a list. */
const NAMED_ENDPOINTS: readonly string[] = [
  'all',
  EModelEndpoint.openAI,
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.azureAssistants,
  EModelEndpoint.assistants,
  EModelEndpoint.agents,
  EModelEndpoint.bedrock,
];

/** The system prompts an endpoint's title, activity and reasoning labels are written with. */
const ENDPOINT_PROMPT_KEYS: readonly string[] = [
  'titlePrompt',
  'titlePromptTemplate',
  'activityPrompt',
  'activityPhasePrompt',
  'reasoningLabelPrompt',
];

/**
 * Prompt and instruction fields outside those sections, by their full path in librechat.yaml
 * keys; `*` stands for one custom endpoint (its position in the list). Only these exact locations
 * are literal: a key of the same name anywhere else, such as an `X-Prompt` header or an
 * `instructions` entry under `env` or `addParams`, is expanded by its reader and stays policed.
 */
export const ENV_LITERAL_TEXT_PATHS: readonly (readonly string[])[] = [
  ...ENDPOINT_PROMPT_KEYS.flatMap((key) => [
    ...NAMED_ENDPOINTS.map((endpoint) => ['endpoints', endpoint, key]),
    ['endpoints', 'custom', '*', key],
  ]),
  ['summarization', 'prompt'],
  ['summarization', 'updatePrompt'],
  ['memory', 'agent', 'instructions'],
  ['webSearch', 'firecrawlOptions', 'changeTrackingOptions', 'prompt'],
];

const LITERAL_TEXT_SECTIONS = new Set(ENV_LITERAL_TEXT_SECTIONS);

function literalTextBucket(first: string, last: string): string {
  return `${first}\u0000${last}`;
}

/** {@link ENV_LITERAL_TEXT_PATHS} by first and last segment, so a lookup compares only a few. */
const LITERAL_TEXT_PATHS_BY_BUCKET = ENV_LITERAL_TEXT_PATHS.reduce((buckets, path) => {
  const bucket = literalTextBucket(path[0], path[path.length - 1]);
  buckets.set(bucket, [...(buckets.get(bucket) ?? []), path]);
  return buckets;
}, new Map<string, (readonly string[])[]>());

function matchesPath(segments: readonly string[], pattern: readonly string[]): boolean {
  return (
    segments.length === pattern.length &&
    pattern.every((segment, index) => segment === '*' || segment === segments[index])
  );
}

/**
 * Whether the string at `segments` (librechat.yaml keys, array items by index) is text no reader
 * env-expands, so a `${...}` in it is literal and the env policy does not apply: anything in
 * {@link ENV_LITERAL_TEXT_SECTIONS}, and exactly the fields in {@link ENV_LITERAL_TEXT_PATHS}.
 * Everything else is policed, so a reader that starts expanding a new field is covered by default.
 */
export function isLiteralTextPath(segments: readonly string[]): boolean {
  if (segments.length === 0) {
    return false;
  }
  if (LITERAL_TEXT_SECTIONS.has(segments[0])) {
    return true;
  }
  const paths = LITERAL_TEXT_PATHS_BY_BUCKET.get(
    literalTextBucket(segments[0], segments[segments.length - 1]),
  );
  return paths != null && paths.some((pattern) => matchesPath(segments, pattern));
}

/** The templates the Azure client fills in a group's base URL from its instance and deployment. */
const AZURE_URL_TEMPLATE_NAMES: ReadonlySet<string> = new Set(['INSTANCE_NAME', 'DEPLOYMENT_NAME']);

/**
 * Azure group base URLs, where `${INSTANCE_NAME}` and `${DEPLOYMENT_NAME}` are templates the Azure
 * client fills (`constructAzureURL`), not env references; `*` stands for one group.
 */
export const AZURE_URL_TEMPLATE_PATHS: readonly (readonly string[])[] = [
  ['endpoints', 'azureOpenAI', 'groups', '*', 'baseURL'],
  ['endpoints', 'azureOpenAI', 'groupMap', '*', 'baseURL'],
];

/** Whether `name` at `segments` is an Azure base URL template rather than an env reference. */
function isAzureURLTemplate(name: string, segments: readonly string[]): boolean {
  return (
    AZURE_URL_TEMPLATE_NAMES.has(name) &&
    AZURE_URL_TEMPLATE_PATHS.some((pattern) => matchesPath(segments, pattern))
  );
}

/** Splits `CONFIG_OVERRIDE_ENV_ALLOWLIST`: env names separated by commas or whitespace. */
export function parseEnvAllowlist(value?: string | null): string[] {
  return (value ?? '').split(/[\s,]+/).filter((name) => name !== '');
}

/** The env names the string at `segments` references (an Azure base URL template is none). */
function referencedNames(text: string, segments: readonly string[]): string[] {
  return Array.from(text.matchAll(ENV_REFERENCE), (match) => match[1]).filter(
    (name) => !isAzureURLTemplate(name, segments),
  );
}

/**
 * Visits every string under `value` (object values and array items, not keys) outside literal
 * text, with its location.
 */
function visitExpandedStrings(
  value: unknown,
  visit: (text: string, segments: readonly string[]) => void,
  segments: readonly string[] = [],
): void {
  if (typeof value === 'string') {
    if (!isLiteralTextPath(segments)) {
      visit(value, segments);
    }
    return;
  }
  if (value == null || typeof value !== 'object') {
    return;
  }
  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
  for (const [key, child] of entries) {
    visitExpandedStrings(child, visit, [...segments, key]);
  }
}

/** Every env name a config references where a reader expands it, at any depth. */
export function collectEnvReferenceNames(value: unknown): Set<string> {
  const names = new Set<string>();
  visitExpandedStrings(value, (text, segments) => {
    for (const name of referencedNames(text, segments)) {
      names.add(name);
    }
  });
  return names;
}

/**
 * librechat.yaml with the references loading it spells out for what a section it configures
 * leaves unset: OCR without a key uses `${OCR_API_KEY}` (`loadOCRConfig`). The resolved config
 * carries that reference, so config reads return it and a client that writes back what it read
 * restates it; it is a name librechat.yaml uses as much as one it spells out.
 */
function withLoadedReferences(config: unknown): unknown {
  if (!isPlainObject(config)) {
    return config;
  }
  const yaml = config as Partial<TCustomConfig>;
  return yaml.ocr == null ? yaml : { ...yaml, ocr: loadOCRConfig(yaml.ocr) };
}

/**
 * The allowlist: names librechat.yaml references (`config` is the raw YAML config, with the
 * references loading it fills in, {@link withLoadedReferences}), the built-in endpoints'
 * credential names, and the operator's extra names. Infrastructure secrets `extractEnvVariable`
 * never expands (`CREDS_KEY`, `JWT_SECRET`, ...) stay out whatever lists them.
 */
export function createEnvReferencePolicy(options: {
  config?: unknown;
  allowlist?: readonly string[];
}): EnvReferencePolicy {
  const names = collectEnvReferenceNames(withLoadedReferences(options.config));
  for (const name of [...ENDPOINT_CREDENTIAL_ENV_NAMES, ...(options.allowlist ?? [])]) {
    names.add(name);
  }
  return { allows: (name) => names.has(name) && !isSensitiveEnvVar(name) };
}

function hasDisallowedReference(
  text: string,
  policy: EnvReferencePolicy,
  segments: readonly string[],
): boolean {
  return referencedNames(text, segments).some((name) => !policy.allows(name));
}

/**
 * An issue for every string at or under `value` that references a name the policy does not
 * allow, outside literal text ({@link isLiteralTextPath}); `segments` locate `value` in the
 * overrides. The issue carries the location only, never the value or the name.
 */
export function getEnvReferenceIssues(
  value: unknown,
  policy: EnvReferencePolicy,
  segments: readonly string[] = [],
): ConfigOverrideIssue[] {
  if (typeof value === 'string') {
    return !isLiteralTextPath(segments) && hasDisallowedReference(value, policy, segments)
      ? [{ path: segments.join('.'), segments: [...segments], code: ENV_REFERENCE_NOT_ALLOWED }]
      : [];
  }
  if (value == null || typeof value !== 'object') {
    return [];
  }
  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
  return entries.flatMap(([key, child]) =>
    getEnvReferenceIssues(child, policy, [...segments, key]),
  );
}

/**
 * A string with each disallowed reference resolved to nothing, as an unset variable leaves no
 * value behind; allowed references stay for the runtime to expand. Removing a reference can join
 * the text around it into a new one (`$${NOPE}{NAME}` leaves `${NAME}`), so the pass repeats
 * until no disallowed reference is left. Ciphertext is judged by its
 * plaintext, which a runtime reader may expand once decrypted: a stored secret that references a
 * disallowed name becomes `''`. Ciphertext that does not decrypt is left for the decrypting
 * reader, which already treats it as missing.
 */
function neutralizeText(
  text: string,
  policy: EnvReferencePolicy,
  segments: readonly string[],
): string {
  if (isEncryptedSecretPayload(text)) {
    const plaintext = decryptConfigSecret(text);
    return plaintext != null && hasDisallowedReference(plaintext, policy, segments) ? '' : text;
  }
  let current = text;
  while (current.includes('${')) {
    const next = current.replace(ENV_REFERENCE, (reference, name: string) =>
      policy.allows(name) || isAzureURLTemplate(name, segments) ? reference : '',
    );
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
}

/**
 * A database override layer's values with every disallowed `${NAME}` reference resolved to
 * nothing (see {@link neutralizeText}), applied before the layer merges so no runtime reader can
 * expand it. Literal text ({@link isLiteralTextPath}) is left as written. Containers are copied
 * only along the paths that change; the input is never mutated.
 */
export function neutralizeEnvReferences<T>(
  value: T,
  policy: EnvReferencePolicy,
  segments: readonly string[] = [],
): T {
  if (typeof value === 'string') {
    return (isLiteralTextPath(segments) ? value : neutralizeText(value, policy, segments)) as T;
  }
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (segments.length === 1 && LITERAL_TEXT_SECTIONS.has(segments[0])) {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value.map((item, index) =>
      neutralizeEnvReferences(item, policy, [...segments, String(index)]),
    );
    return (items.some((item, index) => item !== value[index]) ? items : value) as T;
  }
  let changed: Record<string, unknown> | undefined;
  for (const [key, child] of Object.entries(value)) {
    const next = neutralizeEnvReferences(child, policy, [...segments, key]);
    if (next !== child) {
      changed ??= { ...(value as Record<string, unknown>) };
      changed[key] = next;
    }
  }
  return (changed ?? value) as T;
}
