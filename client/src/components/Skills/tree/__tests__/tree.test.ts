import type { TSkillFile } from 'librechat-data-provider';
import { buildTree, nodeKey } from '../tree';

function makeFile(relativePath: string): TSkillFile {
  return {
    _id: `id-${relativePath}`,
    skillId: 'skill-1',
    relativePath,
    file_id: `file-${relativePath}`,
    filename: relativePath.split('/').pop() ?? relativePath,
    filepath: `/uploads/${relativePath}`,
    source: 'local' as TSkillFile['source'],
    mimeType: 'text/plain',
    bytes: 42,
    category: 'other',
    isExecutable: false,
    author: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('buildTree', () => {
  it('returns an empty array for no files', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('flattens a single root-level file into one file node', () => {
    const tree = buildTree([makeFile('README.md')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ type: 'file', name: 'README.md', relativePath: 'README.md' });
  });

  it('groups two root-level files under the same parent list', () => {
    const tree = buildTree([makeFile('a.md'), makeFile('b.md')]);
    expect(tree.map((n) => (n.type === 'file' ? n.name : n.path))).toEqual(['a.md', 'b.md']);
  });

  it('creates a folder node for shared prefixes', () => {
    const tree = buildTree([makeFile('scripts/lint.sh'), makeFile('scripts/build.sh')]);
    expect(tree).toHaveLength(1);
    const scripts = tree[0];
    expect(scripts.type).toBe('folder');
    if (scripts.type !== 'folder') {
      throw new Error('expected folder node');
    }
    expect(scripts.name).toBe('scripts');
    expect(scripts.path).toBe('scripts');
    expect(scripts.children.map((c) => (c.type === 'file' ? c.name : c.path))).toEqual([
      'build.sh',
      'lint.sh',
    ]);
  });

  it('handles mixed root files and nested folders in a single pass', () => {
    const tree = buildTree([
      makeFile('README.md'),
      makeFile('references/guide.md'),
      makeFile('references/deep/inner.md'),
      makeFile('scripts/lint.sh'),
    ]);

    // Lexicographic sort: 'README.md' (R=82) < 'references/...' (r=114) < 'scripts/...'
    const topLevelKinds = tree.map((n) => n.type);
    expect(topLevelKinds).toEqual(['file', 'folder', 'folder']);

    const references = tree.find((n) => n.type === 'folder' && n.name === 'references');
    if (!references || references.type !== 'folder') {
      throw new Error('expected references folder node');
    }
    const deep = references.children.find((c) => c.type === 'folder');
    expect(deep).toBeDefined();
    if (deep && deep.type === 'folder') {
      expect(deep.path).toBe('references/deep');
      expect(deep.children).toHaveLength(1);
      expect(deep.children[0]).toMatchObject({ type: 'file', name: 'inner.md' });
    }
  });

  it('sorts files lexicographically before building the tree', () => {
    const tree = buildTree([makeFile('scripts/zzz.sh'), makeFile('scripts/aaa.sh')]);
    const scripts = tree[0];
    if (scripts.type !== 'folder') {
      throw new Error('expected folder node');
    }
    const names = scripts.children.map((c) => (c.type === 'file' ? c.name : c.path));
    expect(names).toEqual(['aaa.sh', 'zzz.sh']);
  });

  it('ignores rows whose relativePath is empty or whitespace-only', () => {
    const tree = buildTree([makeFile('')]);
    expect(tree).toEqual([]);
  });

  it('reuses the same folder node for siblings in deeper paths', () => {
    const tree = buildTree([makeFile('a/b/c/d.md'), makeFile('a/b/c/e.md'), makeFile('a/b/f.md')]);
    const a = tree[0];
    if (a.type !== 'folder') {
      throw new Error('expected folder node');
    }
    expect(a.children).toHaveLength(1);
    const b = a.children[0];
    if (b.type !== 'folder') {
      throw new Error('expected folder node');
    }
    // b has one child folder "c" and one child file "f.md"
    expect(b.children).toHaveLength(2);
    const kinds = b.children.map((c) => c.type).sort();
    expect(kinds).toEqual(['file', 'folder']);
  });

  it('produces stable, distinct keys via nodeKey', () => {
    // Lexicographic sort: 'a.md' < 'dir/b.md', so the file comes first at the root.
    const tree = buildTree([makeFile('a.md'), makeFile('dir/b.md')]);
    const keys = tree.map(nodeKey);
    expect(keys).toEqual(['file:a.md', 'folder:dir']);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
