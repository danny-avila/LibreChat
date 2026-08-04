import yaml from 'js-yaml';
import { normalizeSkillFrontmatterKeys } from '@librechat/data-schemas';
import type { SkillBooleanFlag, SkillBooleanColumn } from '@librechat/data-schemas';

/**
 * Boolean frontmatter flags mirrored onto first-class skill columns, declared
 * locally on purpose. This module is pure text parsing and must stay loadable
 * without `@librechat/data-schemas` initialized: several suites replace that
 * module with a partial mock, and reading a value export from it at module
 * scope resolves to `undefined` and throws before any test runs. The type is
 * still imported (erased at compile time), and `parse.test.ts` asserts this
 * table matches `SKILL_BOOLEAN_FLAGS` in data-schemas so the two cannot drift.
 */
export const SKILL_BOOLEAN_FLAGS: readonly SkillBooleanFlag[] = [
  { column: 'alwaysApply', key: 'always-apply', aliases: ['alwaysApply'] },
  { column: 'userInvocable', key: 'user-invocable', aliases: [] },
  { column: 'disableModelInvocation', key: 'disable-model-invocation', aliases: [] },
];

export type ParsedSkillMarkdown = {
  name: string;
  description: string;
  alwaysApply?: boolean;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
  frontmatter?: Record<string, unknown>;
  invalidBooleans: string[];
  parseError?: string;
};

