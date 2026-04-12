import { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { ScrollText, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FixedSizeTree } from 'react-vtree';
import type { FixedSizeNodeData, TreeWalkerValue, TreeWalker } from 'react-vtree';
import type { TSkill, TSkillFile } from 'librechat-data-provider';
import { useListSkillFilesQuery } from '~/data-provider';
import { cn } from '~/utils';

interface SkillListItemProps {
  skill: TSkill;
  isActive: boolean;
}

/* -------------------------------------------------------------------------- */
/* Tree data model                                                            */
/* -------------------------------------------------------------------------- */

interface TreeEntry {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: TreeEntry[];
}

interface FileNodeData extends FixedSizeNodeData {
  name: string;
  nodeType: 'file' | 'folder';
  path: string;
  depth: number;
  isLeaf: boolean;
}

interface NodeMeta {
  entry: TreeEntry;
  depth: number;
}

interface TreeItemCallbacks {
  onFileClick: (path: string) => void;
  onToggle: (id: string, isOpen: boolean) => void;
}

const ITEM_SIZE = 28;
const MAX_HEIGHT = 350;

/** Build a nested tree from flat TSkillFile paths. Always includes SKILL.md. */
function buildFileTree(files: TSkillFile[]): TreeEntry[] {
  const root: TreeEntry[] = [];
  const folderMap = new Map<string, TreeEntry>();

  root.push({ name: 'SKILL.md', type: 'file', path: 'SKILL.md' });

  const sorted = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const file of sorted) {
    const segments = file.relativePath.split('/').filter(Boolean);
    if (segments.length === 0) {
      continue;
    }
    if (segments.length === 1) {
      root.push({ name: segments[0], type: 'file', path: file.relativePath });
    } else {
      let parentList = root;
      let parentPath = '';
      for (let i = 0; i < segments.length - 1; i++) {
        const folderName = segments[i];
        const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        let folder = folderMap.get(folderPath);
        if (!folder) {
          folder = { name: folderName, type: 'folder', path: folderPath, children: [] };
          folderMap.set(folderPath, folder);
          parentList.push(folder);
        }
        parentList = folder.children!;
        parentPath = folderPath;
      }
      parentList.push({
        name: segments[segments.length - 1],
        type: 'file',
        path: file.relativePath,
      });
    }
  }

  return root;
}

/** Count visible nodes for dynamic height calculation. */
function countVisible(entries: TreeEntry[], openIds: Set<string>): number {
  let n = 0;
  for (const entry of entries) {
    n++;
    if (entry.type === 'folder' && openIds.has(entry.path) && entry.children) {
      n += countVisible(entry.children, openIds);
    }
  }
  return n;
}

function getNodeData(entry: TreeEntry, depth: number): TreeWalkerValue<FileNodeData, NodeMeta> {
  return {
    data: {
      id: entry.path,
      isOpenByDefault: false,
      name: entry.name,
      nodeType: entry.type,
      path: entry.path,
      depth,
      isLeaf: entry.type === 'file',
    },
    entry,
    depth,
  };
}

/* -------------------------------------------------------------------------- */
/* Node renderer                                                              */
/* -------------------------------------------------------------------------- */

