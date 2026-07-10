import yaml from 'js-yaml';

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
  const entry = Object.entries(frontmatter).find(([candidate]) => candidate.toLowerCase() === key);
  return entry?.[1];
}

function hasCaseInsensitive(frontmatter: Record<string, unknown>, key: string): boolean {
  return Object.keys(frontmatter).some((candidate) => candidate.toLowerCase() === key);
}

function getRawFrontmatterValue(block: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*${escapedKey}\\s*:\\s*(.*)$`, 'i');
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

function normalizeFrontmatterKeys(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(frontmatter).reduce<Record<string, unknown>>((acc, [key, value]) => {
    const normalizedKey = key.toLowerCase();
    acc[normalizedKey === 'alwaysapply' ? 'alwaysApply' : normalizedKey] = value;
    return acc;
  }, {});
}

function parseBoolean(value: unknown, rawValue?: string): boolean | undefined {
  const raw = rawValue === undefined ? undefined : stripInlineComment(rawValue).toLowerCase();
  if (typeof value === 'boolean') {
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

/**
 * Extract a canonical boolean frontmatter field, applying the same strict
 * true/false rules as `always-apply`: a present-but-non-boolean value is
 * recorded on `invalidBooleans` so the import handler can 400 instead of
 * silently dropping it, while an empty placeholder is treated as absent.
 */
function extractBooleanField(
  frontmatter: Record<string, unknown>,
  block: string,
  key: string,
  invalidBooleans: string[],
): boolean | undefined {
  if (!hasCaseInsensitive(frontmatter, key)) {
    return undefined;
  }
  const rawValue = getRawFrontmatterValue(block, key);
  const value = parseBoolean(getCaseInsensitive(frontmatter, key), rawValue);
  if (value === undefined && !hasBooleanPlaceholder(rawValue)) {
    invalidBooleans.push(key);
  }
  return value;
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
  const frontmatter = isPlainObject(parsed) ? normalizeFrontmatterKeys(parsed) : {};
  const nameValue = getCaseInsensitive(frontmatter, 'name');
  const descriptionValue = getCaseInsensitive(frontmatter, 'description');
  const whenToUseValue = getCaseInsensitive(frontmatter, 'when-to-use');
  const hasCanonicalAlwaysApply = hasCaseInsensitive(frontmatter, 'always-apply');
  const hasAliasAlwaysApply = hasCaseInsensitive(frontmatter, 'alwaysapply');
  const canonicalAlwaysApplyValue = getCaseInsensitive(frontmatter, 'always-apply');
  const aliasAlwaysApplyValue = getCaseInsensitive(frontmatter, 'alwaysapply');
  const rawCanonicalAlwaysApplyValue = getRawFrontmatterValue(block, 'always-apply');
  const rawAliasAlwaysApplyValue = getRawFrontmatterValue(block, 'alwaysApply');
  const name = toScalarString(nameValue);
  let description = '';
  if (descriptionValue !== undefined) {
    description = toScalarString(descriptionValue);
  } else if (whenToUseValue !== undefined) {
    description = toScalarString(whenToUseValue);
  }
  let alwaysApply: boolean | undefined;
  const invalidBooleans: string[] = [];
  if (hasCanonicalAlwaysApply) {
    alwaysApply = parseBoolean(canonicalAlwaysApplyValue, rawCanonicalAlwaysApplyValue);
    if (alwaysApply === undefined && !hasBooleanPlaceholder(rawCanonicalAlwaysApplyValue)) {
      invalidBooleans.push('always-apply');
    }
  } else if (hasAliasAlwaysApply) {
    alwaysApply = parseBoolean(aliasAlwaysApplyValue, rawAliasAlwaysApplyValue);
    if (alwaysApply === undefined && !hasBooleanPlaceholder(rawAliasAlwaysApplyValue)) {
      invalidBooleans.push('alwaysApply');
    }
  }
  const userInvocable = extractBooleanField(frontmatter, block, 'user-invocable', invalidBooleans);
  const disableModelInvocation = extractBooleanField(
    frontmatter,
    block,
    'disable-model-invocation',
    invalidBooleans,
  );
  return {
    name,
    description,
    alwaysApply,
    userInvocable,
    disableModelInvocation,
    frontmatter,
    invalidBooleans,
  };
}
