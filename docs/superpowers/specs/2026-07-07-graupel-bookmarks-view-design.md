# 书签浏览视图 — 设计

## 背景

对话页头部已经有一个能用的"添加书签"按钮(`Chat/Menus/BookmarkMenu.tsx`),可以给任意对话打上一个或多个自定义标签("书签")。打标签这一步是真实持久化的(`conversation.tags`,后端是一个 `ConversationTag` 集合,字段有 `tag`、`description`、`count`、`position`)。但目前**整个界面上完全没有地方能看到打过标签的对话**:

- 侧边栏原来的标签筛选下拉框(`Nav/Bookmarks/BookmarkNav.tsx`)在为 Private Chat Projects 重建侧边栏时就被**特意排除**了,等着单独做一次设计。
- 老版右侧面板里挂的书签管理表格(`SidePanel/Bookmarks/*`,通过 `useSideNavLinks.ts` 注册)在现在这套 UnifiedSidebar 布局里**零消费者**——从来没有被重新接上过。

打标签目前是个死胡同操作。这份 spec 设计缺失的浏览入口,沿用刚刚为 Private Chat Projects 上线的两层结构(侧边栏扁平导航按钮 → 网格页 → 单个实体详情页)——这也是用户确认过的参考结构。

## 不做的事

- 不动后端。`GET /api/convos?tags=<tag>` 已经支持按标签过滤;`useConversationTagsQuery`、`useConversationTagMutation`、`useDeleteConversationTagMutation` 都已经存在且能用。
- 不做标签拖拽排序(老面板里靠 `position` 字段实现过,v1 先砍掉——排序下拉框已经能满足同样的需求,不用引入拖拽的复杂度)。
- 不做"在这个书签里新建对话"。和"项目"不一样,标签不是对话被创建"归属"进去的容器——标签是打在已存在的对话上的。标签详情页只做浏览(以及标签本身的改名/删除)。
- 不对老版右侧面板系统做超出书签范围的死代码大扫除(文件/Prompts/记忆/技能几个面板是不相关的功能,保持不动)。

## 导航

- `SideMenu.tsx`:新增一个扁平的"书签"`NavRow`(`com_ui_bookmarks`,已存在),紧跟在"项目"后面,图标用 `lucide-react` 的 `Bookmark`(项目里其他地方已经用这个图标表达同一个概念)。点击跳转到 `/bookmarks`。
- 路由(完全照搬 `/projects` + `/projects/:projectId` 的写法,`client/src/routes/index.tsx`):
  - `{ path: 'bookmarks', lazy: loadBookmarksView }` → `BookmarksView`
  - `{ path: 'bookmarks/:tag', lazy: loadBookmarkWorkspace }` → `BookmarkWorkspace`
  - `:tag` 是自由文本(不像项目 id 是 ObjectId),拼路由/读路由参数都要过一遍 `encodeURIComponent`/`decodeURIComponent`。

## `/bookmarks` — 网格页(`client/src/components/Bookmarks/BookmarksView.tsx`)

结构上照搬 `Projects/ProjectsView.tsx`,但有一处真实差异:标签是个很小、不分页的数据集(`useConversationTagsQuery()` 一次性拿全量,不是 infinite query,也没有服务端搜索——和老版 `BookmarkTable.tsx` 的做法一致)。所以:

- 头部:"书签"标题(`com_ui_bookmarks`)、排序下拉框、"新建标签"按钮(打开 `BookmarkEditDialog` 的新建模式——直接复用,不用新写弹窗)。
- 搜索:对已经拿到手的标签列表做纯前端过滤(`tag.toLowerCase().includes(query)`),不是查询参数——和 `BookmarkTable.tsx` 原来的做法一样。
- 排序选项:名称(字母序,默认)、创建时间(`createdAt`)、对话数量(`count`)。不提供"最近活动"选项——标签不像项目那样维护"最后一次使用时间"。
- 卡片网格:每个标签一张卡片——名字 + 对话数(复用老版 `BookmarkCard.tsx` 已经在用的 `com_ui_conversation`/`com_ui_conversations` 单复数处理),点击跳转到 `/bookmarks/${encodeURIComponent(tag.tag)}`。用和今天 `ProjectsView.tsx` 里一样的"避免按钮嵌套"结构(外层 `div` + 绝对定位的 `BookmarkActionsMenu` 作为兄弟节点,而不是嵌套在可点击卡片内部)。
- 空状态:复用已有 key——标签列表为空时用 `com_ui_no_bookmarks_title`("No bookmarks yet"),搜索无结果时用 `com_ui_no_bookmarks_match`("No bookmarks match your search")。这个页面不需要新增任何 i18n key。

## `/bookmarks/:tag` — 详情页(`client/src/components/Bookmarks/BookmarkWorkspace.tsx`)

照搬 `Projects/ProjectWorkspace.tsx`,去掉"在项目中新建对话"那个输入框按钮(见上面"不做的事")：

- 返回链接("全部书签",回到 `/bookmarks`)。
- 头部:标签名 + `BookmarkActionsMenu`(改名/删除),不显示描述字段(标签目前在别处也没有面向用户展示描述的地方,所以跳过——这一点和"项目"略有不同,但和现有标签数据的实际用法是一致的)。
- 对话列表:`useConversationsInfiniteQuery({ tags: [decodedTag], sortBy, sortDirection })`(后端已经支持)喂给下面这个**共用、改过名**的列表组件。如果这个标签下没有对话(包括通过一个过期/已删除标签的旧链接访问),列表组件自带的空状态就会显示——不需要单独做一个"标签不存在"页面。

