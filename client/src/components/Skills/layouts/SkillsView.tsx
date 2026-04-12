import { useState, useCallback, useRef, useEffect } from 'react';
import { FilePlus, FolderPlus, Pencil, Upload } from 'lucide-react';
import { Navigate, useParams, useLocation, useNavigate } from 'react-router-dom';
import { Spinner, TooltipAnchor } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { ParsedSkillMd } from '~/components/Skills/utils/parseSkillMd';
import { SkillFileTree, SkillFileEditor, SkillFilePreview } from '~/components/Skills/tree';
import {
  useGetSkillByIdQuery,
  useGetSkillTreeQuery,
  useGetSkillNodeContentQuery,
  useCreateSkillNodeMutation,
  useUpdateSkillNodeMutation,
  useDeleteSkillNodeMutation,
} from '~/data-provider';
import { CreateSkillForm, SkillForm } from '~/components/Skills/forms';
import SkillState from '~/components/Skills/display/SkillState';
import { useHasAccess, useAuthContext, useLocalize } from '~/hooks';

interface LocationState {
  uploadData?: ParsedSkillMd;
}

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.json',
  '.yaml',
  '.yml',
  '.py',
  '.sh',
  '.css',
  '.html',
  '.xml',
  '.csv',
  '.env',
  '.toml',
  '.ini',
]);

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot === -1) {
    return false;
  }
  return TEXT_EXTENSIONS.has(lower.slice(dot));
}

function ToolbarButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipAnchor
      description={label}
      side="bottom"
      render={
        <button
          type="button"
          className="rounded-lg bg-transparent p-1.5 text-text-secondary transition-colors duration-100 hover:bg-surface-hover hover:text-text-primary"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </button>
      }
    />
  );
}

function FilePanel({ skillId, nodeId }: { skillId: string; nodeId: string }) {
  const localize = useLocalize();
  const { data, isLoading, isError } = useGetSkillNodeContentQuery(skillId, nodeId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-presentation">
        <Spinner className="text-text-tertiary" />
      </div>
    );
  }

  if (isError) {
    return (
      <SkillState
        variant="error"
        title={localize('com_ui_skill_load_error')}
        description={localize('com_ui_skill_not_found_description')}
      />
    );
  }

  const fileName = (data as { name?: string } | undefined)?.name ?? nodeId;
  const mimeType = data?.mimeType ?? 'text/plain';

  if (mimeType.startsWith('text/') || isTextFile(fileName)) {
    return <SkillFileEditor skillId={skillId} nodeId={nodeId} fileName={fileName} />;
  }

  return <SkillFilePreview skillId={skillId} nodeId={nodeId} fileName={fileName} />;
}

