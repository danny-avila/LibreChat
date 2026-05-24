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
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return null;
  }
  const closingIdx = normalized.indexOf('\n---', 4);
  if (closingIdx === -1) {
    return null;
  }
  return normalized.slice(4, closingIdx);
}

function getCaseInsensitive(frontmatter: Record<string, unknown>, key: string): unknown {
  const entry = Object.entries(frontmatter).find(([candidate]) => candidate.toLowerCase() === key);
  return entry?.[1];
}

function normalizeFrontmatterKeys(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(frontmatter).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key.toLowerCase()] = value;
    return acc;
  }, {});
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
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
    alwaysApply = parseBoolean(alwaysApplyValue);
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