function FileTreeNode({
  data,
  isOpen,
  setOpen,
  style,
  treeData,
}: {
  style: React.CSSProperties;
  data: FileNodeData;
  isOpen: boolean;
  setOpen: (state: boolean) => Promise<void>;
  treeData?: TreeItemCallbacks;
}) {
  const isFolder = data.nodeType === 'folder';
  const indent = data.depth * 16 + (isFolder ? 8 : 24);

  return (
    <button
      type="button"
      style={{ ...style, paddingLeft: `${indent}px` }}
      onClick={(e) => {
        e.stopPropagation();
        if (isFolder) {
          const next = !isOpen;
          setOpen(next);
          treeData?.onToggle(data.id, next);
        } else {
          treeData?.onFileClick(data.path);
        }
      }}
      className="flex w-full select-none items-center gap-1.5 rounded-lg text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
      aria-expanded={isFolder ? isOpen : undefined}
    >
      {isFolder && (
        <>
          <ChevronRight
            className={cn(
              'size-3 shrink-0 transition-transform duration-150',
              isOpen && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <Folder className="size-3.5 shrink-0" aria-hidden="true" />
        </>
      )}
      <span className="min-w-0 truncate">{data.name}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline virtualized file tree                                               */
/* -------------------------------------------------------------------------- */

function InlineFileTree({
  files,
  onFileClick,
}: {
  files: TSkillFile[];
  onFileClick: (path: string) => void;
}) {
  const treeEntries = useMemo(() => buildFileTree(files), [files]);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const visibleCount = useMemo(() => countVisible(treeEntries, openIds), [treeEntries, openIds]);

  const height = Math.min(visibleCount * ITEM_SIZE, MAX_HEIGHT);

  const handleToggle = useCallback((id: string, isOpen: boolean) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (isOpen) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const callbacks = useMemo<TreeItemCallbacks>(
    () => ({ onFileClick, onToggle: handleToggle }),
    [onFileClick, handleToggle],
  );

  type WalkerReturn = ReturnType<TreeWalker<FileNodeData, NodeMeta>>;

  const treeWalker = useMemo<TreeWalker<FileNodeData, NodeMeta>>(() => {
    const walker: TreeWalker<FileNodeData, NodeMeta> = function* (): WalkerReturn {
      for (const entry of treeEntries) {
        yield getNodeData(entry, 0);
      }
      while (true) {
        const parent: TreeWalkerValue<FileNodeData, NodeMeta> = yield;
        for (const child of parent.entry.children ?? []) {
          yield getNodeData(child, parent.depth + 1);
        }
      }
    };
    return walker;
  }, [treeEntries]);

  if (treeEntries.length === 0) {
    return null;
  }

  return (
    <FixedSizeTree<FileNodeData>
      treeWalker={treeWalker}
      itemSize={ITEM_SIZE}
      height={height}
      width="100%"
      itemData={callbacks}
    >
      {FileTreeNode}
    </FixedSizeTree>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

function SkillListItem({ skill, isActive }: SkillListItemProps) {
  const navigate = useNavigate();
  const hasFiles = skill.fileCount > 0;
  const [expanded, setExpanded] = useState(isActive && hasFiles);

  // Auto-expand when navigating directly to this skill
  useEffect(() => {
    if (isActive && hasFiles) {
      setExpanded(true);
    }
  }, [isActive, hasFiles]);

  // Prefetch files for active skill or already-expanded skills (eliminates lag)
  const filesQuery = useListSkillFilesQuery(skill._id, {
    enabled: hasFiles && (isActive || expanded),
  });
  const files = useMemo(() => filesQuery.data?.files ?? [], [filesQuery.data]);

  const handleSkillClick = useCallback(() => {
    navigate(`/skills/${skill._id}`);
    if (hasFiles) {
      setExpanded((prev) => !prev);
    }
  }, [navigate, skill._id, hasFiles]);

  const handleFileClick = useCallback(
    (path: string) => {
      navigate(`/skills/${skill._id}?file=${encodeURIComponent(path)}`);
    },
    [navigate, skill._id],
  );

  return (
    <div className="flex flex-col gap-px">
      {/* Skill row */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleSkillClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSkillClick();
          }
        }}
        className={cn(
          'flex w-full cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm transition-colors',
          isActive
            ? 'bg-surface-active text-text-primary'
            : 'text-text-primary hover:bg-surface-hover',
        )}
        aria-current={isActive ? 'true' : undefined}
        aria-expanded={hasFiles ? expanded : undefined}
      >
        <span className="flex size-6 shrink-0 items-center justify-center">
          <span className="flex size-6 items-center justify-center rounded-md border border-border-light bg-surface-primary shadow-sm">
            <ScrollText className="size-3.5 text-text-secondary" aria-hidden="true" />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className={cn('truncate', isActive && 'font-semibold')}>{skill.name}</span>
        </span>

        {hasFiles && (
          <ChevronDown
            className={cn(
              '-mr-1 size-3.5 shrink-0 text-text-secondary transition-transform duration-200',
              !expanded && '-rotate-90',
            )}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Inline file tree */}
      <div
        className={cn(
          'ml-10 overflow-hidden transition-all duration-200 ease-in-out',
          expanded && hasFiles ? 'opacity-100' : 'max-h-0 opacity-0',
        )}
        style={expanded && hasFiles ? { maxHeight: `${MAX_HEIGHT}px` } : undefined}
        inert={!expanded ? '' : undefined}
      >
        <InlineFileTree files={files} onFileClick={handleFileClick} />
      </div>
    </div>
  );
}

export default memo(SkillListItem);
