# 书签浏览视图 实施计划

> **给执行者(agent)的话:** 必须使用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐任务执行本计划。步骤用复选框(`- [ ]`)语法追踪进度。

**目标:** 给已有的"打书签"功能补上缺失的浏览入口——侧边栏"书签"导航 → 书签网格页 → 单个书签详情页(对话列表),并清理与之相关、已经零消费者的死代码。

**架构:** 完全照搬当天刚做完的"项目"两层结构(侧边栏扁平导航 → 网格页 → 详情页),后端零改动(`/api/convos?tags=` 和相关 mutation 都已经存在且在用),只是把已有的、从未接上任何浏览入口的书签数据能力接上界面。

**技术栈:** React + TypeScript + React Router + TanStack Query + Ariakit(DropdownPopup)+ Tailwind,和本仓库前端其余部分一致。

## 全局约束

- 不改动任何后端文件(`api/`、`packages/api`、`packages/data-schemas`)——本计划纯前端。
- 只改 `client/src/locales/en/translation.json` 和 `client/src/locales/zh-Hans/translation.json` 这两个语言文件;不碰其他语言(按项目约定,其他语言由外部工具自动化,但 zh-Hans 例外,需要手工维护,和这个仓库里之前 Private Chat Projects 那次港译工作的做法一致)。
- 新增/改动的 UI 文本一律走 `useLocalize()`,不允许硬编码字符串。
- 每个文件的 import 顺序遵循项目约定:包导入(最短到最长)→ `import type` 导入(最长到最短)→ 本地/项目导入(最短到最长);同目录兄弟文件用相对路径导入,跨目录用 `~/` 绝对路径。
- 不使用 `git add -A`;每个任务提交时显式列出改动的文件路径。
- 本仓库里 `client/src/components/Projects/*` 这一批同类型组件(网格页/详情页/操作菜单)都没有配套的 `.spec.tsx` 单元测试,验证方式是 `tsc --noEmit` + `eslint` + 浏览器手动冒烟——本计划的新组件遵循同样的先例,不额外强行补单元测试。
- Prettier/ESLint 有冲突时用 `npx eslint --fix <file>` 自动修,不要手工对抗格式化规则。

---

### Task 1: 补充 i18n key

**Files:**
- Modify: `client/src/locales/en/translation.json`
- Modify: `client/src/locales/zh-Hans/translation.json`

**Interfaces:**
- Produces:6 个翻译 key 供后续任务的组件直接 `localize(...)` 使用——`com_ui_all_bookmarks`、`com_ui_sort_bookmarks_by`、`com_ui_no_bookmark_chats`(新增,en+zh-Hans 都要加)以及 `com_ui_conversation`、`com_ui_no_bookmarks_title`、`com_ui_no_bookmarks_match`(en 已存在,只需要补 zh-Hans 翻译)。

- [ ] **Step 1: 在 en/translation.json 里新增 3 个 key**

在 `"com_ui_all": "all",` 后面插入(注意其后原本紧跟 `"com_ui_all_projects"`,按字母序 `all_bookmarks` 排在 `all_projects` 前面):

```json
  "com_ui_all": "all",
  "com_ui_all_bookmarks": "All bookmarks",
  "com_ui_all_projects": "All projects",
```

在 `"com_ui_no_auth": "None (Auto-detect)",` 后面、`"com_ui_no_bookmarks"` 前面插入:

```json
  "com_ui_no_auth": "None (Auto-detect)",
  "com_ui_no_bookmark_chats": "No chats yet",
  "com_ui_no_bookmarks": "it seems like you have no bookmarks yet. Click on a chat and add a new one",
```

在 `"com_ui_skills_queued": "Skills queued for next submission",` 后面、`"com_ui_sort_by"` 前面插入:

```json
  "com_ui_skills_queued": "Skills queued for next submission",
  "com_ui_sort_bookmarks_by": "Sort bookmarks by",
  "com_ui_sort_by": "Sort by",
```

- [ ] **Step 2: 在 zh-Hans/translation.json 里新增同样 3 个 key + 补齐 3 个缺失翻译**

在 `"com_ui_all": "所有",` 后面、`"com_ui_all_projects"` 前面插入:

```json
  "com_ui_all": "所有",
  "com_ui_all_bookmarks": "全部书签",
  "com_ui_all_projects": "全部项目",
```

在 `"com_ui_control_bar": "控制栏",` 后面、`"com_ui_conversation_not_found"` 前面插入(`com_ui_conversation` 这个 key 在 en 里已经存在,zh-Hans 之前漏掉了):

```json
  "com_ui_control_bar": "控制栏",
  "com_ui_conversation": "对话",
  "com_ui_conversation_not_found": "对话未找到",
```

在 `"com_ui_no": "否",` 后面、`"com_ui_no_bookmarks"` 前面插入:

```json
  "com_ui_no": "否",
  "com_ui_no_bookmark_chats": "这个书签下还没有对话",
  "com_ui_no_bookmarks": "似乎您还没有书签，点击一个对话并添加一个新的书签",
```

在 `"com_ui_no_bookmarks"` 后面、`"com_ui_no_categories"` 前面插入(这两个 key 在 en 里已经存在,zh-Hans 之前漏掉了):

```json
  "com_ui_no_bookmarks": "似乎您还没有书签，点击一个对话并添加一个新的书签",
  "com_ui_no_bookmarks_match": "没有与您的搜索匹配的书签",
  "com_ui_no_bookmarks_title": "还没有书签",
  "com_ui_no_categories": "无可用类别",
```

在 `"com_ui_size_sort": "按大小排序",` 后面、`"com_ui_sort_by"` 前面插入:

```json
  "com_ui_size_sort": "按大小排序",
  "com_ui_sort_bookmarks_by": "书签排序",
  "com_ui_sort_by": "排序方式",
```

- [ ] **Step 3: 校验 JSON 合法 + 无重复 key**

```bash
cd /data/lidongyu/projects/LibreChat
node -e "JSON.parse(require('fs').readFileSync('client/src/locales/en/translation.json','utf8')); JSON.parse(require('fs').readFileSync('client/src/locales/zh-Hans/translation.json','utf8')); console.log('OK')"
for k in com_ui_all_bookmarks com_ui_sort_bookmarks_by com_ui_no_bookmark_chats com_ui_conversation com_ui_no_bookmarks_title com_ui_no_bookmarks_match; do
  echo "$k: en=$(grep -c "\"$k\":" client/src/locales/en/translation.json) zh=$(grep -c "\"$k\":" client/src/locales/zh-Hans/translation.json)"
done
```

Expected: `OK`,且每个 key 的 en/zh 计数都恰好是 `1`(不是 0,也不是 2)。

- [ ] **Step 4: 提交**

```bash
cd /data/lidongyu/projects/LibreChat
git add client/src/locales/en/translation.json client/src/locales/zh-Hans/translation.json
git commit -m "i18n(bookmarks): add keys for bookmarks grid/detail pages, backfill missing zh-Hans translations"
```

