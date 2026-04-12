import { memo, useMemo, useState, createContext, useContext } from 'react';
import { OGDialog, OGDialogTrigger, OGDialogTemplate, useToastContext } from '@librechat/client';
import {
  Trash,
  Folder,
  FileCode,
  FileJson,
  FileText,
  FileImage,
  FolderOpen,
  ChevronRight,
  File as FileIcon,
} from 'lucide-react';
import type { TSkillFile } from 'librechat-data-provider';
import type { LucideIcon } from 'lucide-react';
import type { TreeNode } from './tree';
import { useDeleteSkillFileMutation } from '~/data-provider';
import { buildTree, nodeKey } from './tree';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface SkillFileTreeProps {
  skillId: string;
  files: TSkillFile[];
  canEdit: boolean;
}

interface TreeContextValue {
  canEdit: boolean;
  isDeleting: boolean;
  onDeleteFile: (relativePath: string) => void;
}

const TreeContext = createContext<TreeContextValue>({
  canEdit: false,
  isDeleting: false,
  onDeleteFile: () => {},
});

const CODE_EXT = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.sh', '.yaml', '.yml', '.toml']);
const JSON_EXT = new Set(['.json', '.jsonl']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico']);

function getFileIcon(name: string): LucideIcon {
  const dot = name.lastIndexOf('.');
  if (dot === -1) {
    return FileText;
  }
  const ext = name.slice(dot).toLowerCase();
  if (CODE_EXT.has(ext)) {
    return FileCode;
  }
  if (JSON_EXT.has(ext)) {
    return FileJson;
  }
  if (IMAGE_EXT.has(ext)) {
    return FileImage;
  }
  if (ext === '.md' || ext === '.txt') {
    return FileText;
  }
  return FileIcon;
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
}

// Memoed because the tree recursively renders one row per file/folder node.
// Without this, toggling a single folder's expanded state would re-render
// every sibling and cousin row in the tree. Props are referentially stable
// (TreeNode objects come from `useMemo` on files in the parent).
const TreeRow = memo(function TreeRow({ node, depth }: TreeRowProps) {
  const localize = useLocalize();
  const { canEdit, isDeleting, onDeleteFile } = useContext(TreeContext);
  const [expanded, setExpanded] = useState(depth === 0);

  if (node.type === 'folder') {
    const FolderIconComponent = expanded ? FolderOpen : Folder;
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="group/row flex w-full items-center gap-1.5 rounded-md py-1 pr-1 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          aria-expanded={expanded}
          aria-label={node.name}
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-150',
              expanded && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <FolderIconComponent className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="min-w-0 truncate">{node.name}</span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <TreeRow key={nodeKey(child)} node={child} depth={depth + 1} />
          ))}
      </>
    );
  }

  const Icon = getFileIcon(node.name);

  return (
    <div
      className="group/file flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm text-text-secondary"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="w-3.5 shrink-0" aria-hidden="true" />
      <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate" title={node.relativePath}>
        {node.name}
      </span>
      {canEdit && (
        <OGDialog>
          <OGDialogTrigger asChild>
            <button
              type="button"
              disabled={isDeleting}
              className="shrink-0 rounded p-0.5 text-text-tertiary opacity-0 transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 group-hover/file:opacity-100"
              aria-label={localize('com_ui_delete_var', { 0: node.name })}
            >
              <Trash className="size-3.5" />
            </button>
          </OGDialogTrigger>
          <OGDialogTemplate
            showCloseButton={false}
            title={localize('com_ui_delete')}
            className="max-w-[450px]"
            main={
              <p className="text-left text-sm text-text-primary">
                {localize('com_ui_skill_file_delete_confirm', { 0: node.relativePath })}
              </p>
            }
            selection={{
              selectHandler: () => onDeleteFile(node.relativePath),
              selectClasses:
                'bg-surface-destructive hover:bg-surface-destructive-hover transition-colors duration-200 text-white',
              selectText: localize('com_ui_delete'),
            }}
          />
        </OGDialog>
      )}
    </div>
  );
});

function SkillFileTree({ skillId, files, canEdit }: SkillFileTreeProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const tree = useMemo(() => buildTree(files), [files]);

  const { mutate: mutateDelete, isLoading: isDeleting } = useDeleteSkillFileMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_skill_file_deleted') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_skill_file_delete_error') });
    },
  });

  /**
   * `mutate` is a stable reference from React Query, so we can use it as a
   * memo dep without the memo invalidating every render. Inlining the arrow
   * here keeps the closure over `skillId` fresh without a separate
   * `useCallback` (which would recreate on every mutation state change).
   */
  const contextValue = useMemo<TreeContextValue>(
    () => ({
      canEdit,
      isDeleting,
      onDeleteFile: (relativePath: string) => mutateDelete({ skillId, relativePath }),
    }),
    [canEdit, isDeleting, mutateDelete, skillId],
  );

  if (tree.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-text-tertiary">{localize('com_ui_skill_files_empty')}</p>
    );
  }

  return (
    <TreeContext.Provider value={contextValue}>
      <div
        className="flex flex-col gap-0.5"
        role="tree"
        aria-label={localize('com_ui_skill_files')}
      >
        {tree.map((node) => (
          <TreeRow key={nodeKey(node)} node={node} depth={0} />
        ))}
      </div>
    </TreeContext.Provider>
  );
}

// Not memoed: the component renders once per detail panel, and its parent
// `SkillDetailPanel` only re-renders when query data or permissions change —
// all cases where we actually want the tree to refresh. `TreeRow` handles
// the hot-path memoization.
export default SkillFileTree;
