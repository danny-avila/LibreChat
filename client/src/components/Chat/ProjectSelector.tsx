import { useState, useRef, useEffect, useCallback } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { Folder, ChevronDown, X } from 'lucide-react';
import type { TUserProject } from 'librechat-data-provider';
import { useUserProjects, useAssignConversationProject } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ProjectSelector() {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const setConversation = useSetRecoilState(store.conversationByIndex(0));
  const { data: projectsData } = useUserProjects();
  const assignMutation = useAssignConversationProject();

  const conversationId = conversation?.conversationId;
  const currentProjectId = conversation?.projectId;

  const projectsMap = projectsData?.projects?.reduce<Map<string, TUserProject>>((map, project) => {
    map.set(project._id, project);
    return map;
  }, new Map());

  const currentProject = currentProjectId ? projectsMap?.get(currentProjectId) : undefined;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (projectId: string | null) => {
      if (!conversationId) {
        return;
      }
      setConversation((prev) => (prev ? { ...prev, projectId: projectId ?? undefined } : prev));
      assignMutation.mutate({ conversationId, projectId });
      setIsOpen(false);
    },
    [conversationId, setConversation, assignMutation],
  );

  if (!conversationId) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        aria-label={localize('com_ui_assign_project')}
      >
        <Folder className="h-3 w-3" />
        <span>{currentProject?.name ?? localize('com_ui_general')}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border-medium bg-surface-primary py-1 shadow-lg">
          <button
            onClick={() => handleSelect(null)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover ${
              !currentProjectId ? 'font-medium text-text-primary' : 'text-text-secondary'
            }`}
          >
            <span>{localize('com_ui_general')}</span>
            {currentProjectId != null && <X className="ml-auto h-3 w-3 text-text-tertiary" />}
          </button>

          {projectsData?.projects?.length ? (
            <>
              <div className="my-1 border-t border-border-light" />
              {projectsData.projects.map((project) => (
                <button
                  key={project._id}
                  onClick={() => handleSelect(project._id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover ${
                    currentProjectId === project._id
                      ? 'font-medium text-text-primary'
                      : 'text-text-secondary'
                  }`}
                >
                  <Folder className="h-3.5 w-3.5" />
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
