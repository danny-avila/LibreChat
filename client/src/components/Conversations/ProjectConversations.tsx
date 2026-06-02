import { memo, useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import throttle from 'lodash/throttle';
import { ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Spinner, useMediaQuery } from '@librechat/client';
import { AutoSizer, CellMeasurer, CellMeasurerCache, List } from 'react-virtualized';
import type {
  TChatProject,
  TConversation,
  ConversationListResponse,
  ProjectListResponse,
} from 'librechat-data-provider';
import type { MeasuredCellParent } from './Conversations';
import type { ChatsHeaderControls } from './Header';
import type { SidebarChatSort, SidebarProjectMode } from './types';
import {
  useActiveJobs,
  useConversationsInfiniteQuery,
  useProjectsInfiniteQuery,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
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
  | { type: 'chats-header' }
  | { type: 'section'; section: Section; isExpanded: boolean }
  | { type: 'date'; groupName: string }
  | { type: 'convo'; convo: TConversation }
  | { type: 'empty'; title: string }
  | { type: 'loading'; key: string };

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
        className="group flex h-9 w-full items-center gap-2 rounded-lg px-1 text-left text-sm text-text-primary outline-none transition-colors hover:bg-surface-active-alt focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
      >
        <Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
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
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);

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
    data: conversationsData,
    fetchNextPage: fetchNextConversationPage,
    isFetchingNextPage: isFetchingNextConversationPage,
    isLoading: isConversationsLoading,
  } = useConversationsInfiniteQuery(
    {
      projectId: expandedSectionId ?? undefined,
      tags: tags.length === 0 ? undefined : tags,
      sortBy: chatSortBy,
      sortDirection: 'desc',
      search: search.debouncedQuery || undefined,
    },
    {
      enabled: isAuthenticated && isChatsExpanded && expandedSectionId != null,
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

  const conversations = useMemo(
    () => conversationsData?.pages.flatMap((page) => page.conversations) ?? [],
    [conversationsData?.pages],
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

  const groupedConversations = useMemo(
    () => groupConversationsByDate(conversations, chatSortBy),
    [chatSortBy, conversations],
  );

  const flattenedItems = useMemo(() => {
    const items: FlattenedItem[] = [{ type: 'chats-header' }];

    if (!isChatsExpanded) {
      return items;
    }

    sections.forEach((section) => {
      const isExpanded = expandedSectionId === section.id;
      items.push({ type: 'section', section, isExpanded });

      if (!isExpanded) {
        return;
      }

      if (isConversationsLoading) {
        items.push({ type: 'loading', key: `loading-${section.id}` });
        return;
      }

      if (conversations.length === 0) {
        items.push({
          type: 'empty',
          title:
            section.id === UNASSIGNED_SECTION_ID
              ? localize('com_ui_no_unassigned_chats')
              : localize('com_ui_no_project_chats'),
        });
        return;
      }

      groupedConversations.forEach(([groupName, convos]) => {
        items.push({ type: 'date', groupName });
        convos.forEach((convo) => items.push({ type: 'convo', convo }));
      });

      if (isFetchingNextConversationPage) {
        items.push({ type: 'loading', key: `loading-more-${section.id}` });
      }
    });

    if (isProjectsLoading || isFetchingNextProjectPage) {
      items.push({ type: 'loading', key: 'loading-projects' });
    }

    return items;
  }, [
    sections,
    isChatsExpanded,
    expandedSectionId,
    isConversationsLoading,
    conversations.length,
    groupedConversations,
    isFetchingNextConversationPage,
    isProjectsLoading,
    isFetchingNextProjectPage,
    localize,
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
          if (item.type === 'chats-header') {
            return 'project-chats-header';
          }
          if (item.type === 'date') {
            return `project-date-${expandedSectionId}-${item.groupName}`;
          }
          if (item.type === 'convo') {
            return `project-convo-${item.convo.conversationId}`;
          }
          if (item.type === 'empty') {
            return `project-empty-${expandedSectionId}`;
          }
          return item.key;
        },
      }),
    [expandedSectionId, rowHeight],
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
    expandedSectionId,
    isChatsExpanded,
    mode,
    search.query,
    tags,
    containerRef,
  ]);

  const retainView = useCallback(() => {
    containerRef.current?.scrollToPosition(0);
  }, [containerRef]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSectionId((current) => (current === sectionId ? null : sectionId));
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
    const pages = conversationsData?.pages;
    if (!pages?.length) {
      return false;
    }
    const lastPage: ConversationListResponse = pages[pages.length - 1];
    return lastPage.nextCursor !== null;
  }, [conversationsData?.pages]);

  const loadMoreRows = useCallback(() => {
    if (!isChatsExpanded) {
      return;
    }
    if (expandedSectionId && conversationHasNextPage && !isFetchingNextConversationPage) {
      fetchNextConversationPage();
      return;
    }
    if (projectHasNextPage && !isFetchingNextProjectPage) {
      fetchNextProjectPage();
    }
  }, [
    expandedSectionId,
    conversationHasNextPage,
    isFetchingNextConversationPage,
    fetchNextConversationPage,
    projectHasNextPage,
    isFetchingNextProjectPage,
    fetchNextProjectPage,
    isChatsExpanded,
  ]);

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
      if (stopIndex >= flattenedItems.length - 8) {
        throttledLoadMore();
      }
    },
    [flattenedItems.length, isChatsExpanded, throttledLoadMore],
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
