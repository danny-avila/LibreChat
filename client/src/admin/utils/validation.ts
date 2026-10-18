import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { resolveSubSchema } from './schema';
import { isConfigRecord } from './format';

const MAX_UNION_DEPTH = 10;

type ParseableSchema = t.ZodSchemaLike & { safeParse: (value: unknown) => t.SchemaParseResult };

function isParseable(schema: t.ZodSchemaLike | null | undefined): schema is ParseableSchema {
  return schema != null && typeof (schema as Partial<ParseableSchema>).safeParse === 'function';
}

/** Validates a value against the bundled config schema at `fieldPath` (unknown paths pass). */
export function validateFieldValue(
  fieldPath: string,
  value: unknown,
): { success: true } | { success: false; error: string } {
  const segments = fieldPath.split('.');
  const subSchema = resolveSubSchema(configSchema as t.ZodSchemaLike, segments);

  if (!isParseable(subSchema)) return { success: true };

  const result = subSchema.safeParse(value);
  if (!result.success && result.error) {
    const messages = result.error.issues.map((issue) => {
      const issuePath = issue.path.reduce<string>(
        (path, segment) =>
          typeof segment === 'number' ? `${path}[${segment}]` : `${path}.${segment}`,
        fieldPath,
      );
      return `${issuePath}: ${issue.message}`;
    });
    return { success: false, error: messages.join('; ') || 'Validation failed' };
  }

  return { success: true };
}

/**
 * A union reports one issue at its own path; the branch with the fewest
 * (then deepest) failures is the shape the value was written for, so its
 * issues locate the actual fault. Mirrors LibreChat's issue attribution.
 */
function expandUnionIssues(issues: t.SchemaIssue[], depth = 0): t.SchemaIssue[] {
  return issues.flatMap((issue) => {
    if (issue.code !== 'invalid_union' || !issue.unionErrors || depth >= MAX_UNION_DEPTH) {
      return [issue];
    }
    const deepest = (list: t.SchemaIssue[]) => Math.max(0, ...list.map((i) => i.path.length));
    const closest = issue.unionErrors
      .map((error) => error.issues)
      .reduce<t.SchemaIssue[] | undefined>((best, branch) => {
        if (!best || branch.length < best.length) return branch;
        return branch.length === best.length && deepest(branch) > deepest(best) ? branch : best;
      }, undefined);
    return closest && closest.length > 0 ? expandUnionIssues(closest, depth + 1) : [issue];
  });
}

function formatBound(value: number | bigint | undefined): string | number {
  if (typeof value === 'bigint') return value.toString();
  return value ?? '';
}

function boundCode(base: 'too_small' | 'too_big', issue: t.SchemaIssue): string {
  if (issue.type === 'string') return `${base}_length`;
  if (issue.type === 'array' || issue.type === 'set') return `${base}_items`;
  return issue.inclusive === false ? `${base}_exclusive` : base;
}

const TYPE_NAMES: Readonly<Record<string, string>> = {
  string: 'text',
  number: 'a number',
  integer: 'a whole number',
  boolean: 'true or false',
  array: 'a list',
  object: 'an object',
};

/**
 * English text for each issue code, with `{{param}}` placeholders. The panel
 * shows the localized `com_admin_config_issue_<code>` text instead when it has one.
 */
const ISSUE_MESSAGES: Readonly<Record<string, string>> = {
  required: 'is required',
  invalid_type: 'must be {{expected}}',
  invalid_literal: 'must be {{expected}}',
  invalid_enum_value: 'must be one of {{options}}',
  invalid_url: 'must be a valid URL',
  invalid_email: 'must be a valid email address',
  too_small: 'must be at least {{minimum}}',
  too_small_exclusive: 'must be greater than {{minimum}}',
  too_small_length: 'must be at least {{minimum}} characters',
  too_small_items: 'must have at least {{minimum}} items',
  too_big: 'must be at most {{maximum}}',
  too_big_exclusive: 'must be less than {{maximum}}',
  too_big_length: 'must be at most {{maximum}} characters',
  too_big_items: 'must have at most {{maximum}} items',
  union_dropped_key: "isn't valid for this kind of value",
  duplicate_merge_key: 'repeats a name another entry already uses',
  missing_merge_key: 'needs a name',
  indexed_merge_key_write: 'must be saved as a whole list',
  invalid_document: 'is not a valid configuration',
  invalid_union: 'is not a valid value',
  models_required: 'needs at least one model',
  YAML_MANAGED:
    'is managed in librechat.yaml; LibreChat ignores admin overrides for it until it re-processes them',
  PROCESS_MCP_FIELD:
    'can only be configured in librechat.yaml for process-backed MCP servers (command, args, env, cwd, stderr, stdio)',
  BLANK_VALUE: 'is blank: enter a value, or clear the field',
  BLANK_KEY: 'has a blank key: name it, or remove the entry',
};

