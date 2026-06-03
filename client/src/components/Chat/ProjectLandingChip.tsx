import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Folder, X } from 'lucide-react';
import { ControlCombobox, TooltipAnchor } from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import type { OptionWithIcon } from '~/common';
import { useProjectsInfiniteQuery } from '~/data-provider';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';

/**
 * Subtle project indicator shown on a project-scoped new-chat landing.
 * Clicking the chip switches the project (searchable combobox); the trailing
 * `×` removes the project scope. Both update the conversation draft and the
 * `?projectId` search param in place, so the typed message and model are kept.
 */
export default function ProjectLandingChip({ project }: { project: TChatProject }) {
  const localize = useLocalize();
  const { conversation, setConversation } = useChatContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data } = useProjectsInfiniteQuery(
    { sortBy: 'lastConversationAt', sortDirection: 'desc', limit: 100 },
    { staleTime: 30000 },
  );
  const projects = useMemo(() => data?.pages.flatMap((page) => page.projects) ?? [], [data?.pages]);
  const items = useMemo<OptionWithIcon[]>(
    () =>
      projects.map((item) => ({
        label: item.name,
        value: item._id,
        icon: <Folder className="h-4 w-4 text-text-secondary" aria-hidden="true" />,
      })),
    [projects],
  );

  const applyProject = useCallback(
    (projectId: string | null) => {
      if (conversation) {
        setConversation({ ...conversation, chatProjectId: projectId });
      }
      const nextParams = new URLSearchParams(searchParams);
      if (projectId) {
        nextParams.set('projectId', projectId);
      } else {
        nextParams.delete('projectId');
      }
      setSearchParams(nextParams, { replace: true });
    },
    [conversation, setConversation, searchParams, setSearchParams],
  );

  return (
    <div className="group mb-2.5 flex items-center gap-1 px-1">
      <ControlCombobox
        selectId="project-landing-select"
        selectedValue={project._id}
        displayValue={project.name}
        items={items}
        setValue={(value) => {
          if (value) {
            applyProject(value);
          }
        }}
        SelectIcon={<Folder className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />}
        ariaLabel={localize('com_ui_change_project')}
        searchPlaceholder={localize('com_ui_search_projects')}
        isCollapsed={false}
        showCarat={true}
        placement="top"
        containerClassName="w-auto px-0"
        className="h-8 w-auto min-w-[11rem] gap-1.5 rounded-full px-2.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      />
      <TooltipAnchor
        description={localize('com_ui_remove_from_project')}
        render={
          <button
            type="button"
            aria-label={localize('com_ui_remove_from_project')}
            onClick={() => applyProject(null)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary opacity-0 outline-none transition-all hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring-primary group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
}
