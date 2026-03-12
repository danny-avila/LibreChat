import React, { useState, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Spinner } from '@librechat/client';
import type { TUserProject } from 'librechat-data-provider';
import { useUserProjectsQuery } from '~/data-provider';
import ProjectDialog from './ProjectDialog';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ProjectItemProps {
  project: TUserProject;
  isActive: boolean;
  onClick: () => void;
}

const ProjectItem = memo(({ project, isActive, onClick }: ProjectItemProps) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
      isActive
        ? 'bg-surface-active text-text-primary'
        : 'text-text-secondary hover:bg-surface-hover',
    )}
    aria-label={project.name}
  >
    <span
      className="h-3 w-3 flex-shrink-0 rounded-full"
      style={{ backgroundColor: project.color ?? '#3b82f6' }}
    />
    <span className="truncate">{project.name}</span>
    {project.conversationCount != null && project.conversationCount > 0 && (
      <span className="ml-auto flex-shrink-0 text-xs text-text-tertiary">
        {project.conversationCount}
      </span>
    )}
  </button>
));

ProjectItem.displayName = 'ProjectItem';

interface ProjectListProps {
  activeProjectId?: string | null;
  onSelectProject: (projectId: string) => void;
  toggleNav?: () => void;
}

export default function ProjectList({
  activeProjectId,
  onSelectProject,
  toggleNav,
}: ProjectListProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading } = useUserProjectsQuery();

  const handleSelectProject = useCallback(
    (projectId: string) => {
      onSelectProject(projectId);
      navigate(`/p/${projectId}`);
      toggleNav?.();
    },
    [onSelectProject, navigate, toggleNav],
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {localize('com_ui_projects')}
        </span>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded-md p-0.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label={localize('com_ui_new_project')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-2">
          <Spinner className="h-4 w-4" />
        </div>
      )}

      {!isLoading && data?.projects && data.projects.length === 0 && (
        <p className="px-2.5 py-1.5 text-xs text-text-tertiary">
          {localize('com_ui_project_no_projects')}
        </p>
      )}

      {data?.projects?.map((project) => (
        <ProjectItem
          key={project.projectId}
          project={project}
          isActive={project.projectId === activeProjectId}
          onClick={() => handleSelectProject(project.projectId)}
        />
      ))}

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        triggerRef={triggerRef}
      />
    </div>
  );
}
