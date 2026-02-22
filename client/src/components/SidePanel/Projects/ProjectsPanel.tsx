import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Folder } from 'lucide-react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import {
  Button,
  Spinner,
  FilterInput,
  TooltipAnchor,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { TUserProject } from 'librechat-data-provider';
import {
  useUserProjects,
  useCreateUserProject,
  useUpdateUserProject,
  useDeleteUserProject,
} from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import ProjectFormDialog from './ProjectFormDialog';

export default function ProjectsPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [filter, setFilter] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<TUserProject | null>(null);

  const { data, isLoading } = useUserProjects();
  const createMutation = useCreateUserProject();
  const updateMutation = useUpdateUserProject();
  const deleteMutation = useDeleteUserProject();

  const hasReadAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.READ,
  });

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.CREATE,
  });

  const hasUpdateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.UPDATE,
  });

  const filteredProjects = useMemo(() => {
    const projects = data?.projects ?? [];
    if (!filter) {
      return projects;
    }
    const lower = filter.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.description && p.description.toLowerCase().includes(lower)),
    );
  }, [data?.projects, filter]);

  const handleCreate = (name: string, description?: string) => {
    createMutation.mutate(
      { name, description },
      {
        onSuccess: () => {
          showToast({ message: localize('com_ui_project_created'), status: 'success' });
          setCreateDialogOpen(false);
        },
        onError: () => {
          showToast({ message: localize('com_ui_error'), status: 'error' });
        },
      },
    );
  };

  const handleUpdate = (id: string, name: string, description?: string) => {
    updateMutation.mutate(
      { id, data: { name, description } },
      {
        onSuccess: () => {
          showToast({ message: localize('com_ui_project_updated'), status: 'success' });
          setEditingProject(null);
        },
        onError: () => {
          showToast({ message: localize('com_ui_error'), status: 'error' });
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_project_deleted'), status: 'success' });
      },
      onError: () => {
        showToast({ message: localize('com_ui_error'), status: 'error' });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  if (!hasReadAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-text-secondary">{localize('com_ui_no_read_access')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div role="region" aria-label={localize('com_ui_projects')} className="mt-2 space-y-3">
        <div className="flex items-center gap-2">
          <FilterInput
            inputId="project-search"
            label={localize('com_ui_projects_filter')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            containerClassName="flex-1"
          />
          {hasCreateAccess && (
            <ProjectFormDialog
              open={createDialogOpen}
              onOpenChange={setCreateDialogOpen}
              isLoading={createMutation.isLoading}
              onSubmit={handleCreate}
            >
              <OGDialogTrigger asChild>
                <TooltipAnchor
                  description={localize('com_ui_create_project')}
                  side="bottom"
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 bg-transparent"
                      aria-label={localize('com_ui_create_project')}
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
              </OGDialogTrigger>
            </ProjectFormDialog>
          )}
        </div>

        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-text-secondary">
            <Folder className="size-10 opacity-50" aria-hidden="true" />
            <p className="text-sm">{localize('com_ui_no_projects')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 overflow-y-auto">
            {filteredProjects.map((project) => (
              <div
                key={project._id}
                className="group flex items-start justify-between rounded-md border border-border-light p-2 hover:bg-surface-hover"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {project.name}
                  </span>
                  {project.description && (
                    <span className="truncate text-xs text-text-secondary">
                      {project.description}
                    </span>
                  )}
                </div>
                {hasUpdateAccess && (
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <ProjectFormDialog
                      open={editingProject?._id === project._id}
                      onOpenChange={(open) => {
                        if (!open) {
                          setEditingProject(null);
                        }
                      }}
                      initialName={editingProject?._id === project._id ? project.name : undefined}
                      initialDescription={
                        editingProject?._id === project._id ? project.description : undefined
                      }
                      isLoading={updateMutation.isLoading}
                      onSubmit={(name, description) => handleUpdate(project._id, name, description)}
                    >
                      <OGDialogTrigger asChild>
                        <button
                          onClick={() => setEditingProject(project)}
                          className="rounded p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
                          aria-label={localize('com_ui_edit')}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </OGDialogTrigger>
                    </ProjectFormDialog>
                    <button
                      onClick={() => handleDelete(project._id)}
                      className="rounded p-1 text-text-secondary hover:bg-surface-tertiary hover:text-red-500"
                      aria-label={localize('com_ui_delete')}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