function TreeView({
  skillId,
  nodeId,
  isEdit,
}: {
  skillId: string;
  nodeId?: string;
  isEdit?: boolean;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodeId ?? null);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = useRef(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (resizeCleanupRef.current) {
        resizeCleanupRef.current();
      }
    };
  }, []);

  const {
    data: treeData,
    isLoading: treeLoading,
    isError: treeError,
  } = useGetSkillTreeQuery(skillId);
  const createNode = useCreateSkillNodeMutation(skillId);
  const updateNode = useUpdateSkillNodeMutation(skillId);
  const deleteNode = useDeleteSkillNodeMutation(skillId);

  const handleSelectNode = useCallback(
    (id: string, nodeType: 'file' | 'folder') => {
      if (nodeType === 'file') {
        setSelectedNodeId(id);
        navigate(`/skills/${skillId}/file/${id}`);
      }
    },
    [navigate, skillId],
  );

  const handleRenameNode = useCallback(
    (id: string, newName: string) => {
      updateNode.mutate({ skillId, nodeId: id, data: { name: newName } });
    },
    [updateNode, skillId],
  );

  const handleMoveNode = useCallback(
    (id: string, newParentId: string | null, index: number) => {
      updateNode.mutate({ skillId, nodeId: id, data: { parentId: newParentId, order: index } });
    },
    [updateNode, skillId],
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      deleteNode.mutate({ skillId, nodeId: id });
      if (selectedNodeId === id) {
        setSelectedNodeId(null);
        navigate(`/skills/${skillId}`);
      }
    },
    [deleteNode, skillId, selectedNodeId, navigate],
  );

  const handleNewFile = useCallback(() => {
    createNode.mutate({ skillId, data: { type: 'file', name: 'untitled.md', parentId: null } });
  }, [createNode, skillId]);

  const handleNewFolder = useCallback(() => {
    createNode.mutate({ skillId, data: { type: 'folder', name: 'new-folder', parentId: null } });
  }, [createNode, skillId]);

  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      const files = input.files;
      if (!files) {
        return;
      }
      const uploads: Promise<unknown>[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'file');
        formData.append('name', file.name);
        uploads.push(createNode.mutateAsync({ skillId, data: formData }));
      }
      void Promise.allSettled(uploads);
    };
    input.click();
  }, [skillId, createNode]);

  const handleEditMetadata = useCallback(() => {
    navigate(`/skills/${skillId}/edit`);
  }, [navigate, skillId]);

  const MIN_WIDTH = 200;
  const MAX_WIDTH = 600;
  const KEYBOARD_STEP = 16;

  const handleResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSidebarWidth((w) => Math.max(MIN_WIDTH, w - KEYBOARD_STEP));
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSidebarWidth((w) => Math.min(MAX_WIDTH, w + KEYBOARD_STEP));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setSidebarWidth(MIN_WIDTH);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setSidebarWidth(MAX_WIDTH);
    }
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) {
          return;
        }
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + ev.clientX - startX));
        setSidebarWidth(newWidth);
      };

      const cleanup = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', cleanup);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        resizeCleanupRef.current = null;
      };

      resizeCleanupRef.current = cleanup;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', cleanup);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarWidth],
  );

  const renderMainPanel = () => {
    if (isEdit) {
      return <SkillForm skillId={skillId} />;
    }
    if (nodeId) {
      return <FilePanel skillId={skillId} nodeId={nodeId} />;
    }
    return (
      <SkillState
        title={localize('com_ui_skill_select_file')}
        description={localize('com_ui_skill_select_file_desc')}
      />
    );
  };

  return (
    <div className="flex h-full w-full bg-presentation">
      <div
        className="flex h-full shrink-0 flex-col border-r border-border-light"
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="flex items-center gap-1 border-b border-border-light px-2.5 py-2">
          <ToolbarButton onClick={handleNewFile} label={localize('com_ui_skill_new_file')}>
            <FilePlus className="size-4" />
          </ToolbarButton>
          <ToolbarButton onClick={handleNewFolder} label={localize('com_ui_skill_new_folder')}>
            <FolderPlus className="size-4" />
          </ToolbarButton>
          <ToolbarButton onClick={handleUpload} label={localize('com_ui_skill_upload_file')}>
            <Upload className="size-4" />
          </ToolbarButton>
          <div className="flex-1" />
          <ToolbarButton onClick={handleEditMetadata} label={localize('com_ui_edit')}>
            <Pencil className="size-4" />
          </ToolbarButton>
        </div>
        <div className="min-h-0 flex-1">
          {treeLoading && (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-4 text-text-tertiary" />
            </div>
          )}
          {!treeLoading && treeError && (
            <SkillState
              variant="error"
              title={localize('com_ui_skills_load_error')}
              description={localize('com_ui_skill_not_found_description')}
            />
          )}
          {!treeLoading && !treeError && (
            <SkillFileTree
              nodes={treeData?.nodes ?? []}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
              onRenameNode={handleRenameNode}
              onMoveNode={handleMoveNode}
              onDeleteNode={handleDeleteNode}
            />
          )}
        </div>
      </div>
      <div
        className="group/resize flex w-1 shrink-0 cursor-col-resize items-center justify-center hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:bg-surface-active"
        onMouseDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
        role="separator"
        aria-orientation="vertical"
        aria-label={localize('com_ui_skill_resize_file_tree')}
        aria-valuenow={sidebarWidth}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
      >
        <div className="h-8 w-0.5 rounded-full bg-border-light transition-colors group-hover/resize:bg-border-medium group-active/resize:bg-border-heavy" />
      </div>
      <div className="flex-1 overflow-y-auto">{renderMainPanel()}</div>
    </div>
  );
}

export default function SkillsView() {
  const { skillId, nodeId } = useParams();
  const location = useLocation();
  const localize = useLocalize();
  const { user, roles } = useAuthContext();
  const isNew = skillId === undefined;
  const isEdit = location.pathname.endsWith('/edit');

  const { isError: skillNotFound, isLoading: skillLoading } = useGetSkillByIdQuery(skillId, {
    enabled: !!skillId,
  });

  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });

  const rolesLoaded = user?.role != null && roles?.[user.role] != null;
  if (!rolesLoaded) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-presentation">
        <Spinner className="text-text-secondary" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/c/new" replace />;
  }

  if (isNew) {
    const state = location.state as LocationState | undefined;
    const uploadData = state?.uploadData;
    const formKey = uploadData ? `upload-${location.key}` : 'new';

    return (
      <div className="flex h-full w-full flex-col overflow-y-auto bg-presentation">
        <CreateSkillForm
          key={formKey}
          defaultValues={
            uploadData
              ? {
                  name: uploadData.name,
                  description: uploadData.description,
                  ...(uploadData.invocationMode
                    ? { invocationMode: uploadData.invocationMode }
                    : {}),
                }
              : undefined
          }
        />
      </div>
    );
  }

  if (skillId) {
    if (skillLoading) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-presentation">
          <Spinner className="text-text-secondary" />
        </div>
      );
    }
    if (skillNotFound) {
      return (
        <SkillState
          variant="error"
          title={localize('com_ui_skill_not_found')}
          description={localize('com_ui_skill_not_found_description')}
        />
      );
    }
    return <TreeView skillId={skillId} nodeId={nodeId} isEdit={isEdit} />;
  }

  return null;
}
