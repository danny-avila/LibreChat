import { memo, useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import throttle from 'lodash/throttle';
import { ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Spinner, useMediaQuery } from '@librechat/client';
import { useQueries } from '@tanstack/react-query';
import { AutoSizer, CellMeasurer, CellMeasurerCache, List } from 'react-virtualized';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type {
  TChatProject,
  TConversation,
  ConversationListResponse,
  ProjectListResponse,
} from 'librechat-data-provider';
import type { MeasuredCellParent } from './Conversations';
import type { ChatsHeaderControls } from './Header';
import type { SidebarChatSort, SidebarProjectMode } from './types';
import FavoritesList from '~/components/Nav/Favorites/FavoritesList';
import {
  useActiveJobs,
  useConversationsInfiniteQuery,
  useProjectsInfiniteQuery,
} from '~/data-provider';
import { useFavorites, useLocalize, useShowMarketplace } from '~/hooks';
import { groupConversationsByDate, cn } from '~/utils';
import { DateLabel } from './Conversations';
import ChatsHeader from './Header';
import Convo from './Convo';
import store from '~/store';

type Section = {
  id: string;
  title: string;
  count?: number;
  project?: TChatProject;
};

type FlattenedItem =
  | { type: 'favorites' }
  | { type: 'chats-header' }
  | { type: 'section'; section: Section; isExpanded: boolean }
  | { type: 'date'; sectionId?: string; groupName: string }
  | { type: 'convo'; sectionId?: string; convo: TConversation }
  | { type: 'empty'; sectionId?: string; title: string }
  | { type: 'loading'; sectionId?: string; key: string };

type SectionPageRequest = {
  sectionId: string;
  cursor?: string;
};

type SectionConversationState = {
  pages: ConversationListResponse[];
  conversations: TConversation[];
  groupedConversations: ReturnType<typeof groupConversationsByDate>;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  nextCursor: string | null;
};

interface ProjectConversationsProps {
  mode: SidebarProjectMode;
  chatSortBy: SidebarChatSort;
  tags: string[];
  toggleNav: () => void;
  isAuthenticated: boolean;
  containerRef: React.RefObject<List>;
  isChatsExpanded: boolean;
  setIsChatsExpanded: (expanded: boolean) => void;
  chatsHeaderControls: ChatsHeaderControls;
}

interface MeasuredRowProps {
  cache: CellMeasurerCache;
  rowKey: string;
  parent: MeasuredCellParent;
  index: number;
  style: React.CSSProperties;
  children: React.ReactNode;
}

const UNASSIGNED_SECTION_ID = 'unassigned';

const MeasuredRow: FC<MeasuredRowProps> = memo(
  ({ cache, rowKey, parent, index, style, children }) => (
    <CellMeasurer cache={cache} columnIndex={0} key={rowKey} parent={parent} rowIndex={index}>
      {({ registerChild }) => (
        <div ref={registerChild as React.LegacyRef<HTMLDivElement>} style={style} className="px-3">
          {children}
        </div>
      )}
    </CellMeasurer>
  ),
);

MeasuredRow.displayName = 'ProjectMeasuredRow';

const SidebarLoading = memo(() => {
  const localize = useLocalize();
  return (
    <div className="mx-auto mt-2 flex items-center justify-center gap-2">
      <Spinner className="text-text-primary" />
      <span className="animate-pulse text-text-primary">{localize('com_ui_loading')}</span>
    </div>
  );
});

SidebarLoading.displayName = 'ProjectSidebarLoading';

const SectionHeader = memo(
  ({
    section,
    isExpanded,
    onToggle,
  }: {
    section: Section;
    isExpanded: boolean;
    onToggle: () => void;
  }) => {
    const localize = useLocalize();
    const Icon = isExpanded ? FolderOpen : Folder;
    const countLabel =
      typeof section.count === 'number'
        ? localize('com_ui_project_chat_count', { count: section.count })
        : undefined;

    return (
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className={cn(
          'group flex h-8 w-full items-center gap-2 rounded-lg px-1 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white',
          isExpanded
            ? 'text-text-primary hover:bg-surface-hover'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0',
            isExpanded ? 'text-text-primary' : 'text-text-secondary',
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{section.title}</span>
        {countLabel && <span className="shrink-0 text-xs text-text-tertiary">{countLabel}</span>}
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-text-tertiary transition-transform duration-200',
            isExpanded ? 'rotate-180' : '',
          )}
          aria-hidden="true"
        />
      </button>
    );
  },
);

SectionHeader.displayName = 'ProjectSectionHeader';

const EmptyRow = memo(({ title }: { title: string }) => {
  return <div className="px-1 py-2 text-xs text-text-secondary">{title}</div>;
});

EmptyRow.displayName = 'ProjectEmptyRow';

const ProjectConversations: FC<ProjectConversationsProps> = ({
  mode,
  chatSortBy,
  tags,
  toggleNav,
  isAuthenticated,
  containerRef,
  isChatsExpanded,
  setIsChatsExpanded,
  chatsHeaderControls,
}) => {
  const localize = useLocalize();
  const search = useRecoilValue(store.search);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { favorites, isLoading: isFavoritesLoading } = useFavorites();
  const showAgentMarketplace = useShowMarketplace();
  const favoritesContentKeyRef = useRef('');
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(() => new Set());
  const [sectionCursors, setSectionCursors] = useState<Record<string, Array<string | undefined>>>(
    {},
  );
  const isSearching = Boolean(search.debouncedQuery);
  const shouldShowFavorites =
    !search.query && (isFavoritesLoading || favorites.length > 0 || showAgentMarketplace);
  const tagsKey = useMemo(() => tags.join('\u0000'), [tags]);
  const sectionParamsKey = `${chatSortBy}|${tagsKey}`;

  favoritesContentKeyRef.current = `${favorites.length}-${showAgentMarketplace ? 1 : 0}-${isFavoritesLoading ? 1 : 0}`;

  const projectSortBy = mode === 'recentProjects' ? 'lastConversationAt' : 'name';
  const projectSortDirection = mode === 'recentProjects' ? 'desc' : 'asc';

  const {
    data: projectsData,
    fetchNextPage: fetchNextProjectPage,
    isFetchingNextPage: isFetchingNextProjectPage,
    isLoading: isProjectsLoading,
  } = useProjectsInfiniteQuery(
    {
      sortBy: projectSortBy,
      sortDirection: projectSortDirection,
    },
    {
      enabled: isAuthenticated && isChatsExpanded,
      staleTime: 30000,
      cacheTime: 300000,
    },
  );

  const {
    data: searchConversationsData,
    fetchNextPage: fetchNextSearchConversationPage,
    isFetchingNextPage: isFetchingNextSearchConversationPage,
    isLoading: isSearchConversationsLoading,
  } = useConversationsInfiniteQuery(
    {
      tags: tags.length === 0 ? undefined : tags,
      sortBy: chatSortBy,
      sortDirection: 'desc',
      search: search.debouncedQuery || undefined,
    },
    {
      enabled: isAuthenticated && isChatsExpanded && isSearching,
      keepPreviousData: false,
      staleTime: 30000,
      cacheTime: 300000,
    },
  );

  const { data: activeJobsData } = useActiveJobs();
  const activeJobIds = useMemo(
    () => new Set(activeJobsData?.activeJobIds ?? []),
    [activeJobsData?.activeJobIds],
  );

  const projects = useMemo(
    () => projectsData?.pages.flatMap((page) => page.projects) ?? [],
    [projectsData?.pages],
  );

  const searchConversations = useMemo(
    () => searchConversationsData?.pages.flatMap((page) => page.conversations) ?? [],
    [searchConversationsData?.pages],
  );

  const sections = useMemo<Section[]>(() => {
    const projectSections = projects.map((project) => ({
      id: project._id,
      title: project.name,
      count: project.conversationCount,
      project,
    }));
    return [
      ...projectSections,
      {
        id: UNASSIGNED_SECTION_ID,
        title: localize('com_ui_unassigned'),
      },
    ];
  }, [localize, projects]);

  const expandedSectionIdsList = useMemo(
    () =>
      sections.filter((section) => expandedSectionIds.has(section.id)).map((section) => section.id),
    [expandedSectionIds, sections],
  );

  const expandedSectionIdsKey = useMemo(
    () => expandedSectionIdsList.join('\u0000'),
    [expandedSectionIdsList],
  );

  useEffect(() => {
    setSectionCursors({});
  }, [sectionParamsKey]);

  useEffect(() => {
    setExpandedSectionIds((current) => {
      const validSectionIds = new Set(sections.map((section) => section.id));
      const next = new Set([...current].filter((sectionId) => validSectionIds.has(sectionId)));
      const changed =
        next.size !== current.size || [...next].some((sectionId) => !current.has(sectionId));
      return changed ? next : current;
    });
  }, [sections]);

  const sectionQuerySpecs = useMemo<SectionPageRequest[]>(() => {
    if (isSearching || !isChatsExpanded) {
      return [];
    }
    return expandedSectionIdsList.flatMap((sectionId) => {
      const cursors = sectionCursors[sectionId] ?? [undefined];
      return cursors.map((cursor) => ({ sectionId, cursor }));
    });
  }, [expandedSectionIdsList, isChatsExpanded, isSearching, sectionCursors]);

  const sectionQueryResults = useQueries({
    queries: sectionQuerySpecs.map(({ sectionId, cursor }) => ({
      queryKey: [
        QueryKeys.projectConversations,
        {
          projectId: sectionId,
          tags: tags.length === 0 ? undefined : tags,
          sortBy: chatSortBy,
          sortDirection: 'desc',
          cursor,
        },
      ],
      queryFn: () =>
        dataService.listConversations({
          projectId: sectionId,
          tags: tags.length === 0 ? undefined : tags,
          sortBy: chatSortBy,
          sortDirection: 'desc',
          cursor,
        }),
      enabled: isAuthenticated && isChatsExpanded && !isSearching,
      staleTime: 30000,
      cacheTime: 300000,
    })),
  });

  const sectionConversationsById = useMemo<Record<string, SectionConversationState>>(() => {
    const states: Record<string, SectionConversationState> = {};

    expandedSectionIdsList.forEach((sectionId) => {
      states[sectionId] = {
        pages: [],
        conversations: [],
        groupedConversations: [],
        isLoading: true,
        isFetchingNextPage: false,
        hasNextPage: false,
        nextCursor: null,
      };
    });

    sectionQuerySpecs.forEach((spec, index) => {
      const result = sectionQueryResults[index];
      const state = states[spec.sectionId];
      if (!state) {
        return;
      }

      if (result?.data) {
        state.pages.push(result.data as ConversationListResponse);
      }
    });

    Object.entries(states).forEach(([sectionId, state]) => {
      state.conversations = state.pages.flatMap((page) => page.conversations) as TConversation[];
      state.groupedConversations = groupConversationsByDate(state.conversations, chatSortBy);
      const expectedPageCount = sectionCursors[sectionId]?.length ?? 1;
      const lastPage = state.pages[state.pages.length - 1];
      state.isLoading = state.pages.length === 0;
      state.isFetchingNextPage = state.pages.length > 0 && state.pages.length < expectedPageCount;
      state.nextCursor = lastPage?.nextCursor ?? null;
      state.hasNextPage = state.nextCursor != null;
    });

    return states;
  }, [chatSortBy, expandedSectionIdsList, sectionCursors, sectionQueryResults, sectionQuerySpecs]);

  const groupedSearchConversations = useMemo(
    () => groupConversationsByDate(searchConversations, chatSortBy),
    [chatSortBy, searchConversations],
  );

  const { flattenedItems, sectionEndIndexes } = useMemo(() => {
    const items: FlattenedItem[] = [];
    const endIndexes: Record<string, number> = {};

    if (shouldShowFavorites) {
      items.push({ type: 'favorites' });
    }

    items.push({ type: 'chats-header' });

    if (!isChatsExpanded) {
      return items;
    }

    if (isSearching) {
      if (isSearchConversationsLoading) {
        items.push({ type: 'loading', key: 'loading-search-conversations' });
        return { flattenedItems: items, sectionEndIndexes: endIndexes };
      }

      if (searchConversations.length === 0) {
        items.push({ type: 'empty', title: localize('com_ui_no_results_found') });
        return { flattenedItems: items, sectionEndIndexes: endIndexes };
      }

      groupedSearchConversations.forEach(([groupName, convos]) => {
        items.push({ type: 'date', groupName });
        convos.forEach((convo) => items.push({ type: 'convo', convo }));
      });

      if (isFetchingNextSearchConversationPage) {
        items.push({ type: 'loading', key: 'loading-more-search-conversations' });
      }

      return { flattenedItems: items, sectionEndIndexes: endIndexes };
    }

    sections.forEach((section) => {
      const isExpanded = expandedSectionIds.has(section.id);
      items.push({ type: 'section', section, isExpanded });

      if (!isExpanded) {
        endIndexes[section.id] = items.length - 1;
        return;
      }

      const sectionState = sectionConversationsById[section.id];

      if (!sectionState || sectionState.isLoading) {
        items.push({ type: 'loading', sectionId: section.id, key: `loading-${section.id}` });
        endIndexes[section.id] = items.length - 1;
        return;
      }

      if (sectionState.conversations.length === 0) {
        items.push({
          type: 'empty',
          sectionId: section.id,
          title:
            section.id === UNASSIGNED_SECTION_ID
              ? localize('com_ui_no_unassigned_chats')
              : localize('com_ui_no_project_chats'),
        });
        endIndexes[section.id] = items.length - 1;
        return;
      }

      sectionState.groupedConversations.forEach(([groupName, convos]) => {
        items.push({ type: 'date', sectionId: section.id, groupName });
        convos.forEach((convo) => items.push({ type: 'convo', sectionId: section.id, convo }));
      });

      if (sectionState.isFetchingNextPage && sectionState.hasNextPage) {
        items.push({
          type: 'loading',
          sectionId: section.id,
          key: `loading-more-${section.id}`,
        });
      }

      endIndexes[section.id] = items.length - 1;
    });

    if (isProjectsLoading || isFetchingNextProjectPage) {
      items.push({ type: 'loading', key: 'loading-projects' });
    }

    return { flattenedItems: items, sectionEndIndexes: endIndexes };
  }, [
    sections,
    isChatsExpanded,
    isSearching,
    expandedSectionIds,
    isSearchConversationsLoading,
    searchConversations.length,
    groupedSearchConversations,
    isFetchingNextSearchConversationPage,
    isProjectsLoading,
    isFetchingNextProjectPage,
    localize,
    shouldShowFavorites,
    sectionConversationsById,
  ]);

  const flattenedItemsRef = useRef(flattenedItems);
  flattenedItemsRef.current = flattenedItems;

  const rowHeight = isSmallScreen ? 44 : 36;
  const cache = useMemo(
    () =>
      new CellMeasurerCache({
        fixedWidth: true,
        defaultHeight: rowHeight,
        keyMapper: (index) => {
          const item = flattenedItemsRef.current[index];
          if (!item) {
            return `project-unknown-${index}`;
          }
          if (item.type === 'section') {
            return `project-section-${item.section.id}-${item.isExpanded ? 'open' : 'closed'}`;
          }
          if (item.type === 'favorites') {
            return `project-favorites-${favoritesContentKeyRef.current}`;
          }
          if (item.type === 'chats-header') {
            return 'project-chats-header';
          }
          if (item.type === 'date') {
            return `project-date-${item.sectionId ?? 'search'}-${item.groupName}`;
          }
          if (item.type === 'convo') {
            return `project-convo-${item.sectionId ?? 'search'}-${item.convo.conversationId}`;
          }
          if (item.type === 'empty') {
            return `project-empty-${item.sectionId ?? 'search'}`;
          }
          return item.key;
        },
      }),
    [rowHeight],
  );

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      cache.clearAll();
      if (containerRef.current && 'recomputeRowHeights' in containerRef.current) {
        containerRef.current.recomputeRowHeights(0);
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [
    cache,
    chatSortBy,
    expandedSectionIdsKey,
    isChatsExpanded,
    mode,
    search.query,
    tags,
    favorites.length,
    isFavoritesLoading,
    showAgentMarketplace,
    containerRef,
  ]);

  const retainView = useCallback(() => {
    containerRef.current?.scrollToPosition(0);
  }, [containerRef]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const projectHasNextPage = useMemo(() => {
    const pages = projectsData?.pages;
    if (!pages?.length) {
      return false;
    }
    const lastPage: ProjectListResponse = pages[pages.length - 1];
    return lastPage.nextCursor !== null;
  }, [projectsData?.pages]);

  const conversationHasNextPage = useMemo(() => {
    const pages = searchConversationsData?.pages;
    if (!pages?.length) {
      return false;
    }
    const lastPage: ConversationListResponse = pages[pages.length - 1];
    return lastPage.nextCursor !== null;
  }, [searchConversationsData?.pages]);

  const fetchNextSectionPage = useCallback(
    (sectionId: string) => {
      const sectionState = sectionConversationsById[sectionId];
      if (!sectionState?.hasNextPage || sectionState.isFetchingNextPage) {
        return false;
      }

      const nextCursor = sectionState.nextCursor;
      if (!nextCursor) {
        return false;
      }

      setSectionCursors((current) => {
        const cursors = current[sectionId] ?? [undefined];
        if (cursors.includes(nextCursor)) {
          return current;
        }
        return {
          ...current,
          [sectionId]: [...cursors, nextCursor],
        };
      });
      return true;
    },
    [sectionConversationsById],
  );

  const loadMoreRows = useCallback(
    (stopIndex: number) => {
      if (!isChatsExpanded) {
        return;
      }
      if (isSearching && conversationHasNextPage && !isFetchingNextSearchConversationPage) {
        fetchNextSearchConversationPage();
        return;
      }

      if (!isSearching) {
        const sectionToLoad = Object.entries(sectionEndIndexes).find(([sectionId, endIndex]) => {
          const sectionState = sectionConversationsById[sectionId];
          return (
            stopIndex >= endIndex - 8 &&
            Boolean(sectionState?.hasNextPage) &&
            !sectionState?.isFetchingNextPage
          );
        });

        if (sectionToLoad && fetchNextSectionPage(sectionToLoad[0])) {
          return;
        }
      }

      if (
        stopIndex >= flattenedItems.length - 8 &&
        projectHasNextPage &&
        !isFetchingNextProjectPage
      ) {
        fetchNextProjectPage();
      }
    },
    [
      isSearching,
      conversationHasNextPage,
      isFetchingNextSearchConversationPage,
      fetchNextSearchConversationPage,
      sectionEndIndexes,
      sectionConversationsById,
      fetchNextSectionPage,
      flattenedItems.length,
      projectHasNextPage,
      isFetchingNextProjectPage,
      fetchNextProjectPage,
      isChatsExpanded,
    ],
  );

  const throttledLoadMore = useMemo(() => throttle(loadMoreRows, 300), [loadMoreRows]);

  const rowRenderer = useCallback(
    ({ index, key, parent, style }) => {
      const item = flattenedItems[index];
      const rowProps = { cache, rowKey: key, parent, index, style };

      if (item.type === 'loading') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <SidebarLoading />
          </MeasuredRow>
        );
      }

      if (item.type === 'chats-header') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <ChatsHeader
              isExpanded={isChatsExpanded}
              onToggle={() => setIsChatsExpanded(!isChatsExpanded)}
              {...chatsHeaderControls}
            />
          </MeasuredRow>
        );
      }

      if (item.type === 'favorites') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <FavoritesList isSmallScreen={isSmallScreen} toggleNav={toggleNav} />
          </MeasuredRow>
        );
      }

      if (item.type === 'section') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <SectionHeader
              section={item.section}
              isExpanded={item.isExpanded}
              onToggle={() => toggleSection(item.section.id)}
            />
          </MeasuredRow>
        );
      }

      if (item.type === 'date') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <DateLabel groupName={item.groupName} />
          </MeasuredRow>
        );
      }

      if (item.type === 'empty') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <EmptyRow title={item.title} />
          </MeasuredRow>
        );
      }

      if (item.type === 'convo') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <Convo
              conversation={item.convo}
              retainView={retainView}
              toggleNav={toggleNav}
              isGenerating={activeJobIds.has(item.convo.conversationId ?? '')}
            />
          </MeasuredRow>
        );
      }

      return null;
    },
    [
      activeJobIds,
      cache,
      flattenedItems,
      retainView,
      toggleNav,
      toggleSection,
      isChatsExpanded,
      isSmallScreen,
      setIsChatsExpanded,
      chatsHeaderControls,
    ],
  );

  const getRowHeight = useCallback(
    ({ index }: { index: number }) => cache.getHeight(index, 0),
    [cache],
  );

  const handleRowsRendered = useCallback(
    ({ stopIndex }: { stopIndex: number }) => {
      if (!isChatsExpanded) {
        return;
      }
      throttledLoadMore(stopIndex);
    },
    [isChatsExpanded, throttledLoadMore],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col pb-2 text-sm text-text-primary">
      <div className="flex-1">
        <AutoSizer>
          {({ width, height }) => (
            <List
              ref={containerRef}
              width={width}
              height={height}
              deferredMeasurementCache={cache}
              rowCount={flattenedItems.length}
              rowHeight={getRowHeight}
              rowRenderer={rowRenderer}
              overscanRowCount={10}
              aria-readonly={false}
              className="outline-none"
              aria-label={localize('com_ui_projects')}
              onRowsRendered={handleRowsRendered}
              tabIndex={-1}
              style={{ outline: 'none' }}
              containerRole="rowgroup"
            />
          )}
        </AutoSizer>
      </div>
    </div>
  );
};

export default memo(ProjectConversations);
