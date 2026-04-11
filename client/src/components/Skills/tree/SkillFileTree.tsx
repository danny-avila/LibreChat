import { memo, useMemo, useState, useCallback } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  File as FileIcon,
  Trash,
} from 'lucide-react';
import { OGDialog, OGDialogTrigger, OGDialogTemplate, useToastContext } from '@librechat/client';
import type { TSkillFile } from 'librechat-data-provider';
import type { LucideIcon } from 'lucide-react';
import { useDeleteSkillFileMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface FileNode {
  type: 'file';
  name: string;
  relativePath: string;
  file: TSkillFile;
}

interface FolderNode {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}

type TreeNode = FileNode | FolderNode;

interface SkillFileTreeProps {
  skillId: string;
  files: TSkillFile[];
  canEdit: boolean;
}

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

function buildTree(files: TSkillFile[]): TreeNode[] {
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

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  canEdit: boolean;
  skillId: string;
}

const TreeRow = memo(function TreeRow({ node, depth, canEdit, skillId }: TreeRowProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const deleteFile = useDeleteSkillFileMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_skill_file_deleted') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_skill_file_delete_error') });
    },
  });

  const handleDelete = useCallback(() => {
    if (node.type !== 'file') {
      return;
    }
    deleteFile.mutate({ skillId, relativePath: node.relativePath });
  }, [deleteFile, node, skillId]);

  if (node.type === 'folder') {
    const FolderIconComponent = expanded ? FolderOpen : Folder;
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className={cn(
            'group/row flex w-full items-center gap-1.5 rounded-md py-1 pr-1 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary',
          )}
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
            <TreeRow
              key={child.type === 'folder' ? `folder:${child.path}` : `file:${child.relativePath}`}
              node={child}
              depth={depth + 1}
              canEdit={canEdit}
              skillId={skillId}
            />
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
              className="shrink-0 rounded p-0.5 text-text-tertiary opacity-0 transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100 group-hover/file:opacity-100"
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
              selectHandler: handleDelete,
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
  const tree = useMemo(() => buildTree(files), [files]);

  if (tree.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-text-tertiary">{localize('com_ui_skill_files_empty')}</p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5" role="tree" aria-label={localize('com_ui_skill_files')}>
      {tree.map((node) => (
        <TreeRow
          key={node.type === 'folder' ? `folder:${node.path}` : `file:${node.relativePath}`}
          node={node}
          depth={0}
          canEdit={canEdit}
          skillId={skillId}
        />
      ))}
    </div>
  );
}

export default memo(SkillFileTree);