---

### Task 2: 把 `ProjectChatList` 改名搬到 `Conversations/` 目录下共用

**Files:**
- Create: `client/src/components/Conversations/ConversationListVirtual.tsx`
- Delete: `client/src/components/Projects/ProjectChatList.tsx`
- Modify: `client/src/components/Projects/ProjectWorkspace.tsx`

**Interfaces:**
- Consumes:无(纯搬迁,不依赖 Task 1)。
- Produces:`ConversationListVirtual` 组件,props 类型 `{ conversations: TConversation[]; isLoading: boolean; isFetchingNextPage: boolean; hasNextPage: boolean; sortBy: 'updatedAt' | 'createdAt'; emptyLabel: string; loadMore: () => void }`——和原来 `ProjectChatList` 的 props 完全一致,只是组件名字变了。Task 3 的 `BookmarkWorkspace.tsx` 会 import 这个组件。

- [ ] **Step 1: 新建 `client/src/components/Conversations/ConversationListVirtual.tsx`**

内容和 `client/src/components/Projects/ProjectChatList.tsx` 完全一样,只做三处改动:①同目录内的 import 改成相对路径;②组件/类型/displayName 里的 `Project`/`ProjectChatList`/`ProjectWorkspace` 字样换成中性的 `ConversationListVirtual`;③`CellMeasurerCache` 的 `keyMapper` 前缀字符串同步改名(纯内部缓存 key,不影响行为)。

```tsx
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type FC,
  type ReactNode,
} from 'react';
import throttle from 'lodash/throttle';
import { Spinner } from '@librechat/client';
import { AutoSizer, CellMeasurer, CellMeasurerCache, List } from 'react-virtualized';
import type { TConversation } from 'librechat-data-provider';
import type { MeasuredCellParent } from './Conversations';
import ConversationEndpointIcon from './ConversationEndpointIcon';
import { areConversationRenderPropsEqual } from './utils';
import { DateLabel } from './Conversations';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { groupConversationsByDate, cn } from '~/utils';
import { useActiveJobs } from '~/data-provider';

type ChatSortField = 'updatedAt' | 'createdAt';

type FlattenedItem =
  | { type: 'date'; groupName: string }
  | { type: 'convo'; convo: TConversation }
  | { type: 'loading' }
  | { type: 'empty' };

interface ConversationListVirtualProps {
  conversations: TConversation[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  sortBy: ChatSortField;
  emptyLabel: string;
  loadMore: () => void;
}

interface MeasuredRowProps {
  cache: CellMeasurerCache;
  rowKey: string;
  parent: MeasuredCellParent;
  index: number;
  style: CSSProperties;
  children: ReactNode;
}

const MeasuredRow: FC<MeasuredRowProps> = memo(
  ({ cache, rowKey, parent, index, style, children }) => (
    <CellMeasurer cache={cache} columnIndex={0} key={rowKey} parent={parent} rowIndex={index}>
      {({ registerChild }) => (
        <div ref={registerChild as React.LegacyRef<HTMLDivElement>} style={style}>
          {children}
        </div>
      )}
    </CellMeasurer>
  ),
);

MeasuredRow.displayName = 'ConversationListVirtualMeasuredRow';

const LoadingRow = memo(() => {
  const localize = useLocalize();
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-sm text-text-secondary">
      <Spinner className="text-text-primary" />
      <span>{localize('com_ui_loading')}</span>
    </div>
  );
});

LoadingRow.displayName = 'ConversationListVirtualLoadingRow';

const ConversationRow = memo(
  ({ conversation, isGenerating }: { conversation: TConversation; isGenerating: boolean }) => {
    const { navigateToConvo } = useNavigateToConvo();
    const localize = useLocalize();
    const title = conversation.title || localize('com_ui_untitled');
    const updatedAt = conversation.updatedAt || conversation.createdAt;
    const formattedDate = updatedAt ? new Date(updatedAt).toLocaleString() : '';

    return (
      <button
        type="button"
        className="flex w-full items-center gap-3 border-b border-border-light py-3 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary"
        onClick={() => navigateToConvo(conversation)}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center">
          <ConversationEndpointIcon conversation={conversation} size={24} context="menu-item" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-primary">{title}</span>
          <span className="block truncate text-xs text-text-secondary">{formattedDate}</span>
        </span>
        {isGenerating && (
          <Spinner
            className="h-4 w-4 shrink-0 text-text-primary"
            aria-label={localize('com_ui_generating')}
          />
        )}
      </button>
    );
  },
  areConversationRenderPropsEqual,
);

ConversationRow.displayName = 'ConversationListVirtualConversationRow';

const ConversationListVirtual = ({
  conversations,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  sortBy,
  emptyLabel,
  loadMore,
}: ConversationListVirtualProps) => {
  const { data: activeJobsData } = useActiveJobs();
  const activeJobIds = useMemo(
    () => new Set(activeJobsData?.activeJobIds ?? []),
    [activeJobsData?.activeJobIds],
  );
  const flattenedItems = useMemo(() => {
    if (isLoading) {
      return [{ type: 'loading' as const }];
    }
    if (!conversations.length) {
      return [{ type: 'empty' as const }];
    }

    const items: FlattenedItem[] = [];
    groupConversationsByDate(conversations, sortBy).forEach(([groupName, convos]) => {
      items.push({ type: 'date', groupName });
      convos.forEach((convo) => items.push({ type: 'convo', convo }));
    });
    if (isFetchingNextPage) {
      items.push({ type: 'loading' });
    }
    return items;
  }, [conversations, isFetchingNextPage, isLoading, sortBy]);

  const flattenedItemsRef = useRef(flattenedItems);
  flattenedItemsRef.current = flattenedItems;

  const cache = useMemo(
    () =>
      new CellMeasurerCache({
        fixedWidth: true,
        defaultHeight: 52,
        keyMapper: (index) => {
          const item = flattenedItemsRef.current[index];
          if (!item) {
            return `conversation-list-unknown-${index}`;
          }
          if (item.type === 'date') {
            return `conversation-list-date-${item.groupName}`;
          }
          if (item.type === 'convo') {
            return `conversation-list-convo-${item.convo.conversationId}`;
          }
          return `conversation-list-${item.type}`;
        },
      }),
    [],
  );

  const listRef = useRef<List | null>(null);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      cache.clearAll();
      listRef.current?.recomputeRowHeights(0);
    });
    return () => cancelAnimationFrame(frameId);
  }, [cache, conversations.length, sortBy]);

  const throttledLoadMore = useMemo(() => throttle(loadMore, 300), [loadMore]);

  const rowRenderer = useCallback(
    ({ index, key, parent, style }) => {
      const item = flattenedItems[index];
      const rowProps = { cache, rowKey: key, parent, index, style };

      if (item.type === 'loading') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <LoadingRow />
          </MeasuredRow>
        );
      }

      if (item.type === 'empty') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <div className="py-12 text-center text-sm text-text-secondary">{emptyLabel}</div>
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

      return (
        <MeasuredRow key={key} {...rowProps}>
          <ConversationRow
            conversation={item.convo}
            isGenerating={activeJobIds.has(item.convo.conversationId ?? '')}
          />
        </MeasuredRow>
      );
    },
    [activeJobIds, cache, emptyLabel, flattenedItems],
  );

  const getRowHeight = useCallback(
    ({ index }: { index: number }) => cache.getHeight(index, 0),
    [cache],
  );

  const handleRowsRendered = useCallback(
    ({ stopIndex }: { stopIndex: number }) => {
      if (hasNextPage && stopIndex >= flattenedItems.length - 6) {
        throttledLoadMore();
      }
    },
    [flattenedItems.length, hasNextPage, throttledLoadMore],
  );

  return (
    <div
      className={cn('min-h-[280px] flex-1 overflow-hidden rounded-lg border border-border-light')}
    >
      <AutoSizer>
        {({ width, height }) => (
          <List
            ref={listRef}
            width={width}
            height={height}
            rowCount={flattenedItems.length}
            rowHeight={getRowHeight}
            rowRenderer={rowRenderer}
            deferredMeasurementCache={cache}
            overscanRowCount={8}
            onRowsRendered={handleRowsRendered}
            className="outline-none"
            style={{ outline: 'none' }}
          />
        )}
      </AutoSizer>
    </div>
  );
};

export default memo(ConversationListVirtual);
```

