import type { ArtifactFiles } from '~/common';

const IMPORT_REGEX = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;


export function isMarkdownFile(name: string) {
  return name.endsWith('.md') || name.endsWith('.markdown');
}

export function isHtmlFile(name: string) {
  return name.endsWith('.html');
}

export function isSvgFile(fileName: string, code = '') {
  if (fileName.endsWith('.svg')) return true;
  return code.trim().startsWith('<svg') || code.trim().startsWith('<?xml');
}


export function isMermaidFile(fileName: string, code: string) {
  if (fileName.endsWith('.mermaid') || fileName.endsWith('.mmd')) return true;
  const clean = code.trim().toLowerCase();
  const keywords = [
    'graph ', 'flowchart ', 'sequencediagram', 'classdiagram',
    'statediagram', 'erdiagram', 'gantt', 'pie ', 'gitgraph',
    'journey', 'mindmap', 'timeline', 'quadrantchart',
    'requirementdiagram', 'c4context', 'c4container'
  ];
  return keywords.some(k =>
    clean.startsWith(k) ||
    clean.startsWith('```mermaid') ||
    clean.includes('```mermaid\n' + k) ||
    clean.includes('```\n' + k)
  );
}

export function extractNpmImports(code: string): Set<string> {
  const set = new Set<string>();
  let match;
  IMPORT_REGEX.lastIndex = 0;
  while ((match = IMPORT_REGEX.exec(code)) !== null) {
    const pkg = match[1];
    if (!pkg.startsWith('.') && !pkg.startsWith('/') && !pkg.startsWith('@/')) set.add(pkg);
  }
  return set;
}

export function scanVirtualDependencies(
  code: string,
  availableFiles: Record<string, string>,
  found: Set<string> = new Set()
): Set<string> {
  let match;
  IMPORT_REGEX.lastIndex = 0;
  while ((match = IMPORT_REGEX.exec(code)) !== null) {
    const importPath = match[1];
    const candidates = [
      importPath,
      importPath.replace('@/', '/'),
      importPath + '.tsx',
      importPath.replace('@/', '/') + '.tsx',
      importPath + '.ts',
      importPath.replace('@/', '/') + '.ts'
    ];
    const matchedKey = candidates.find(key => availableFiles[key] !== undefined);
    if (matchedKey && !found.has(matchedKey)) {
      found.add(matchedKey);
      scanVirtualDependencies(availableFiles[matchedKey], availableFiles, found);
    }
  }
  return found;
}

export function cleanMermaid(code: string): string {
  let clean = code
    .replace(/^```mermaid\s*/gim, '')
    .replace(/^```\s*/gm, '')
    .replace(/```\s*$/gm, '')
    .trim();

  clean = clean
    .split('\n')
    .map(line => line.replace(/--!?>\s*$/, '').replace(/->\s*$/, '').replace(/---\s*$/, '').replace(/--\s*$/, ''))
    .filter(line => line.trim() !== '')
    .join('\n')
    .replace(/--\s+>/g, '-->')
    .replace(/-\s+->/g, '-->')
    .replace(/\s+---\s+/g, ' --- ')
    .replace(/\r\n/g, '\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();

  const first = clean.split('\n')[0]?.toLowerCase() || '';
  const keywords = [
    'graph','flowchart','sequencediagram','classdiagram','statediagram',
    'erdiagram','gantt','pie','gitgraph','journey','mindmap','timeline'
  ];
  if (!keywords.some(k => first.startsWith(k)) && clean) {
    clean = clean.includes('participant') ? 'sequenceDiagram\n' + clean
      : clean.includes('class ') ? 'classDiagram\n' + clean
      : 'flowchart TD\n' + clean;
  }
  return clean;
}

export function sanitizeSvg(input: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, 'image/svg+xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return '';
    }

    const blockedTags = new Set([
      'script',
      'foreignobject',
    ]);

    const urlAttrs = new Set([
      'href',
      'xlink:href',
    ]);

    const isSafeUrl = (value: string) => {
      const v = value.trim().toLowerCase();

      if (
        v.startsWith('#') ||
        v.startsWith('/') ||
        v.startsWith('./') ||
        v.startsWith('../') ||
        v.startsWith('http://') ||
        v.startsWith('https://') ||
        v.startsWith('data:image/')
      ) {
        return true;
      }

      return false;
    };

    const walk = (el: Element) => {
      const tag = el.tagName.toLowerCase();

      if (blockedTags.has(tag)) {
        el.remove();
        return;
      }

      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }

        if (urlAttrs.has(name) && !isSafeUrl(value)) {
          el.removeAttribute(attr.name);
          continue;
        }
      }

      for (const child of Array.from(el.children)) {
        walk(child);
      }
    };

    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== 'svg') {
      return '';
    }

    walk(root);
    return new XMLSerializer().serializeToString(root);
  } catch {
    return '';
  }
}



type FileLike = string | { code?: string; content?: string };

/**
 * Builds normalized runtime file map.
 * - Optionally injects shared files (React only)
 * - Excludes html shell files from module graph
 * - Artifact files override shared files
 */
export function buildRuntimeFileMap({
  files,
  sharedFiles = {},
  includeShared = false,
}: {
  files?: ArtifactFiles | Record<string, FileLike>;
  sharedFiles?: Record<string, string>;
  includeShared?: boolean;
}): Record<string, string> {
  const fileMap: Record<string, string> = {};

  if (includeShared) {
    Object.entries(sharedFiles).forEach(([path, content]) => {
      const normalized = normalizeArtifactPath(path);

      // prevent HTML docs entering JS module graph
      if (normalized === '/public/index.html' || normalized.endsWith('.html')) return;

      if (typeof content === 'string' && content.length > 0) {
        fileMap[normalized] = content;
      }
    });
  }

  Object.entries(files ?? {}).forEach(([path, fileObj]) => {
    const content = extractFileContent(fileObj);
    if (!content) return;

    fileMap[normalizeArtifactPath(path)] = content;
  });

  return fileMap;
}

export function normalizeArtifactPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export function extractFileContent(fileObj: FileLike | undefined): string {
  if (!fileObj) return '';
  if (typeof fileObj === 'string') return fileObj;
  return fileObj.code ?? fileObj.content ?? '';
}

export type ArtifactKind = 'html' | 'svg' | 'mermaid' | 'markdown' | 'react';

export function resolveArtifactKind(fileName: string, code: string): ArtifactKind {
  if (isHtmlFile(fileName)) return 'html';
  if (isSvgFile(fileName, code)) return 'svg';
  if (isMermaidFile(fileName, code)) return 'mermaid';
  if (isMarkdownFile(fileName)) return 'markdown';
  return 'react';
}