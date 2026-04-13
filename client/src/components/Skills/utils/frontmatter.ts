export interface FrontmatterField {
  key: string;
  value: string;
}

export interface ParsedFrontmatter {
  fields: FrontmatterField[];
  body: string;
}

/**
 * Strip YAML frontmatter (`---\n...\n---`) from markdown content and return
 * the frontmatter fields as key-value pairs + the remaining body.
 *
 * @param raw       The raw markdown string (may or may not have frontmatter).
 * @param skipKeys  Optional set of lowercase key names to exclude from fields
 *                  (e.g. `new Set(['name', 'description'])` to avoid duplicating
 *                  fields already shown in the header).
 */
export function parseFrontmatter(raw: string, skipKeys?: Set<string>): ParsedFrontmatter {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) {
    return { fields: [], body: raw };
  }
  const after = trimmed.slice(3);
  const closingIdx = after.indexOf('\n---');
  if (closingIdx === -1) {
    return { fields: [], body: raw };
  }

  const block = after.slice(0, closingIdx);
  const body = after.slice(closingIdx + 4).trim();

  const fields: FrontmatterField[] = [];
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    if (!key) {
      continue;
    }
    if (skipKeys?.has(key.toLowerCase())) {
      continue;
    }
    let value = line.slice(colon + 1).trim();
    if (!value) {
      const items: string[] = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        const item = next.trim();
        if (!item.startsWith('-')) {
          break;
        }
        items.push(item.slice(1).trim());
        i++;
      }
      value = items.join(',');
    }
    if (value) {
      fields.push({ key, value });
    }
  }

  return { fields, body };
}
