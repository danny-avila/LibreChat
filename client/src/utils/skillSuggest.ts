import { SKILL_NAME_MAX_LENGTH, SKILL_DESCRIPTION_MAX_LENGTH } from 'librechat-data-provider';

const stripMarkdown = (line: string): string =>
  line
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_`>#~-]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Derives a kebab-case skill name from free-form content: the first markdown
 * heading if present, otherwise the first non-empty line. Falls back to
 * `new-skill` when nothing usable is found.
 */
export function suggestSkillName(body: string): string {
  const lines = body.split('\n').map((l) => l.trim());
  const heading = lines.find((l) => /^#{1,6}\s+/.test(l));
  const source = heading ?? lines.find((l) => l.length > 0) ?? '';
  const slug = stripMarkdown(source)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_NAME_MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'new-skill';
}

/**
 * Derives a short description from the first meaningful (non-heading) line of
 * content, capped to the skill description limit.
 */
export function suggestSkillDescription(body: string): string {
  const lines = body.split('\n').map((l) => l.trim());
  const firstProse = lines.find((l) => l.length > 0 && !/^#{1,6}\s+/.test(l));
  const text = stripMarkdown(firstProse ?? lines.find((l) => l.length > 0) ?? '');
  return text.slice(0, SKILL_DESCRIPTION_MAX_LENGTH);
}