const SKILL_BOOLEAN_FLAG_BY_KEY = new Map<string, SkillBooleanFlag>(
  SKILL_BOOLEAN_FLAGS.flatMap((flag) =>
    [flag.key, ...flag.aliases].map((key) => [key, flag] as const),
  ),
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractFrontmatterBlock(raw: string): string | null {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const firstContentIndex = normalized.search(/\S/);
  if (firstContentIndex === -1) {
    return null;
  }
  const content = normalized.slice(firstContentIndex);
  const opening = /^---[ \t]*\n/.exec(content);
  if (!opening) {
    return null;
  }
  const body = content.slice(opening[0].length);
  const closingFence = /(?:^|\n)---[ \t]*(?:\n|$)/.exec(body);
  if (!closingFence) {
    return null;
  }
  return body.slice(0, closingFence.index);
}

function getCaseInsensitive(frontmatter: Record<string, unknown>, key: string): unknown {
  const target = key.toLowerCase();
  const entry = Object.entries(frontmatter).find(
    ([candidate]) => candidate.toLowerCase() === target,
  );
  return entry?.[1];
}

function hasCaseInsensitive(frontmatter: Record<string, unknown>, key: string): boolean {
  const target = key.toLowerCase();
  return Object.keys(frontmatter).some((candidate) => candidate.toLowerCase() === target);
}

/**
 * Recover the text a key carried on its own line, used to cross-check the
 * value the YAML parser resolved. Anchored at column zero so a nested mapping
 * that reuses a flag name (`metadata:` → `  user-invocable: ...`) can't shadow
 * the top-level key; nested keys never reach the top-level bag, so matching one
 * here would attribute an unrelated value to the flag. Returns `undefined` when
 * no line matches, which callers treat as "nothing to cross-check".
 */
function getRawFrontmatterValue(block: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedKey}\\s*:\\s*(.*)$`, 'i');
  const line = block.split('\n').find((candidate) => pattern.test(candidate));
  const match = line?.match(pattern);
  return match?.[1];
}

function stripInlineComment(value: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }
    if (char === '#' && !quote) {
      return value.slice(0, i).trim();
    }
  }
  return value.trim();
}

function parseBoolean(value: unknown, rawValue?: string): boolean | undefined {
  const raw = rawValue === undefined ? undefined : stripInlineComment(rawValue).toLowerCase();
  if (typeof value === 'boolean') {
    /* The raw line exists only to reject inline text that contradicts the
       resolved value (an explicit `!!bool` tag, say). When the key's line holds
       no value of its own — because YAML continues it on the following line, or
       the whole mapping is indented and the line scan finds nothing — there is
       nothing to contradict, so trust the boolean the parser resolved. Treating
       it as absent instead would silently discard a declared flag. */
    if (raw === undefined || raw.length === 0) {
      return value;
    }
    return raw === 'true' || raw === 'false' ? value : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const lowered = value.trim().toLowerCase();
  if (lowered === 'true') {
    return true;
  }
  if (lowered === 'false') {
    return false;
  }
  return undefined;
}

function hasBooleanPlaceholder(rawValue?: string): boolean {
  return rawValue !== undefined && stripInlineComment(rawValue).length === 0;
}

type ResolvedBooleanFlag = { value?: boolean; invalidKey?: string };

/**
 * Read a flag key already known to be present. A value that is neither
 * `true` nor `false` is reported on `invalidKey` — under the key's authored
 * spelling — rather than silently collapsing to "off", except for an empty
 * value (`user-invocable:` with nothing after it), which is a mid-edit
 * placeholder and treated as absent.
 */
function readPresentBooleanFlag(
  frontmatter: Record<string, unknown>,
  block: string,
  key: string,
): ResolvedBooleanFlag {
  const rawValue = getRawFrontmatterValue(block, key);
  const value = parseBoolean(getCaseInsensitive(frontmatter, key), rawValue);
  if (value === undefined && !hasBooleanPlaceholder(rawValue)) {
    return { invalidKey: key };
  }
  return { value };
}

function resolveBooleanFlag(
  frontmatter: Record<string, unknown>,
  block: string,
  flag: SkillBooleanFlag,
): ResolvedBooleanFlag {
  if (hasCaseInsensitive(frontmatter, flag.key)) {
    return readPresentBooleanFlag(frontmatter, block, flag.key);
  }
  const alias = flag.aliases.find((candidate) => hasCaseInsensitive(frontmatter, candidate));
  if (alias !== undefined) {
    return readPresentBooleanFlag(frontmatter, block, alias);
  }
  return {};
}

function toScalarString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function parseSkillMarkdown(raw: string): ParsedSkillMarkdown {
  const block = extractFrontmatterBlock(raw);
  if (!block) {
    return { name: '', description: '', invalidBooleans: [] };
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(block);
  } catch (error) {
    return {
      name: '',
      description: '',
      invalidBooleans: [],
      parseError: error instanceof Error ? error.message : 'Invalid YAML frontmatter',
    };
  }
  let frontmatter: Record<string, unknown> = {};
  if (isPlainObject(parsed)) {
    const normalized = normalizeSkillFrontmatterKeys(parsed);
    if ('error' in normalized) {
      return {
        name: '',
        description: '',
        invalidBooleans: [],
        parseError: normalized.error,
      };
    }
    frontmatter = normalized.frontmatter;
  }
  const nameValue = getCaseInsensitive(frontmatter, 'name');
  const descriptionValue = getCaseInsensitive(frontmatter, 'description');
  const whenToUseValue = getCaseInsensitive(frontmatter, 'when-to-use');
  const name = toScalarString(nameValue);
  let description = '';
  if (descriptionValue !== undefined) {
    description = toScalarString(descriptionValue);
  } else if (whenToUseValue !== undefined) {
    description = toScalarString(whenToUseValue);
  }
  const flagValues: Partial<Record<SkillBooleanColumn, boolean>> = {};
  const invalidBooleans: string[] = [];
  for (const flag of SKILL_BOOLEAN_FLAGS) {
    const { value, invalidKey } = resolveBooleanFlag(frontmatter, block, flag);
    if (invalidKey !== undefined) {
      invalidBooleans.push(invalidKey);
      continue;
    }
    if (value !== undefined) {
      flagValues[flag.column] = value;
    }
  }
  return {
    name,
    description,
    alwaysApply: flagValues.alwaysApply,
    userInvocable: flagValues.userInvocable,
    disableModelInvocation: flagValues.disableModelInvocation,
    frontmatter,
    invalidBooleans,
  };
}

/**
 * Reduce a parsed frontmatter bag to what a skill document should persist:
 * `name`/`description` live in their own columns, and every boolean flag is
 * rewritten from the parser's resolved value under its canonical key.
 *
 * That rewrite is what keeps the bag honest. Values the parser could not read
 * as booleans — a mid-edit `user-invocable:` placeholder, a
 * `disable-model-invocation: yes` typo, a quoted `"true"` — never reach the
 * document as-is, so the bag both passes strict frontmatter validation and
 * agrees with the columns `deriveStructuredFrontmatterFields` derives from it.
 * The legacy `alwaysApply` spelling is folded into `always-apply`.
 *
 * Key order is preserved: a flag is rewritten in place rather than appended,
 * so re-cleaning an unchanged SKILL.md is byte-identical for callers that
 * detect drift by comparing serialized bags.
 */
export function toCleanFrontmatter(parsed: ParsedSkillMarkdown): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.frontmatter ?? {})) {
    if (key === 'name' || key === 'description') {
      continue;
    }
    const flag = SKILL_BOOLEAN_FLAG_BY_KEY.get(key);
    if (!flag) {
      clean[key] = value;
      continue;
    }
    const resolved = parsed[flag.column];
    if (resolved !== undefined && !(flag.key in clean)) {
      clean[flag.key] = resolved;
    }
  }
  return clean;
}