- [ ] **Step 2: 删除旧文件**

```bash
cd /data/lidongyu/projects/LibreChat
rm client/src/components/Projects/ProjectChatList.tsx
```

- [ ] **Step 3: 更新 `ProjectWorkspace.tsx` 的 import 和用法**

用 Edit 工具做以下替换(文件里 import 块目前是这样,只改其中一行):

```tsx
// old:
import ProjectChatList from './ProjectChatList';
// new:
import ConversationListVirtual from '~/components/Conversations/ConversationListVirtual';
```

以及渲染的地方(目前是这样):

```tsx
// old:
          <ProjectChatList
            conversations={conversations}
            isLoading={isConversationsLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            sortBy={sortBy}
            emptyLabel={localize('com_ui_no_project_chats')}
            loadMore={() => fetchNextPage()}
          />
// new:
          <ConversationListVirtual
            conversations={conversations}
            isLoading={isConversationsLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            sortBy={sortBy}
            emptyLabel={localize('com_ui_no_project_chats')}
            loadMore={() => fetchNextPage()}
          />
```

- [ ] **Step 4: 验证**

```bash
cd /data/lidongyu/projects/LibreChat/client
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 和改动前基线一致(159,无新增)。

```bash
cd /data/lidongyu/projects/LibreChat
npx eslint client/src/components/Conversations/ConversationListVirtual.tsx client/src/components/Projects/ProjectWorkspace.tsx
```

Expected: 无输出(无报错)。

用 Playwright MCP 打开 `/projects/:id`(任意已有项目),确认对话列表照常渲染,点击对话能正常跳转。

- [ ] **Step 5: 提交**

```bash
cd /data/lidongyu/projects/LibreChat
git add client/src/components/Conversations/ConversationListVirtual.tsx client/src/components/Projects/ProjectWorkspace.tsx
git rm client/src/components/Projects/ProjectChatList.tsx
git commit -m "refactor(conversations): rename ProjectChatList to shared ConversationListVirtual"
```

---

### Task 3: 新建书签网格页 + 详情页 + 路由 + 侧边栏导航(不含改名/删除菜单)

**Files:**
- Create: `client/src/components/Bookmarks/BookmarksView.tsx`
- Create: `client/src/components/Bookmarks/BookmarkWorkspace.tsx`
- Modify: `client/src/components/Bookmarks/index.ts`
- Modify: `client/src/routes/index.tsx`
- Modify: `client/src/components/UnifiedSidebar/SideMenu.tsx`

**Interfaces:**
- Consumes:Task 1 的翻译 key(`com_ui_bookmarks`、`com_ui_all_bookmarks`、`com_ui_sort_bookmarks_by`、`com_ui_no_bookmark_chats`、`com_ui_no_bookmarks_title`、`com_ui_no_bookmarks_match`、`com_ui_bookmarks_filter`、`com_ui_bookmarks_new`、`com_ui_conversation`、`com_ui_conversations`,均已存在);Task 2 的 `ConversationListVirtual` 组件;已有的 `useConversationTagsQuery`、`useConversationsInfiniteQuery`(`tags` 参数)、`BookmarkEditDialog`、`BookmarkContext`。
- Produces:路由 `/bookmarks`(`BookmarksView`)、`/bookmarks/:tag`(`BookmarkWorkspace`);侧边栏"书签"导航行。Task 4 会再编辑这两个新文件,加入"…"菜单。

- [ ] **Step 1: 新建 `client/src/components/Bookmarks/BookmarksView.tsx`**

```tsx
import { useDeferredValue, useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, Bookmark, Check, Plus, Search } from 'lucide-react';
import { Input, Button, Spinner, DropdownPopup, useMediaQuery } from '@librechat/client';
import type { MenuItemProps, RenderProp } from '~/common';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { useConversationTagsQuery } from '~/data-provider';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import BookmarkEditDialog from './BookmarkEditDialog';

type BookmarkSort = 'name' | 'createdAt' | 'count';

