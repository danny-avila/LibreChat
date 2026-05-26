import yaml from 'js-yaml';

export type ParsedSkillMarkdown = {
  name: string;
  description: string;
  alwaysApply?: boolean;
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
  if (!content.startsWith('---\n')) {
    return null;
  }
  const closingIdx = content.indexOf('\n---', 4);
  if (closingIdx === -1) {
    return null;
  }
  return content.slice(4, closingIdx);
}

function getCaseInsensitive(frontmatter: Record<string, unknown>, key: string): unknown {
  const entry = Object.entries(frontmatter).find(([candidate]) => candidate.toLowerCase() === key);
  return entry?.[1];
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
    acc[key.toLowerCase()] = value;
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
  const alwaysApplyValue = getCaseInsensitive(frontmatter, 'always-apply');
  const rawAlwaysApplyValue = getRawFrontmatterValue(block, 'always-apply');
  const name = typeof nameValue === 'string' ? nameValue : '';
  let description = '';
  if (typeof descriptionValue === 'string') {
    description = descriptionValue;
  } else if (typeof whenToUseValue === 'string') {
    description = whenToUseValue;
  }
  let alwaysApply: boolean | undefined;
  const invalidBooleans: string[] = [];
  if (alwaysApplyValue !== undefined) {
    alwaysApply = parseBoolean(alwaysApplyValue, rawAlwaysApplyValue);
    if (alwaysApply === undefined && alwaysApplyValue !== null && alwaysApplyValue !== '') {
      invalidBooleans.push('always-apply');
    }
  }
  return {
    name,
    description,
    alwaysApply,
    frontmatter,
    invalidBooleans,
  };
}