/** Fills `{{param}}` placeholders. */
export function interpolateIssue(
  template: string,
  params: Record<string, string | number> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** English text for an issue code (with params), or `fallback` for codes without one. */
export function describeIssueCode(
  code: string | undefined,
  params: Record<string, string | number> | undefined,
  fallback: string,
): string {
  const template = code ? ISSUE_MESSAGES[code] : undefined;
  return template ? interpolateIssue(template, params) : fallback;
}

/** Whether `code` has a generic message (a predicate such as "is required") rather than a free-form one. */
export function hasIssueMessage(code: string | undefined): boolean {
  return code != null && code in ISSUE_MESSAGES;
}

/** The issue code and message parameters for a zod issue. */
function classifySchemaIssue(issue: t.SchemaIssue): {
  code: string;
  params: Record<string, string | number>;
} {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined') return { code: 'required', params: {} };
      return {
        code: 'invalid_type',
        params: { expected: TYPE_NAMES[String(issue.expected)] ?? String(issue.expected) },
      };
    case 'invalid_literal':
      return { code: 'invalid_literal', params: { expected: JSON.stringify(issue.expected) } };
    case 'invalid_enum_value':
      return {
        code: 'invalid_enum_value',
        params: { options: (issue.options ?? []).map((o) => JSON.stringify(o)).join(', ') },
      };
    case 'too_small':
      return {
        code: boundCode('too_small', issue),
        params: { minimum: formatBound(issue.minimum) },
      };
    case 'too_big':
      return {
        code: boundCode('too_big', issue),
        params: { maximum: formatBound(issue.maximum) },
      };
    case 'invalid_string':
      if (issue.validation === 'url') return { code: 'invalid_url', params: {} };
      if (issue.validation === 'email') return { code: 'invalid_email', params: {} };
      return { code: 'invalid_string', params: {} };
    default:
      return { code: issue.code, params: {} };
  }
}

/** Config issues (stable codes, English messages) for schema issues relative to `basePath`. */
export function toConfigIssues(issues: t.SchemaIssue[], basePath: string): t.ConfigIssue[] {
  return expandUnionIssues(issues)
    .filter((issue) => issue.code !== 'unrecognized_keys')
    .map((issue) => {
      const { code, params } = classifySchemaIssue(issue);
      const path = [basePath, ...issue.path.map(String)].filter(Boolean).join('.');
      return { path, code, params, message: describeIssueCode(code, params, issue.message) };
    });
}

function parseIssues(
  schema: t.ZodSchemaLike | null | undefined,
  value: t.ConfigValue,
  basePath: string,
): t.ConfigIssue[] {
  if (!isParseable(schema)) return [];
  const result = schema.safeParse(value);
  if (result.success || !result.error) return [];
  return toConfigIssues(result.error.issues, basePath);
}

/** Schema issues of a value at `path` (a field, entry or section of the config). */
export function validateField(path: string, value: t.ConfigValue): t.ConfigIssue[] {
  const schema = resolveSubSchema(configSchema as t.ZodSchemaLike, path.split('.'));
  return parseIssues(schema, value, path);
}

/**
 * Schema issues of one collection entry, validated whole against the
 * collection's element schema (so required fields and refinements apply).
 * Paths are `<collection>.<index>.<field>`, and each issue names the entry.
 */
export function validateEntry(
  collectionPath: string,
  entry: t.ConfigValue,
  index: number,
  identity?: string,
): t.ConfigIssue[] {
  const schema = resolveSubSchema(configSchema as t.ZodSchemaLike, [
    ...collectionPath.split('.'),
    '0',
  ]);
  const entryBase = `${collectionPath}.${index}`;
  return parseIssues(schema, entry, entryBase).map((issue) => ({
    ...issue,
    entryIdentity: identity,
    entryPath: issue.path === entryBase ? '' : issue.path.slice(entryBase.length + 1),
  }));
}

function hasText(value: t.ConfigValue): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * What a custom endpoint needs for LibreChat to load it at all: an API key, a
 * base URL, and a model list (default models, or fetched). The schema leaves
 * them optional, so an entry without them saves fine and is then silently
 * dropped at runtime (`loadCustomEndpointsConfig`). `hasStoredKey` counts an
 * encrypted key the read only shows as a preview.
 */
export function validateLoadableEndpoint(
  entry: t.ConfigValue,
  index: number,
  identity?: string,
  hasStoredKey = false,
): t.ConfigIssue[] {
  if (!isConfigRecord(entry)) return [];
  const base = `endpoints.custom.${index}`;
  const issue = (entryPath: string, code: string): t.ConfigIssue => ({
    path: `${base}.${entryPath}`,
    code,
    message: describeIssueCode(code, undefined, code),
    entryIdentity: identity,
    entryPath,
  });
  const models = isConfigRecord(entry.models) ? entry.models : {};
  const hasModels = Array.isArray(models.default) && models.default.length > 0;
  return [
    ...(hasText(entry.apiKey) || hasStoredKey ? [] : [issue('apiKey', 'required')]),
    ...(hasText(entry.baseURL) ? [] : [issue('baseURL', 'required')]),
    ...(hasModels ? [] : [issue('models.default', 'models_required')]),
  ];
}

/**
 * Schema issues of a whole top-level section, so object refinements and
 * required siblings are checked (e.g. CloudFront's `invalidateOnDelete`
 * needs a domain), which per-field validation cannot see.
 */
export function validateSection(section: string, value: t.ConfigValue): t.ConfigIssue[] {
  if (value === undefined) return [];
  const shape = (configSchema as t.ZodSchemaLike).shape;
  return parseIssues(shape?.[section], value, section);
}

/** Where an issue is, for plain-text summaries: `endpoints.custom › GPT › provider` inside an entry. */
export function describeIssueLocation(issue: t.ConfigIssue): string {
  if (issue.entryIdentity === undefined) return issue.path;
  const collection = issue.entryPath
    ? issue.path.slice(0, -(issue.entryPath.length + 1)).replace(/\.\d+$/, '')
    : issue.path.replace(/\.\d+$/, '');
  const field = issue.entryPath ? ` › ${issue.entryPath}` : '';
  return `${collection} › ${issue.entryIdentity}${field}`;
}

/** One-line English summary of blocking issues (server errors, logs). */
export function summarizeIssues(issues: t.ConfigIssue[]): string {
  const details = issues.map((issue) => `${describeIssueLocation(issue)}: ${issue.message}`);
  return `Validation failed — ${details.join('; ')}`;
}