function renderSortMenuItem(label: string, isSelected: boolean): RenderProp {
  return function SortMenuItem({ className, ...props }) {
    return (
      <div {...props} className={cn(className, 'justify-between gap-5')}>
        <span className="truncate">{label}</span>
        {isSelected ? (
          <Check className="h-4 w-4 shrink-0 text-text-primary" aria-hidden="true" />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </div>
    );
  };
}

export default function BookmarksView() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<BookmarkSort>('name');
  const [isCreating, setIsCreating] = useState(false);
  const sortMenuId = useId();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const { data, isLoading } = useConversationTagsQuery();
  const tags = useMemo(() => data ?? [], [data]);

  const filteredTags = useMemo(
    () => tags.filter((t) => t.tag.toLowerCase().includes(deferredSearch.toLowerCase())),
    [tags, deferredSearch],
  );

  const sortedTags = useMemo(() => {
    const list = [...filteredTags];
    list.sort((a, b) => {
      if (sortBy === 'count') {
        return b.count - a.count;
      }
      if (sortBy === 'createdAt') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.tag.localeCompare(b.tag);
    });
    return list;
  }, [filteredTags, sortBy]);

  const sortOptions = useMemo(
    () => [
      { value: 'name' as const, label: localize('com_ui_name') },
      { value: 'createdAt' as const, label: localize('com_ui_sort_created') },
      { value: 'count' as const, label: localize('com_ui_conversations') },
    ],
    [localize],
  );
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? localize('com_ui_name');
  const sortMenuItems = useMemo<MenuItemProps[]>(
    () =>
      sortOptions.map((option) => {
        const isSelected = sortBy === option.value;
        return {
          id: `bookmark-sort-${option.value}`,
          ariaLabel: option.label,
          ariaChecked: isSelected,
          onClick: () => setSortBy(option.value),
          render: renderSortMenuItem(option.label, isSelected),
        };
      }),
    [sortBy, sortOptions],
  );

  return (
    <BookmarkContext.Provider value={{ bookmarks: tags }}>
      <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
        <div className="container mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 md:px-6 lg:pt-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {isSmallScreen ? <OpenSidebar /> : null}
              <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
                {localize('com_ui_bookmarks')}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-text-secondary sm:inline">
                {localize('com_ui_sort_by')}
              </span>
              <DropdownPopup
                portal={true}
                focusLoop={true}
                unmountOnHide={true}
                menuId={sortMenuId}
                isOpen={isSortMenuOpen}
                setIsOpen={setIsSortMenuOpen}
                className="z-[125] min-w-56"
                trigger={
                  <Ariakit.MenuButton
                    aria-label={localize('com_ui_sort_bookmarks_by')}
                    className={cn(
                      'inline-flex h-10 items-center justify-between gap-2 whitespace-nowrap rounded-lg border border-border-medium bg-surface-secondary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary disabled:pointer-events-none disabled:opacity-50 sm:w-44',
                      isSortMenuOpen && 'bg-surface-hover text-text-primary',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ArrowUpDown
                        className="h-4 w-4 shrink-0 text-text-secondary"
                        aria-hidden="true"
                      />
                      <span className="truncate">{selectedSortLabel}</span>
                    </span>
                  </Ariakit.MenuButton>
                }
                items={sortMenuItems}
              />
              <Button type="button" variant="submit" size="sm" onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_bookmarks_new')}
              </Button>
            </div>
          </div>

          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{localize('com_ui_bookmarks_filter')}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={localize('com_ui_bookmarks_filter')}
              className="border-border-medium bg-surface-secondary pl-9 text-text-primary placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          </label>

          <BookmarkEditDialog open={isCreating} setOpen={setIsCreating} context="BookmarksView" />

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="text-text-primary" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              {sortedTags.map((tag) => (
                <button
                  key={tag._id}
                  type="button"
                  className={cn(
                    'flex min-h-[8.5rem] flex-col rounded-xl border border-border-medium bg-surface-secondary p-4 text-left transition-colors',
                    'hover:border-border-heavy hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                  )}
                  onClick={() => navigate(`/bookmarks/${encodeURIComponent(tag.tag)}`)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Bookmark className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                    <span className="truncate text-base font-semibold text-text-primary">
                      {tag.tag}
                    </span>
                  </span>
                  <span className="mt-auto flex items-center gap-2 pt-4 text-xs text-text-secondary">
                    {tag.count === 1
                      ? `1 ${localize('com_ui_conversation')}`
                      : `${tag.count} ${localize('com_ui_conversations')}`}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!isLoading && sortedTags.length === 0 && (
            <div className="rounded-lg border border-border-medium bg-transparent py-16 text-center text-sm text-text-secondary">
              {deferredSearch
                ? localize('com_ui_no_bookmarks_match')
                : localize('com_ui_no_bookmarks_title')}
            </div>
          )}
        </div>
      </main>
    </BookmarkContext.Provider>
  );
}
```

- [ ] **Step 2: 新建 `client/src/components/Bookmarks/BookmarkWorkspace.tsx`**

```tsx
import { useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ArrowLeft, ArrowUpDown, Bookmark, Check } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ConversationListResponse } from 'librechat-data-provider';
import { DropdownPopup } from '@librechat/client';
import type { MenuItemProps, RenderProp } from '~/common';
import ConversationListVirtual from '~/components/Conversations/ConversationListVirtual';
import { useConversationsInfiniteQuery, useConversationTagsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type ChatSortField = 'updatedAt' | 'createdAt';

function renderSortMenuItem(label: string, isSelected: boolean): RenderProp {
  return function SortMenuItem({ className, ...props }) {
    return (
      <div {...props} className={cn(className, 'justify-between gap-5')}>
        <span className="truncate">{label}</span>
        {isSelected ? (
          <Check className="h-4 w-4 shrink-0 text-text-primary" aria-hidden="true" />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </div>
    );
  };
}

export default function BookmarkWorkspace() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { tag: encodedTag = '' } = useParams();
  const tag = decodeURIComponent(encodedTag);
  const [sortBy, setSortBy] = useState<ChatSortField>('updatedAt');
  const sortMenuId = useId();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const { data: tagsData } = useConversationTagsQuery();
  const currentTag = useMemo(() => tagsData?.find((t) => t.tag === tag), [tagsData, tag]);

  const sortOptions = useMemo(
    () => [
      { value: 'updatedAt' as const, label: localize('com_ui_sort_updated') },
      { value: 'createdAt' as const, label: localize('com_ui_sort_created') },
    ],
    [localize],
  );
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? localize('com_ui_sort_updated');
  const sortMenuItems = useMemo<MenuItemProps[]>(
    () =>
      sortOptions.map((option) => {
        const isSelected = sortBy === option.value;
        return {
          id: `bookmark-chat-sort-${option.value}`,
          ariaLabel: option.label,
          ariaChecked: isSelected,
          onClick: () => setSortBy(option.value),
          render: renderSortMenuItem(option.label, isSelected),
        };
      }),
    [sortBy, sortOptions],
  );

  const {
    data,
    fetchNextPage,
    isFetchingNextPage,
    isLoading: isConversationsLoading,
  } = useConversationsInfiniteQuery(
    { tags: [tag], sortBy, sortDirection: 'desc' },
    { enabled: Boolean(tag), staleTime: 30000, cacheTime: 300000 },
  );

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.conversations) ?? [],
    [data?.pages],
  );

  const hasNextPage = useMemo(() => {
    const pages = data?.pages;
    if (!pages?.length) {
      return false;
    }
    const lastPage: ConversationListResponse = pages[pages.length - 1];
    return lastPage.nextCursor !== null;
  }, [data?.pages]);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-primary text-text-primary">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10 pt-4 md:px-6 lg:pt-8">
        <button
          type="button"
          onClick={() => navigate('/bookmarks')}
          className="-ml-1.5 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_all_bookmarks')}
        </button>

        <header className="mt-5 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-secondary text-text-secondary">
            <Bookmark className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">
              {tag}
            </h1>
          </div>
        </header>

        <section className="mt-8 flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="flex items-baseline gap-2 text-sm font-medium text-text-primary">
              {localize('com_ui_chats')}
              <span className="text-text-secondary">
                {currentTag?.count ?? conversations.length}
              </span>
            </h2>
            <DropdownPopup
              portal={true}
              focusLoop={true}
              unmountOnHide={true}
              menuId={sortMenuId}
              isOpen={isSortMenuOpen}
              setIsOpen={setIsSortMenuOpen}
              className="z-[125] min-w-44"
              trigger={
                <Ariakit.MenuButton
                  aria-label={localize('com_ui_sort_chats_by')}
                  className={cn(
                    'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                    isSortMenuOpen && 'bg-surface-hover text-text-primary',
                  )}
                >
                  <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                  {selectedSortLabel}
                </Ariakit.MenuButton>
              }
              items={sortMenuItems}
            />
          </div>
          <ConversationListVirtual
            conversations={conversations}
            isLoading={isConversationsLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            sortBy={sortBy}
            emptyLabel={localize('com_ui_no_bookmark_chats')}
            loadMore={() => fetchNextPage()}
          />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 在 `client/src/components/Bookmarks/index.ts` 里加两个导出**

```ts
// old:
export { default as DeleteBookmarkButton } from './DeleteBookmarkButton';
export { default as EditBookmarkButton } from './EditBookmarkButton';
export { default as BookmarkEditDialog } from './BookmarkEditDialog';
export { default as BookmarkItems } from './BookmarkItems';
export { default as BookmarkItem } from './BookmarkItem';
export { default as BookmarkForm } from './BookmarkForm';
// new:
export { default as DeleteBookmarkButton } from './DeleteBookmarkButton';
export { default as EditBookmarkButton } from './EditBookmarkButton';
export { default as BookmarkEditDialog } from './BookmarkEditDialog';
export { default as BookmarkItems } from './BookmarkItems';
export { default as BookmarkItem } from './BookmarkItem';
export { default as BookmarkForm } from './BookmarkForm';
export { default as BookmarksView } from './BookmarksView';
export { default as BookmarkWorkspace } from './BookmarkWorkspace';
```

(`BookmarkItems`/`BookmarkItem` 这两行留着,Task 5 清理死代码时再删。)

- [ ] **Step 4: 在 `client/src/routes/index.tsx` 里注册路由**

在 `loadProjectWorkspace` 定义后面加两个 loader(紧跟着已有的 projects loader,保持同样的写法):

```tsx
// old:
const loadProjectWorkspace = () =>
  import('~/components/Projects').then((m) => ({
    Component: m.ProjectWorkspace,
  }));

const baseEl = document.querySelector('base');
// new:
const loadProjectWorkspace = () =>
  import('~/components/Projects').then((m) => ({
    Component: m.ProjectWorkspace,
  }));

const loadBookmarksView = () =>
  import('~/components/Bookmarks').then((m) => ({
    Component: m.BookmarksView,
  }));

const loadBookmarkWorkspace = () =>
  import('~/components/Bookmarks').then((m) => ({
    Component: m.BookmarkWorkspace,
  }));

const baseEl = document.querySelector('base');
```

在 `projects/:projectId` 路由后面加两条路由:

```tsx
// old:
            {
              path: 'projects/:projectId',
              lazy: loadProjectWorkspace,
            },
            {
              path: 'agents',
// new:
            {
              path: 'projects/:projectId',
              lazy: loadProjectWorkspace,
            },
            {
              path: 'bookmarks',
              lazy: loadBookmarksView,
            },
            {
              path: 'bookmarks/:tag',
              lazy: loadBookmarkWorkspace,
            },
            {
              path: 'agents',
```

- [ ] **Step 5: 在 `client/src/components/UnifiedSidebar/SideMenu.tsx` 里加导航行**

```tsx
// old:
import {
  X,
  Sun,
  Moon,
  Image,
  Folder,
  Search,
  Telescope,
  SquarePen,
  LayoutGrid,
  MessageCircleHeart,
} from 'lucide-react';
// new:
import {
  X,
  Sun,
  Moon,
  Image,
  Folder,
  Search,
  Bookmark,
  Telescope,
  SquarePen,
  LayoutGrid,
  MessageCircleHeart,
} from 'lucide-react';
```

```tsx
// old:
        <NavRow
          icon={Folder}
          label={localize('com_ui_projects')}
          onClick={() => navigate('/projects')}
        />
        <NavRow icon={Image} label={localize('com_ui_images')} onClick={() => navigate('/images')} />
// new:
        <NavRow
          icon={Folder}
          label={localize('com_ui_projects')}
          onClick={() => navigate('/projects')}
        />
        <NavRow
          icon={Bookmark}
          label={localize('com_ui_bookmarks')}
          onClick={() => navigate('/bookmarks')}
        />
        <NavRow icon={Image} label={localize('com_ui_images')} onClick={() => navigate('/images')} />
```

- [ ] **Step 6: 验证**

```bash
cd /data/lidongyu/projects/LibreChat/client
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 159(基线,无新增)。

```bash
cd /data/lidongyu/projects/LibreChat
npx eslint --fix client/src/components/Bookmarks/BookmarksView.tsx client/src/components/Bookmarks/BookmarkWorkspace.tsx client/src/components/Bookmarks/index.ts client/src/routes/index.tsx client/src/components/UnifiedSidebar/SideMenu.tsx
npx eslint client/src/components/Bookmarks/BookmarksView.tsx client/src/components/Bookmarks/BookmarkWorkspace.tsx client/src/components/Bookmarks/index.ts client/src/routes/index.tsx client/src/components/UnifiedSidebar/SideMenu.tsx
```

Expected: 第二条命令无输出。

用 Playwright MCP 走一遍:侧边栏"项目"后面出现"书签"按钮 → 点击跳转 `/bookmarks` → 点"新书签"建一个测试标签 → 网格页出现这张卡片(对话数 0)→ 点卡片跳转 `/bookmarks/<标签名>` → 页面显示标题+空的对话列表(还没有"…"菜单,这是预期的,Task 4 才加)。

- [ ] **Step 7: 提交**

```bash
cd /data/lidongyu/projects/LibreChat
git add client/src/components/Bookmarks/BookmarksView.tsx client/src/components/Bookmarks/BookmarkWorkspace.tsx client/src/components/Bookmarks/index.ts client/src/routes/index.tsx client/src/components/UnifiedSidebar/SideMenu.tsx
git commit -m "feat(bookmarks): add bookmarks grid page, detail page, routes, sidebar nav entry"
```

---

### Task 4: 新建 `BookmarkDeleteDialog` + `BookmarkActionsMenu`,接入网格卡片和详情页头部

**Files:**
- Create: `client/src/components/Bookmarks/BookmarkDeleteDialog.tsx`
- Create: `client/src/components/Bookmarks/BookmarkActionsMenu.tsx`
- Modify: `client/src/components/Bookmarks/BookmarksView.tsx`
- Modify: `client/src/components/Bookmarks/BookmarkWorkspace.tsx`

**Interfaces:**
- Consumes:Task 3 的 `BookmarksView.tsx`/`BookmarkWorkspace.tsx`;已有的 `useDeleteConversationTagMutation`、`BookmarkEditDialog`(编辑模式,传 `bookmark` prop)、`useConversationTagsQuery`。
- Produces:`BookmarkActionsMenu` 组件,props `{ bookmark: TConversationTag; className?: string }`——网格卡片和详情页头部各用一个实例。

- [ ] **Step 1: 新建 `client/src/components/Bookmarks/BookmarkDeleteDialog.tsx`**

```tsx
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  useToastContext,
} from '@librechat/client';
import type { TConversationTag } from 'librechat-data-provider';
import { useDeleteConversationTagMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

export default function BookmarkDeleteDialog({
  open,
  onOpenChange,
  bookmark,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmark: TConversationTag;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToastContext();

  const deleteTagMutation = useDeleteConversationTagMutation({
    onSuccess: () => {
      onOpenChange(false);
      if (location.pathname === `/bookmarks/${encodeURIComponent(bookmark.tag)}`) {
        navigate('/bookmarks');
      }
    },
    onError: () =>
      showToast({
        message: localize('com_ui_bookmarks_delete_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      }),
  });

  const confirmDelete = () => {
    deleteTagMutation.mutate(bookmark.tag);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-md" showCloseButton={false}>
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_bookmarks_delete')}</OGDialogTitle>
        </OGDialogHeader>
        <div className="text-sm text-text-secondary">
          {localize('com_ui_bookmark_delete_confirm')} <strong>{bookmark.tag}</strong>
        </div>
        <div className="flex justify-end gap-4 pt-4">
          <OGDialogClose asChild>
            <Button aria-label="cancel" variant="outline">
              {localize('com_ui_cancel')}
            </Button>
          </OGDialogClose>
          <Button
            variant="destructive"
            onClick={confirmDelete}
            disabled={deleteTagMutation.isLoading}
          >
            {deleteTagMutation.isLoading ? (
              <Spinner className="size-4" />
            ) : (
              localize('com_ui_delete')
            )}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
```

- [ ] **Step 2: 新建 `client/src/components/Bookmarks/BookmarkActionsMenu.tsx`**

```tsx
import { useId, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import type { TConversationTag } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import { useConversationTagsQuery } from '~/data-provider';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import BookmarkEditDialog from './BookmarkEditDialog';
import BookmarkDeleteDialog from './BookmarkDeleteDialog';

export default function BookmarkActionsMenu({
  bookmark,
  className,
}: {
  bookmark: TConversationTag;
  className?: string;
}) {
  const localize = useLocalize();
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { data } = useConversationTagsQuery();

  const items: MenuItemProps[] = [
    {
      label: localize('com_ui_bookmarks_edit'),
      onClick: () => setShowEditDialog(true),
      icon: <Pencil className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
    },
    {
      label: localize('com_ui_bookmarks_delete'),
      onClick: () => setShowDeleteDialog(true),
      icon: <Trash2 className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
    },
  ];

  return (
    <BookmarkContext.Provider value={{ bookmarks: data ?? [] }}>
      <DropdownPopup
        portal={true}
        menuId={menuId}
        focusLoop={true}
        className="z-[125]"
        unmountOnHide={true}
        isOpen={isMenuOpen}
        setIsOpen={setIsMenuOpen}
        trigger={
          <Ariakit.MenuButton
            aria-label={localize('com_ui_more_options')}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
              className,
            )}
          >
            <Ellipsis className="h-4 w-4" aria-hidden="true" />
          </Ariakit.MenuButton>
        }
        items={items}
      />
      <BookmarkEditDialog
        open={showEditDialog}
        setOpen={setShowEditDialog}
        context="BookmarkActionsMenu"
        bookmark={bookmark}
      />
      <BookmarkDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        bookmark={bookmark}
      />
    </BookmarkContext.Provider>
  );
}
```

- [ ] **Step 3: 把菜单接入 `BookmarksView.tsx` 的卡片**

```tsx
// old (import 块):
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import BookmarkEditDialog from './BookmarkEditDialog';
// new:
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import BookmarkEditDialog from './BookmarkEditDialog';
import BookmarkActionsMenu from './BookmarkActionsMenu';
```

```tsx
// old (卡片渲染部分):
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              {sortedTags.map((tag) => (
                <button
                  key={tag._id}
                  type="button"
                  className={cn(
                    'flex min-h-[8.5rem] flex-col rounded-xl border border-border-medium bg-surface-secondary p-4 text-left transition-colors',
                    'hover:border-border-heavy hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                  )}
                  onClick={() => navigate(`/bookmarks/${encodeURIComponent(tag.tag)}`)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Bookmark className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                    <span className="truncate text-base font-semibold text-text-primary">
                      {tag.tag}
                    </span>
                  </span>
                  <span className="mt-auto flex items-center gap-2 pt-4 text-xs text-text-secondary">
                    {tag.count === 1
                      ? `1 ${localize('com_ui_conversation')}`
                      : `${tag.count} ${localize('com_ui_conversations')}`}
                  </span>
                </button>
              ))}
            </div>
// new:
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              {sortedTags.map((tag) => (
                <div key={tag._id} className="group/bookmark relative">
                  <button
                    type="button"
                    className={cn(
                      'flex min-h-[8.5rem] w-full flex-col rounded-xl border border-border-medium bg-surface-secondary p-4 text-left transition-colors',
                      'hover:border-border-heavy hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                    )}
                    onClick={() => navigate(`/bookmarks/${encodeURIComponent(tag.tag)}`)}
                  >
                    <span className="flex min-w-0 items-center gap-2 pr-8">
                      <Bookmark
                        className="h-4 w-4 shrink-0 text-text-secondary"
                        aria-hidden="true"
                      />
                      <span className="truncate text-base font-semibold text-text-primary">
                        {tag.tag}
                      </span>
                    </span>
                    <span className="mt-auto flex items-center gap-2 pt-4 text-xs text-text-secondary">
                      {tag.count === 1
                        ? `1 ${localize('com_ui_conversation')}`
                        : `${tag.count} ${localize('com_ui_conversations')}`}
                    </span>
                  </button>
                  <BookmarkActionsMenu
                    bookmark={tag}
                    className="absolute right-3 top-3 opacity-0 focus:opacity-100 group-hover/bookmark:opacity-100 group-focus-within/bookmark:opacity-100"
                  />
                </div>
              ))}
            </div>
```

- [ ] **Step 4: 把菜单接入 `BookmarkWorkspace.tsx` 的详情页头部**

```tsx
// old:
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">
              {tag}
            </h1>
          </div>
        </header>
// new:
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">
              {tag}
            </h1>
          </div>
          {currentTag && <BookmarkActionsMenu bookmark={currentTag} className="mt-0.5 shrink-0" />}
        </header>
```

并在文件顶部的 import 块里加一行(放在其他本地 import 之间):

```tsx
// old:
import ConversationListVirtual from '~/components/Conversations/ConversationListVirtual';
import { useConversationsInfiniteQuery, useConversationTagsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
// new:
import ConversationListVirtual from '~/components/Conversations/ConversationListVirtual';
import { useConversationsInfiniteQuery, useConversationTagsQuery } from '~/data-provider';
import BookmarkActionsMenu from './BookmarkActionsMenu';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
```

- [ ] **Step 5: 验证**

```bash
cd /data/lidongyu/projects/LibreChat/client
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 159(基线,无新增)。

```bash
cd /data/lidongyu/projects/LibreChat
npx eslint --fix client/src/components/Bookmarks/BookmarkDeleteDialog.tsx client/src/components/Bookmarks/BookmarkActionsMenu.tsx client/src/components/Bookmarks/BookmarksView.tsx client/src/components/Bookmarks/BookmarkWorkspace.tsx
npx eslint client/src/components/Bookmarks/BookmarkDeleteDialog.tsx client/src/components/Bookmarks/BookmarkActionsMenu.tsx client/src/components/Bookmarks/BookmarksView.tsx client/src/components/Bookmarks/BookmarkWorkspace.tsx
```

Expected: 第二条命令无输出。

用 Playwright MCP 走一遍:网格页卡片 hover 出现"…" → 点"编辑书签"改名,卡片和已打过这个标签的对话上都同步更新 → 点"删除书签",卡片消失,原本打了这个标签的对话本身不受影响 → 进入某个标签详情页,头部"…"菜单一样能编辑/删除,删除后自动跳回 `/bookmarks`。

- [ ] **Step 6: 提交**

```bash
cd /data/lidongyu/projects/LibreChat
git add client/src/components/Bookmarks/BookmarkDeleteDialog.tsx client/src/components/Bookmarks/BookmarkActionsMenu.tsx client/src/components/Bookmarks/BookmarksView.tsx client/src/components/Bookmarks/BookmarkWorkspace.tsx
git commit -m "feat(bookmarks): add rename/delete actions menu to grid cards and detail header"
```

---

### Task 5: 清理死代码

**Files:**
- Delete: `client/src/components/SidePanel/Bookmarks/BookmarkPanel.tsx`
- Delete: `client/src/components/SidePanel/Bookmarks/BookmarkTable.tsx`
- Delete: `client/src/components/SidePanel/Bookmarks/BookmarkList.tsx`
- Delete: `client/src/components/SidePanel/Bookmarks/BookmarkCard.tsx`
- Delete: `client/src/components/SidePanel/Bookmarks/BookmarkCardActions.tsx`
- Delete: `client/src/components/SidePanel/Bookmarks/BookmarkEmptyState.tsx`
- Delete: `client/src/components/SidePanel/Bookmarks/index.ts`
- Delete: `client/src/components/Nav/Bookmarks/BookmarkNav.tsx`
- Delete: `client/src/components/Chat/Menus/Bookmarks/BookmarkMenuItems.tsx`
- Delete: `client/src/components/Bookmarks/BookmarkItems.tsx`
- Delete: `client/src/components/Bookmarks/BookmarkItem.tsx`
- Modify: `client/src/components/Bookmarks/index.ts`
- Modify: `client/src/hooks/Nav/useSideNavLinks.ts`
- Modify: `client/src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx`

**Interfaces:**
- Consumes:无新接口。这一步纯删除,前提是 Task 3/4 已经把浏览入口接好,书签功能不再依赖这些文件。
- Produces:无新接口——只是让代码库不再有并行的两套书签实现。

- [ ] **Step 1: 删除孤儿文件**

```bash
cd /data/lidongyu/projects/LibreChat
rm -r client/src/components/SidePanel/Bookmarks
rm -r client/src/components/Nav/Bookmarks
rm client/src/components/Chat/Menus/Bookmarks/BookmarkMenuItems.tsx
rmdir client/src/components/Chat/Menus/Bookmarks
rm client/src/components/Bookmarks/BookmarkItems.tsx
rm client/src/components/Bookmarks/BookmarkItem.tsx
```

- [ ] **Step 2: 更新 `client/src/components/Bookmarks/index.ts`,去掉两个导出**

```ts
// old:
export { default as DeleteBookmarkButton } from './DeleteBookmarkButton';
export { default as EditBookmarkButton } from './EditBookmarkButton';
export { default as BookmarkEditDialog } from './BookmarkEditDialog';
export { default as BookmarkItems } from './BookmarkItems';
export { default as BookmarkItem } from './BookmarkItem';
export { default as BookmarkForm } from './BookmarkForm';
export { default as BookmarksView } from './BookmarksView';
export { default as BookmarkWorkspace } from './BookmarkWorkspace';
// new:
export { default as DeleteBookmarkButton } from './DeleteBookmarkButton';
export { default as EditBookmarkButton } from './EditBookmarkButton';
export { default as BookmarkEditDialog } from './BookmarkEditDialog';
export { default as BookmarkForm } from './BookmarkForm';
export { default as BookmarksView } from './BookmarksView';
export { default as BookmarkWorkspace } from './BookmarkWorkspace';
```

- [ ] **Step 3: 修 `client/src/hooks/Nav/useSideNavLinks.ts`**

去掉 `Bookmark` 图标 import:

```tsx
// old:
import {
  Bot,
  Brain,
  Bookmark,
  NotebookPen,
  ScrollText,
  ArrowRightToLine,
  SlidersHorizontal,
} from 'lucide-react';
// new:
import {
  Bot,
  Brain,
  NotebookPen,
  ScrollText,
  ArrowRightToLine,
  SlidersHorizontal,
} from 'lucide-react';
```

去掉 `BookmarkPanel` import:

```tsx
// old:
import MCPBuilderPanel from '~/components/SidePanel/MCPBuilder/MCPBuilderPanel';
import AgentPanelSwitch from '~/components/SidePanel/Agents/AgentPanelSwitch';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';
import PanelSwitch from '~/components/SidePanel/Builder/PanelSwitch';
// new:
import MCPBuilderPanel from '~/components/SidePanel/MCPBuilder/MCPBuilderPanel';
import AgentPanelSwitch from '~/components/SidePanel/Agents/AgentPanelSwitch';
import PanelSwitch from '~/components/SidePanel/Builder/PanelSwitch';
```

去掉 `hasAccessToBookmarks` 声明:

```tsx
// old:
  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });
  const hasAccessToMemories = useHasAccess({
// new:
  const hasAccessToMemories = useHasAccess({
```

去掉 push 书签面板的代码块:

```tsx
// old:
    if (hasAccessToBookmarks) {
      links.push({
        title: 'com_sidepanel_conversation_tags',
        label: '',
        icon: Bookmark,
        id: 'bookmarks',
        Component: BookmarkPanel,
      });
    }

    links.push({
      title: 'com_sidepanel_attach_files',
// new:
    links.push({
      title: 'com_sidepanel_attach_files',
```

从依赖数组里去掉:

```tsx
// old:
    interfaceConfig.parameters,
    endpointType,
    hasAccessToBookmarks,
    availableMCPServers,
// new:
    interfaceConfig.parameters,
    endpointType,
    availableMCPServers,
```

- [ ] **Step 4: 修 `client/src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx`**

去掉对已删除模块的 mock:

```tsx
// old:
jest.mock('~/components/SidePanel/MCPBuilder/MCPBuilderPanel', () => () => null);
jest.mock('~/components/SidePanel/Agents/AgentPanelSwitch', () => () => null);
jest.mock('~/components/SidePanel/Bookmarks/BookmarkPanel', () => () => null);
jest.mock('~/components/SidePanel/Builder/PanelSwitch', () => () => null);
// new:
jest.mock('~/components/SidePanel/MCPBuilder/MCPBuilderPanel', () => () => null);
jest.mock('~/components/SidePanel/Agents/AgentPanelSwitch', () => () => null);
jest.mock('~/components/SidePanel/Builder/PanelSwitch', () => () => null);
```

去掉 lucide-react mock 里的 `Bookmark`:

```tsx
// old:
jest.mock('lucide-react', () => ({
  Bot: () => null,
  Brain: () => null,
  Bookmark: () => null,
  NotebookPen: () => null,
  ScrollText: () => null,
  ArrowRightToLine: () => null,
  SlidersHorizontal: () => null,
}));
// new:
jest.mock('lucide-react', () => ({
  Bot: () => null,
  Brain: () => null,
  NotebookPen: () => null,
  ScrollText: () => null,
  ArrowRightToLine: () => null,
  SlidersHorizontal: () => null,
}));
```

- [ ] **Step 5: 验证**

```bash
cd /data/lidongyu/projects/LibreChat/client
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 159(基线,无新增;确认删除这些文件没有产生任何悬空 import 报错)。

```bash
cd /data/lidongyu/projects/LibreChat
npx eslint --fix client/src/components/Bookmarks/index.ts client/src/hooks/Nav/useSideNavLinks.ts client/src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx
npx eslint client/src/components/Bookmarks/index.ts client/src/hooks/Nav/useSideNavLinks.ts client/src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx
```

Expected: 第二条命令无输出。

```bash
cd /data/lidongyu/projects/LibreChat/client
LD_LIBRARY_PATH=/data/lidongyu/.local/ssl1.1/usr/lib/x86_64-linux-gnu MONGOMS_VERSION=4.4.18 \
  npx jest src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx --silent 2>&1 | grep -E "Tests:|Test Suites:|FAIL|✕"
```

Expected: 2/2 通过(原有两条 memories 相关断言不受影响)。

再确认没有任何文件还在引用被删掉的模块:

```bash
cd /data/lidongyu/projects/LibreChat
grep -rn "SidePanel/Bookmarks\|Nav/Bookmarks/BookmarkNav\|Chat/Menus/Bookmarks/BookmarkMenuItems\|Bookmarks/BookmarkItems\|Bookmarks/BookmarkItem'" client/src --include="*.tsx" --include="*.ts"
```

Expected: 无输出。

- [ ] **Step 6: 提交**

```bash
cd /data/lidongyu/projects/LibreChat
git add -u client/src/components/SidePanel/Bookmarks client/src/components/Nav/Bookmarks client/src/components/Chat/Menus/Bookmarks client/src/components/Bookmarks/BookmarkItems.tsx client/src/components/Bookmarks/BookmarkItem.tsx client/src/components/Bookmarks/index.ts client/src/hooks/Nav/useSideNavLinks.ts client/src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx
git commit -m "chore(bookmarks): remove dead code superseded by the new bookmarks browsing pages"
```

(注意:这里用 `git add -u` 而不是 `-A`——只暂存已跟踪文件的改动/删除,不会误把无关的新文件带进来;`rm -r` 删除的目录本来就是已跟踪文件,`-u` 能正确捕获。)

---

### Task 6: 全量验证

**Files:**
- 不改动文件,只跑验证命令。

**Interfaces:**
- 无。

- [ ] **Step 1: tsc 全量检查**

```bash
cd /data/lidongyu/projects/LibreChat/client
npx tsc --noEmit 2>&1 | tee /tmp/bookmarks-tsc.log | tail -5
grep -c "error TS" /tmp/bookmarks-tsc.log
```

Expected: 159(和 Task 1 之前的基线一致,全程无回归)。

- [ ] **Step 2: eslint 全量检查改动过的目录**

```bash
cd /data/lidongyu/projects/LibreChat
npx eslint client/src/components/Bookmarks client/src/components/Conversations/ConversationListVirtual.tsx client/src/components/Projects/ProjectWorkspace.tsx client/src/components/UnifiedSidebar/SideMenu.tsx client/src/routes/index.tsx client/src/hooks/Nav/useSideNavLinks.ts client/src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx client/src/locales/en/translation.json client/src/locales/zh-Hans/translation.json
```

Expected: 无输出。

- [ ] **Step 3: 浏览器完整冒烟(用 Playwright MCP,dev server 已在跑)**

1. 侧边栏"项目"后面出现"书签"按钮(无展开箭头),点击跳转 `/bookmarks`。
2. 在任意一条现有对话上,通过对话头部原有的书签按钮打一个新标签(比如"测试书签")。
3. 回到 `/bookmarks`,确认这张卡片出现,对话数为 1。
4. 点进 `/bookmarks/测试书签`,确认这条对话出现在列表里,点击能正常跳转到该对话。
5. 网格页:输入搜索词过滤;切换排序(名称/创建时间/对话数量);点"新书签"建一个空标签,卡片对话数为 0。
6. 网格卡片"…"菜单:改名后卡片和刚才那条对话上的标签同步更新;删除一个空标签后卡片消失。
7. 详情页头部"…"菜单:改名/删除都正常,删除后自动跳回 `/bookmarks`。
8. 确认 `/bookmarks` 和 `/bookmarks/:tag` 整个流程没有出现任何非预期的控制台报错(良性的、已知的无关报错——比如 Meili 搜索连不上——不算)。

- [ ] **Step 4: 清理本次验证产生的测试数据(可选,视 dev 环境数据整洁度需要而定)**

如果第 3 步创建的"测试书签"/"空标签"等测试数据需要清理,直接在 `/bookmarks` 页面用"…"菜单删除即可。

- [ ] **Step 5: 最终确认无遗留改动**

```bash
cd /data/lidongyu/projects/LibreChat
git status --short
```

Expected: 干净(所有改动都已经在前 5 个 Task 的提交里),没有意外的未跟踪/未暂存文件。
