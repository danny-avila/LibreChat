/**
 * Identify links that should never be rewritten to a skill file route:
 * external URLs, absolute app paths, in-page anchors, mailto/tel,
 * and protocol-relative URLs.
 */
export function isExternalSkillLink(href: string): boolean {
  if (!href) {
    return true;
  }
  if (href.startsWith('#') || href.startsWith('/')) {
    return true;
  }
  if (href.startsWith('//')) {
    return true;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

interface SplitHref {
  path: string;
  hash: string;
}

/**
 * Split `path#hash` (used to preserve in-file anchors when rewriting the link).
 */
export function splitHrefHash(href: string): SplitHref {
  const hashIdx = href.indexOf('#');
  if (hashIdx === -1) {
    return { path: href, hash: '' };
  }
  return { path: href.slice(0, hashIdx), hash: href.slice(hashIdx) };
}

/**
 * Resolve a relative href from inside a skill markdown file to an absolute
 * path inside the skill bundle (no leading slash, POSIX separators).
 *
 * `currentFilePath` is the skill-relative path of the file containing the
 * link (e.g. `SKILL.md` or `references/notes.md`). When omitted, the link
 * is resolved from the skill root.
 */
export function resolveSkillRelativePath(href: string, currentFilePath?: string): string {
  const baseDir = currentFilePath ? currentFilePath.split('/').slice(0, -1) : [];
  const segments = href.split('/');
  const resolved: string[] = [...baseDir];
  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join('/');
}
