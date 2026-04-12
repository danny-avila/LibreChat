import { InvocationMode } from 'librechat-data-provider';

export interface ParsedSkillMd {
  name: string;
  description: string;
  invocationMode: InvocationMode | '';
}

const FRONTMATTER_DELIMITER = '---';
const VALID_INVOCATION_MODES = new Set<string>(Object.values(InvocationMode));

/**
 * Parses a SKILL.md file's YAML frontmatter into structured fields.
 * Unrecognised frontmatter keys are silently ignored.
 */
export function parseSkillMd(raw: string): ParsedSkillMd {
  const trimmed = raw.trim();
  const result: ParsedSkillMd = {
    name: '',
    description: '',
    invocationMode: '',
  };

  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return result;
  }

  const afterFirstDelimiter = trimmed.slice(FRONTMATTER_DELIMITER.length);
  const closingIndex = afterFirstDelimiter.indexOf(`\n${FRONTMATTER_DELIMITER}`);

  if (closingIndex === -1) {
    return result;
  }

  const frontmatterBlock = afterFirstDelimiter.slice(0, closingIndex);

  const lines = frontmatterBlock.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (key === 'name') {
      result.name = value;
    } else if (key === 'description') {
      result.description = value;
    } else if (key === 'invocationmode') {
      result.invocationMode = VALID_INVOCATION_MODES.has(value) ? (value as InvocationMode) : '';
    }
  }

  return result;
}
