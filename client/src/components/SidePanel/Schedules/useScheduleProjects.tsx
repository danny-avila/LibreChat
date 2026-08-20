import { useMemo } from 'react';
import { Folder } from 'lucide-react';
import type { TChatProject } from 'librechat-data-provider';
import type { OptionWithIcon } from '~/common';
import { useProjectsInfiniteQuery } from '~/data-provider';

/** Shared with `ProjectButton`, so every project surface reads one cached page set
 *  instead of each card and dialog opening its own list. */
const PROJECT_LIST_PARAMS = {
  sortBy: 'name',
  sortDirection: 'asc',
  limit: 100,
} as const;

export interface ScheduleProjects {
  projects: TChatProject[];
  /** Name lookup for rendering a stored id the picker may not have paged in yet. */
  namesById: Map<string, string>;
  items: OptionWithIcon[];
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isLoading: boolean;
}

/** Chat projects a schedule can be filed under, in the shape both the picker and the
 *  card need. */
export default function useScheduleProjects(enabled = true): ScheduleProjects {
  const { data, fetchNextPage, isFetchingNextPage, isLoading } = useProjectsInfiniteQuery(
    PROJECT_LIST_PARAMS,
    { enabled },
  );

  const projects = useMemo<TChatProject[]>(
    () => data?.pages.flatMap((page) => page.projects) ?? [],
    [data?.pages],
  );

  /** One pass builds both the option list and the name lookup: the panel renders a
   *  card per schedule and the dialog renders the same set, so re-walking the list
   *  for each consumer adds up on an account with many projects. */
  const { items, namesById } = useMemo(() => {
    const options: OptionWithIcon[] = [];
    const names = new Map<string, string>();
    for (const project of projects) {
      names.set(project._id, project.name);
      options.push({
        label: project.name,
        value: project._id,
        icon: <Folder className="h-4 w-4 text-text-secondary" aria-hidden="true" />,
      });
    }
    return { items: options, namesById: names };
  }, [projects]);

  return {
    projects,
    namesById,
    items,
    hasNextPage: data?.pages[data.pages.length - 1]?.nextCursor != null,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
  };
}