### 共用列表组件改名

`Projects/ProjectChatList.tsx` 里完全没有任何项目专属逻辑——就是一个通用的虚拟化 `TConversation[]` 渲染器。把它挪到 `client/src/components/Conversations/ConversationListVirtual.tsx`(中性的名字和位置),同时更新它现在唯一的调用方 `ProjectWorkspace.tsx` 的引用,这样 `BookmarkWorkspace.tsx` 就不用为了一个跟项目毫无关系的组件反过去 import `Projects/` 目录下的东西。纯改名 + 两处 import 更新——不改行为。

## 标签改名/删除(`client/src/components/Bookmarks/BookmarkActionsMenu.tsx`)

新建一个"…"菜单组件,照搬 `Projects/ProjectActionsMenu.tsx` 的结构(同样的 `DropdownPopup` + `Ariakit.MenuButton` 写法,同样复用 `com_ui_more_options` 标签),接两个弹窗:

- **改名**:直接复用 `Bookmarks/BookmarkEditDialog.tsx`,传入 `bookmark={tag}` 让它进入编辑模式(它本来就支持——不用新写组件)。
- **删除**:新写一个小的 `client/src/components/Bookmarks/BookmarkDeleteDialog.tsx`,结构照搬 `ProjectDeleteDialog.tsx`,调用已经存在的 `useDeleteConversationTagMutation`。复用已有 key `com_ui_bookmarks_delete`(标题)和 `com_ui_bookmark_delete_confirm`(正文,和老版 `BookmarkCardActions.tsx` 一样,标签名在外部拼接)——不需要新增 i18n。

这个菜单在两个地方用,和 `ProjectActionsMenu` 一样:网格页每张卡片上(hover 显现,右上角)、详情页头部。

## 清理的死代码

已确认零真实消费者(只有下面这些互相引用):

- `client/src/components/SidePanel/Bookmarks/` — 整个目录(`BookmarkPanel.tsx`、`BookmarkTable.tsx`、`BookmarkList.tsx`、`BookmarkCard.tsx`、`BookmarkCardActions.tsx`、`BookmarkEmptyState.tsx`、`index.ts`)。
- `client/src/components/Nav/Bookmarks/BookmarkNav.tsx`(以及清空后的 `Nav/Bookmarks/` 目录)。
- `client/src/components/Chat/Menus/Bookmarks/BookmarkMenuItems.tsx` — 一套完全没被引用的书签下拉框实现,和真正在用的 `BookmarkMenu.tsx` 平行存在。
- `client/src/components/Bookmarks/BookmarkItems.tsx` 和 `BookmarkItem.tsx` — 只被上面要删的 `BookmarkMenuItems.tsx` 引用。
- `client/src/hooks/Nav/useSideNavLinks.ts` — 只删掉 `BookmarkPanel` 的 import 和 `hasAccessToBookmarks` 那个 push 代码块(保证面板文件删掉之后这里还能编译过)。这个 hook 的其余部分(文件/Prompts/记忆/技能几个入口)不动——它本身已经是个没有挂载点的孤儿 hook,但那是一次更大范围、不在这次范围内的清理。
- `client/src/components/Bookmarks/index.ts` — 去掉 `BookmarkItems`/`BookmarkItem` 这两个导出;保留 `BookmarkEditDialog`/`BookmarkForm`/`EditBookmarkButton`/`DeleteBookmarkButton`(后两个目前也没有消费者,但设计讨论时没有把它们提出来单独确认过,所以先不动)。

`BookmarkMenu.tsx`、`BookmarkContext.tsx`、`BookmarkEditDialog.tsx`、`BookmarkForm.tsx` 都在被实际使用(头部按钮和/或新页面),保持不变。

`client/src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx` 目前 `jest.mock` 了 `~/components/SidePanel/Bookmarks/BookmarkPanel` ——这个 mock(以及任何跟书签入口相关的断言)要在同一次改动里一起删掉,因为被 mock 的模块路径以后就不存在了。

## 验证

1. `cd client && npx tsc --noEmit` — 无新增错误(对照之前 Private Chat Projects 工作留下的 159 个错误基线,确认没有回归)。
2. 对所有新增/改动/搬迁的文件跑 `npx eslint`。
3. 浏览器冒烟测试(dev server 已经在跑):
   - 侧边栏"项目"后面出现扁平的"书签"按钮;点击跳转到 `/bookmarks`。
   - 通过对话头部现有的书签按钮给一个对话打标签;确认它出现在 `/bookmarks` 里(对话数为 1 的卡片),也出现在 `/bookmarks/:tag` 的对话列表里。
   - 网格页:搜索是前端过滤;能按名称/创建时间/对话数排序;"新建标签"能建出一个对话数为 0 的空标签卡片。
   - 卡片"…"菜单和详情页头部"…"菜单:改名后各处(包括已打标签的对话上)都同步更新;删除后标签消失,但对话本身不受影响(和现有 `com_ui_bookmark_delete_confirm` 文案说的一致)。
   - 确认删掉 `BookmarkNav`/`SidePanel/Bookmarks` 之后没有搞坏别的东西(没有悬空 import;`useSideNavLinks.spec.tsx` 测试要么还能过,要么已经把书签相关的断言一起更新了)。
