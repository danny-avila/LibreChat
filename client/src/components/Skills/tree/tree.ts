import type { TSkillFile } from 'librechat-data-provider';

/** A concrete file node in the skill file tree. */
export interface FileNode {
  type: 'file';
  name: string;
  relativePath: string;
  file: TSkillFile;
}

/** A synthetic folder node derived from shared path prefixes. */
export interface FolderNode {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | FolderNode;

/**
 * Group a flat list of {@link TSkillFile} rows into a nested tree keyed on
 * `relativePath`. Files are sorted lexicographically so the output is
 * deterministic, folders before files at each level isn't enforced — the
 * natural path sort already produces a reasonable ordering for most cases.
 *
 * Pure function. Safe to unit test without a DOM.
 */
export function buildTree(files: TSkillFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderIndex = new Map<string, FolderNode>();

  const sorted = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const file of sorted) {
    const segments = file.relativePath.split('/').filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    let parentList = root;
    let parentPath = '';

    for (let i = 0; i < segments.length - 1; i++) {
      const name = segments[i];
      const path = parentPath ? `${parentPath}/${name}` : name;
      let folder = folderIndex.get(path);
      if (!folder) {
        folder = { type: 'folder', name, path, children: [] };
        folderIndex.set(path, folder);
        parentList.push(folder);
      }
      parentList = folder.children;
      parentPath = path;
    }

    parentList.push({
      type: 'file',
      name: segments[segments.length - 1],
      relativePath: file.relativePath,
      file,
    });
  }

  return root;
}

/** Stable `key` prop for a tree node — used by React list reconciliation. */
export function nodeKey(node: TreeNode): string {
  return node.type === 'folder' ? `folder:${node.path}` : `file:${node.relativePath}`;
}
