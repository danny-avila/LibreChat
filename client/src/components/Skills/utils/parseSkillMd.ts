import { InvocationMode } from 'librechat-data-provider';
import { parseFrontmatter } from './frontmatter';

export interface ParsedSkillMd {
  name: string;
  description: string;
  invocationMode: InvocationMode | '';
}

const VALID_INVOCATION_MODES = new Set<string>(Object.values(InvocationMode));

/**
 * Parses a SKILL.md file's YAML frontmatter into structured fields.
 * Delegates to the shared `parseFrontmatter` utility and maps the
 * generic fields to the typed `ParsedSkillMd` shape.
 */
export function parseSkillMd(raw: string): ParsedSkillMd {
  const { fields } = parseFrontmatter(raw);
  const result: ParsedSkillMd = { name: '', description: '', invocationMode: '' };

  for (const { key, value } of fields) {
    const lower = key.toLowerCase();
    if (lower === 'name') {
      result.name = value;
    } else if (lower === 'description') {
      result.description = value;
    } else if (lower === 'invocationmode') {
      result.invocationMode = VALID_INVOCATION_MODES.has(value) ? (value as InvocationMode) : '';
    }
  }

  return result;
}
