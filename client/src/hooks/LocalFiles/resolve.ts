/** Resolves a requested file/directory name against directory entries (exact, then case-insensitive). */

export function normalizeEntryName(name: string): string {
  return name.trim().normalize('NFC');
}

export function tryDecodeFileName(name: string): string {
  const normalized = normalizeEntryName(name);
  if (!normalized.includes('%')) {
    return normalized;
  }
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

export function findEntryName(entries: string[], requested: string): string | null {
  const decoded = tryDecodeFileName(requested);
  if (entries.includes(decoded)) {
    return decoded;
  }

  const lower = decoded.toLowerCase();
  const caseMatch = entries.find((entry) => entry.toLowerCase() === lower);
  if (caseMatch) {
    return caseMatch;
  }

  return null;
}
