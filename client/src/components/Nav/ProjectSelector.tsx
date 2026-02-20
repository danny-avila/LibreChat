import { type FC, useState, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { FolderOpen, FolderClosed, Plus, Check } from 'lucide-react';
import { useGetProjectsQuery, useCreateProjectMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type ProjectSelectorProps = {
  isSmallScreen: boolean;
};

const ProjectSelector: FC<ProjectSelectorProps> = ({ isSmallScreen }) => {
  const localize = useLocalize();
  const { data: projects } = useGetProjectsQuery();
  const createProjectMutation = useCreateProjectMutation();
  const [activeProjectId, setActiveProjectId] = useRecoilState(store.activeProjectId);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const activeProject = projects?.find((p) => p._id === activeProjectId);

  const handleSelectProject = useCallback(
    (projectId: string | null) => {
      setActiveProjectId(projectId);
    },
    [setActiveProjectId],
  );

  const handleCreateProject = useCallback(() => {
    const name = newProjectName.trim();
    if (!name) {
      return;
    }
    createProjectMutation.mutate(
      { name },
      {
        onSuccess: (project) => {
          setActiveProjectId(project._id);
          setNewProjectName('');
          setIsCreating(false);
        },
      },
    );
  }, [newProjectName, createProjectMutation, setActiveProjectId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateProject();
      } else if (e.key === 'Escape') {
        setIsCreating(false);
        setNewProjectName('');
      }
    },
    [handleCreateProject],
  );

  return (
    <Menu as="div" className="group relative">
      {({ open }) => (
        <>
          <MenuButton
            className={cn(
              'mt-text-sm flex h-10 w-full items-center gap-2 rounded-lg p-2 text-sm transition-colors duration-200 hover:bg-surface-hover',
              open ? 'bg-surface-hover' : '',
              isSmallScreen ? 'h-12' : '',
            )}
            data-testid="project-selector"
          >
            <div className="h-7 w-7 flex-shrink-0">
              <div className="relative flex h-full items-center justify-center rounded-full border border-border-medium bg-surface-primary-alt text-text-primary">
                {activeProjectId ? (
                  <FolderOpen className="h-4 w-4" />
                ) : (
                  <FolderClosed className="h-4 w-4" />
                )}
              </div>
            </div>
            <div className="grow overflow-hidden whitespace-nowrap text-left text-sm font-medium text-text-primary">
              {activeProject ? activeProject.name : 'All Conversations'}
            </div>
          </MenuButton>
          <MenuItems className="absolute left-0 top-full z-[100] mt-1 max-h-64 w-full translate-y-0 overflow-y-auto rounded-lg bg-header-primary p-1.5 shadow-lg outline-none">
            <MenuItem>
              {({ active }) => (
                <button
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-text-primary',
                    active ? 'bg-surface-hover' : '',
                  )}
                  onClick={() => handleSelectProject(null)}
                >
                  <FolderClosed className="h-4 w-4 flex-shrink-0" />
                  <span className="grow text-left">All Conversations</span>
                  {activeProjectId === null && <Check className="h-4 w-4 flex-shrink-0" />}
                </button>
              )}
            </MenuItem>
            {projects?.map((project) => (
              <MenuItem key={project._id}>
                {({ active }) => (
                  <button
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-text-primary',
                      active ? 'bg-surface-hover' : '',
                    )}
                    onClick={() => handleSelectProject(project._id)}
                  >
                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                    <span className="grow truncate text-left">{project.name}</span>
                    {activeProjectId === project._id && (
                      <Check className="h-4 w-4 flex-shrink-0" />
                    )}
                  </button>
                )}
              </MenuItem>
            ))}
            <div className="my-1 border-t border-border-medium" />
            {isCreating ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <input
                  type="text"
                  className="grow rounded-md border border-border-medium bg-surface-primary px-2 py-1 text-sm text-text-primary outline-none focus:border-text-primary"
                  placeholder="Project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
                <button
                  className="rounded-md p-1 text-text-primary hover:bg-surface-hover disabled:opacity-50"
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || createProjectMutation.isLoading}
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <MenuItem>
                {({ active }) => (
                  <button
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-text-primary',
                      active ? 'bg-surface-hover' : '',
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsCreating(true);
                    }}
                  >
                    <Plus className="h-4 w-4 flex-shrink-0" />
                    <span className="grow text-left">Create Project</span>
                  </button>
                )}
              </MenuItem>
            )}
          </MenuItems>
        </>
      )}
    </Menu>
  );
};

export default ProjectSelector;
