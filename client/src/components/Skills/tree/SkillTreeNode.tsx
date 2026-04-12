import { memo, useCallback, useContext, createContext, useState } from 'react';
import {
  FileText,
  FileCode,
  FileJson,
  FileImage,
  Folder,
  FolderOpen,
  ChevronRight,
  Pencil,
  Trash,
} from 'lucide-react';
import { OGDialog, OGDialogTrigger, OGDialogTemplate } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import type { NodeRendererProps } from 'react-arborist';

interface SkillTreeData {
  id: string;
  name: string;
  nodeType: 'file' | 'folder';
  fileId?: string;
  children?: SkillTreeData[];
}

interface TreeActions {
  onDeleteNode: (nodeId: string) => void;
}

export const TreeActionsContext = createContext<TreeActions>({ onDeleteNode: () => {} });

const CODE_EXTENSIONS = new Set([
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.py',
  '.sh',
  '.css',
  '.html',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
]);
const JSON_EXTENSIONS = new Set(['.json', '.jsonl']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico']);

function getFileIcon(name: string) {
  const lower = name.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (CODE_EXTENSIONS.has(ext)) {
    return { Icon: FileCode, className: 'text-text-secondary' };
  }
  if (JSON_EXTENSIONS.has(ext)) {
    return { Icon: FileJson, className: 'text-text-secondary' };
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { Icon: FileImage, className: 'text-text-secondary' };
  }
  return { Icon: FileText, className: 'text-text-secondary' };
}

function SkillTreeNode({ node, style, dragHandle }: NodeRendererProps<SkillTreeData>) {
  const localize = useLocalize();
  const isFolder = node.data.nodeType === 'folder';
  const isOpen = node.isOpen;
  const isSelected = node.isSelected;
  const { onDeleteNode } = useContext(TreeActionsContext);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleClick = useCallback(() => {
    if (isFolder) {
      node.toggle();
    } else {
      node.select();
    }
  }, [node, isFolder]);

  const handleRename = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      node.edit();
    },
    [node],
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.shiftKey) {
        onDeleteNode(node.id);
        return;
      }
      setDeleteOpen(true);
    },
    [node.id, onDeleteNode],
  );

  const handleDeleteConfirm = useCallback(() => {
    onDeleteNode(node.id);
    setDeleteOpen(false);
  }, [node.id, onDeleteNode]);

  const fileIcon = !isFolder ? getFileIcon(node.data.name) : null;

  return (
    <div
      ref={dragHandle}
      style={style}
      role="treeitem"
      aria-label={node.data.name}
      aria-selected={isSelected}
      aria-expanded={isFolder ? isOpen : undefined}
      className={cn(
        'group flex cursor-pointer items-center gap-1.5 rounded-lg py-1 pl-2 pr-1 text-sm',
        isSelected
          ? 'bg-surface-active text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover',
      )}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleClick();
        }
        if (e.key === 'F2') {
          e.preventDefault();
          node.edit();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (e.shiftKey) {
            onDeleteNode(node.id);
          } else {
            setDeleteOpen(true);
          }
        }
      }}
    >
      {isFolder ? (
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-text-secondary',
            'ease-[cubic-bezier(0.32,0.72,0,1)] transition-transform duration-300',
            isOpen && 'rotate-90',
          )}
          aria-hidden="true"
        />
      ) : (
        <span className="w-3.5" />
      )}
      {isFolder && (
        <span className="relative size-4 shrink-0">
          <FolderOpen
            className={cn(
              'absolute inset-0 size-4 text-text-secondary',
              'ease-[cubic-bezier(0.32,0.72,0,1)] transition-opacity duration-300',
              isOpen ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden="true"
          />
          <Folder
            className={cn(
              'absolute inset-0 size-4 text-text-secondary',
              'ease-[cubic-bezier(0.32,0.72,0,1)] transition-opacity duration-300',
              isOpen ? 'opacity-0' : 'opacity-100',
            )}
            aria-hidden="true"
          />
        </span>
      )}
      {fileIcon && (
        <fileIcon.Icon className={cn('size-4 shrink-0', fileIcon.className)} aria-hidden="true" />
      )}
      {node.isEditing ? (
        <input
          type="text"
          defaultValue={node.data.name}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-label={localize('com_ui_rename')}
          className="min-w-0 flex-1 rounded-md border-none bg-transparent py-0 pl-0 text-sm text-text-primary outline-none ring-1 ring-border-medium focus:ring-ring-primary"
          onBlur={() => node.reset()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              node.submit(e.currentTarget.value);
            }
            if (e.key === 'Escape') {
              node.reset();
            }
          }}
        />
      ) : (
        <>
          <span className={cn('min-w-0 flex-1 truncate', isSelected && 'font-medium')}>
            {node.data.name}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-px opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              className="rounded p-1 text-text-secondary transition-colors duration-100 hover:bg-surface-tertiary hover:text-text-primary"
              onClick={handleRename}
              aria-label={localize('com_ui_rename_var', { 0: node.data.name })}
              tabIndex={-1}
            >
              <Pencil className="size-3.5" />
            </button>
            <OGDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <OGDialogTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1 text-text-secondary transition-colors duration-100 hover:bg-surface-tertiary hover:text-text-primary"
                  onClick={handleDeleteClick}
                  aria-label={localize('com_ui_delete_var', { 0: node.data.name })}
                  tabIndex={-1}
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
                    {isFolder
                      ? localize('com_ui_delete_folder_confirm_var', { 0: node.data.name })
                      : localize('com_ui_delete_skill_confirm_var', { 0: node.data.name })}
                  </p>
                }
                selection={{
                  selectHandler: handleDeleteConfirm,
                  selectClasses:
                    'bg-surface-destructive hover:bg-surface-destructive-hover transition-colors duration-200 text-white',
                  selectText: localize('com_ui_delete'),
                }}
              />
            </OGDialog>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(SkillTreeNode);
export type { SkillTreeData };
