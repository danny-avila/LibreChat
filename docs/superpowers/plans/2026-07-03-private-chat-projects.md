# Private Chat Projects — Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port upstream LibreChat's "Private Chat Projects" feature (ability to group conversations into folders/projects) into the Graupel fork.

**Architecture:** This is a **port of an existing, upstream-tested feature**, not greenfield work — so the strategy is *cherry-pick + targeted conflict resolution + verify with the tests that ship in the same commit*, NOT red-green TDD. The feature source is upstream squash-merge commit `baa23a8e2` (PR #13467) with two Projects-specific follow-ups (`3fb48021f` collapse-empty-by-default, `87cdd3793` mobile nav). The upstream mount point is `client/src/components/UnifiedSidebar/ConversationsSection.tsx` — the **same file our fork uses** (UnifiedSidebar is shared heritage, not fork-only), so we resolve conflicts on it rather than re-inventing integration. Backend is purely additive (new `chatprojects` Mongo collection + a `chatProjectId` field on conversations); all utility dependencies already exist at our merge-base `190cdee30`.

**Tech Stack:** TypeScript (packages/*), JS (api/server), React + React Query + Recoil (client), MongoDB/Mongoose, react-router, Jest.

## Global Constraints

- **New backend code is TypeScript in `packages/*`; `/api` stays a thin JS wrapper.** (Follows existing fork/CLAUDE.md boundaries.)
- **Only English keys are edited in `client/src/locales/en/translation.json`; zh-Hans is added MANUALLY** in `client/src/locales/zh-Hans/translation.json` (other languages automated externally). User's UI language is Simplified Chinese — zh-Hans coverage is REQUIRED for this feature to not show English.
- **No `any`; no unresolved TS/ESLint diagnostics.** Match surrounding style.
- **Cross-package builds are required before tests see new exports:** after touching `packages/data-provider`, `packages/data-schemas`, `packages/api`, or `packages/client`, rebuild with `npm run build:data-provider` / `build:data-schemas` / `build:api` / `build:client-package` (or `npm run build:packages` for all four). This has bitten every prior upstream merge in this fork.
- **Jest suites that spin up `mongodb-memory-server` require the no-AVX prefix on this machine:** `LD_LIBRARY_PATH=/data/lidongyu/.local/ssl1.1/usr/lib/x86_64-linux-gnu MONGOMS_VERSION=4.4.18 npx jest <pattern>`.
- **Reference for all "final" file content is `upstream/main`**, because `baa23a8e2` predates the two follow-ups. Brand-new files are pulled from `upstream/main` directly (final polished state); modified/conflict files are resolved by hand against our fork.
- **Do NOT re-introduce features our fork deliberately removed.** Specifically: our `UnifiedSidebar/ConversationsSection.tsx` dropped `BookmarkNav`/`FavoritesList`/tags for the ToC-clean sidebar. When resolving that file, add **ProjectsSection only** — do NOT add `FavoritesList` back (**user-confirmed 2026-07-03: favorites are not a fit for regular ToC users, decision is final, not revisited by this plan**). Bookmarks are a separate, deliberately out-of-scope decision: the user wants Bookmarks eventually but only after a dedicated interaction/visual design pass (not a faithful port of upstream's `BookmarkNav` UI) — track as a future brainstorming item, not part of this plan.
- **Plan gating is out of scope.** Projects are available to all authenticated users (matching ChatGPT). Whether to gate behind a plan is a stage-3 decision, not part of this port.

---

## Reference: exact file inventory (from research)

**Brand-new files (no conflict — pulled from `upstream/main`):**

Backend:
- `packages/data-schemas/src/schema/chatProject.ts`
- `packages/data-schemas/src/models/chatProject.ts`
- `packages/data-schemas/src/types/chatProject.ts`
- `packages/data-schemas/src/methods/chatProject.ts`
- `packages/data-schemas/src/methods/chatProject.spec.ts`
- `packages/api/src/projects/handlers.ts`
- `packages/api/src/projects/index.ts`
- `api/server/routes/projects.js`

Frontend:
- `client/src/components/Projects/{ProjectsView,ProjectWorkspace,ProjectChatList,ProjectCreateDialog,index}.tsx` (+ `index.ts`)
- `client/src/components/Conversations/ProjectsSection.tsx`
- `client/src/components/Conversations/ConvoOptions/ProjectButton.tsx`
- `client/src/components/Chat/ProjectLandingChip.tsx`
- `client/src/data-provider/Projects/{queries,mutations,index}.ts`

**Modified files — CLEAN apply (we never touched them; cherry-pick applies):**
- `client/src/hooks/useNewConvo.ts`, `client/src/routes/ChatRoute.tsx`, `client/src/hooks/Input/useSelectMention.ts`, `client/src/utils/convos.ts`, `client/src/hooks/Chat/useChatFunctions.ts`, `client/src/hooks/Input/useQueryParams.ts`, `client/src/hooks/Input/useTextarea.ts`, `client/src/components/Chat/ChatView.tsx`, `client/src/components/Chat/Input/ChatForm.tsx`, `client/src/components/Conversations/Convo.tsx`, `client/src/store/families.ts`, `client/src/data-provider/mutations.ts`
- Backend modified-but-additive: `packages/data-schemas/src/{schema,models,types,methods}/index.ts`, `packages/data-schemas/src/schema/convo.ts` (+`chatProjectId`), `packages/data-schemas/src/types/convo.ts`, `packages/data-schemas/src/methods/conversation.ts` (⚠ `saveConvo` sensitive hunk), `packages/api/src/index.ts`, `packages/api/src/db/utils.ts`, `packages/data-provider/src/{api-endpoints,data-service,keys,types,config,bedrock}.ts`, `packages/data-provider/src/types/queries.ts`, `packages/data-provider/src/schemas.ts`, `api/server/index.js`, `api/server/experimental.js`, `api/server/routes/index.js`, `api/server/routes/convos.js`, `api/server/services/Endpoints/agents/{build.js,initialize.js}`, `api/server/controllers/agents/client.js`

**Modified files — CONFLICT (manual resolution required):**
| File | Severity | Nature |
|---|---|---|
| `client/src/components/Conversations/Conversations.tsx` | HIGH | both heavily rewrote; upstream adds `showFavorites` prop, hoists `ChatsHeader` out of virtual list, removes `'chats-header'` flattened item |
| `client/src/components/UnifiedSidebar/ConversationsSection.tsx` | MODERATE | upstream inserts `FavoritesList`+`ProjectsSection` after search block; our version deleted the BookmarkNav div its context assumes |
| `client/src/hooks/SSE/useEventHandlers.ts` | HIGH | heavy fork divergence; upstream adds project-stats query invalidation |
| `client/src/components/Conversations/ConvoOptions/ConvoOptions.tsx` | LOW-MOD | upstream adds the "Change project" menu item + `ProjectButton` render |
| `client/src/routes/index.tsx` | LOW (adjacent) | upstream adds `/projects` routes next to where we added the `/images` route |
| `client/src/data-provider/queries.ts` | LOW | upstream adds `projectId` to conversations infinite query |
| `client/src/data-provider/index.ts` | LOW | export line for `./Projects` |
| `client/src/locales/en/translation.json` | MECHANICAL | upstream adds ~35 keys; resolve by keeping both sides' keys |

**Shared-package change:** `packages/client/src/components/ControlCombobox.tsx` gains optional `placement?: Ariakit.SelectStoreProps['placement']` (used by `ProjectLandingChip`).

**Fork stub to remove:** `client/src/components/UnifiedSidebar/SideMenu.tsx:169-172` — the static disabled "我的项目 / 新建项目" `NavRow` stub is replaced by the real `ProjectsSection` (rendered inside `ConversationsSection`).

---

## Task 0: Branch + green baseline

**Files:** none (git + build only)

- [ ] **Step 1: Create the feature branch from up-to-date main**

```bash
cd /data/lidongyu/projects/LibreChat
git checkout main && git pull --ff-only 2>/dev/null; git status -sb | head -1
git checkout -b feat/private-projects
```

- [ ] **Step 2: Establish a green baseline (packages build)**

```bash
npm run build:packages 2>&1 | tail -5
```
Expected: all four packages build without error.

---

## Task 1: Apply the port (cherry-pick + pull final new-file versions) and triage

**Files:** whole tree (staged, not committed)

**Interfaces produced:** working tree containing the feature with conflict markers isolated to the 8 files in the CONFLICT table.

- [ ] **Step 1: Cherry-pick the feature commit without committing**

```bash
git cherry-pick -n baa23a8e2
```
Expected: git reports `CONFLICT (content)` for the files in the CONFLICT table and auto-stages the rest. (A `could not apply` message is expected — the `-n` leaves everything in the working tree for resolution.)

- [ ] **Step 2: Overwrite brand-new files with their final `upstream/main` versions**

The follow-ups `3fb48021f` (collapse-empty) and `87cdd3793` (mobile nav) + incidental icon refactors polished the NEW files after `baa23a8e2`. Pull the final versions (safe — these files are self-contained and don't exist in our tree otherwise):

```bash
git checkout upstream/main -- \
  packages/data-schemas/src/schema/chatProject.ts \
  packages/data-schemas/src/models/chatProject.ts \
  packages/data-schemas/src/types/chatProject.ts \
  packages/data-schemas/src/methods/chatProject.ts \
  packages/data-schemas/src/methods/chatProject.spec.ts \
  packages/api/src/projects/handlers.ts \
  packages/api/src/projects/index.ts \
  api/server/routes/projects.js \
  client/src/components/Projects \
  client/src/components/Conversations/ProjectsSection.tsx \
  client/src/components/Conversations/ConvoOptions/ProjectButton.tsx \
  client/src/components/Chat/ProjectLandingChip.tsx \
  client/src/data-provider/Projects
git add -A
```

- [ ] **Step 3: List remaining conflicts to confirm the surface matches the plan**

```bash
git diff --name-only --diff-filter=U
```
Expected: exactly the 8 files in the CONFLICT table (or a subset). If a file appears that is NOT in the table, STOP and inspect before proceeding.

---

## Task 2: Resolve backend + wire mounts; verify backend tests

**Files:**
- Resolve if conflicted: `packages/data-schemas/src/methods/conversation.ts`
- Verify auto-applied: `packages/data-schemas/src/{schema,models,types,methods}/index.ts`, `schema/convo.ts`, `types/convo.ts`, `packages/api/src/index.ts`, `packages/api/src/db/utils.ts`, `api/server/{index.js,experimental.js,routes/index.js,routes/convos.js}`, `api/server/services/Endpoints/agents/{build.js,initialize.js}`, `api/server/controllers/agents/client.js`
- Test: `packages/data-schemas/src/methods/chatProject.spec.ts` (ships with the feature), `packages/data-schemas/src/methods/conversation.spec.ts`

**Interfaces produced:** `ChatProject` model + `createChatProjectMethods` returning `createChatProject / getChatProject / listChatProjects / updateChatProject / deleteChatProject / assignConversationToProject / refreshChatProjectStats`; conversation carries `chatProjectId: string | null`; `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:projectId`, `PUT /api/projects/conversations/:conversationId`; `GET /api/convos?projectId=<id|'unassigned'>`.

- [ ] **Step 1: Resolve `methods/conversation.ts` if flagged conflicted**

If `git diff --name-only --diff-filter=U` listed it: open it and integrate upstream's `saveConvo` changes into our version — the sensitive hunk switches `findOneAndUpdate` to `includeResultMetadata: true` and reads `conversationResult.value` + `lastErrorObject.updatedExisting` to know insert-vs-update, tracks `previousChatProjectId`, and calls `refreshChatProjectStatsForUser` / `updateChatProjectLastConversationForUser`. Preserve any fork-specific logic already in that function; add the project-stats branches. If it auto-applied clean, just review the hunk. Then `git add packages/data-schemas/src/methods/conversation.ts`.

- [ ] **Step 2: Rebuild the backend packages**

```bash
npm run build:data-schemas 2>&1 | tail -3 && npm run build:api 2>&1 | tail -3
```
Expected: both build clean.

- [ ] **Step 3: Typecheck data-schemas + api**

```bash
(cd packages/data-schemas && npx tsc --noEmit) && (cd packages/api && npx tsc --noEmit)
echo "tsc exit: $?"
```
Expected: no errors.

- [ ] **Step 4: Run the shipped backend tests**

```bash
cd packages/data-schemas
LD_LIBRARY_PATH=/data/lidongyu/.local/ssl1.1/usr/lib/x86_64-linux-gnu MONGOMS_VERSION=4.4.18 \
  npx jest src/methods/chatProject.spec.ts src/methods/conversation.spec.ts --silent 2>&1 | grep -E "Tests:|Test Suites:|FAIL|✕"
```
Expected: all pass. Investigate any failure before continuing (most likely a `conversation.ts` resolution miss).

- [ ] **Step 5: Commit the backend layer**

```bash
cd /data/lidongyu/projects/LibreChat
git add -A
git commit -q -m "feat(projects): backend — chatProject schema/methods/handlers/routes + convo chatProjectId"
```

---

## Task 3: Resolve data-provider; rebuild

**Files:**
- Resolve if conflicted: `packages/data-provider/src/queries.ts` (the client-side one is `client/src/data-provider/queries.ts` — handled in Task 4; here the shared `packages/data-provider/src/*` are additive)
- Verify auto-applied: `packages/data-provider/src/{api-endpoints,data-service,keys,types,config,bedrock}.ts`, `packages/data-provider/src/types/queries.ts`, `packages/data-provider/src/schemas.ts`

**Interfaces produced:** `dataService.{listProjects,createProject,getProjectById,updateProject,deleteProject,assignConversationToProject}`; `QueryKeys.{projects,project,projectConversations}`; `TChatProject`, `TCreateChatProjectRequest`, `TUpdateChatProjectRequest`, `TAssignConversationToProjectRequest/Response`; `tConversationSchema` carries `chatProjectId`.

- [ ] **Step 1: Confirm no unresolved conflicts remain in `packages/data-provider`**

```bash
git diff --name-only --diff-filter=U -- packages/data-provider
```
Expected: empty (these files were auto-applied). If any listed, resolve by keeping both our and upstream's additions (all additive: new endpoints/keys/types/schema fields).

- [ ] **Step 2: Rebuild + typecheck data-provider**

```bash
npm run build:data-provider 2>&1 | tail -3
(cd packages/data-provider && npx tsc --noEmit); echo "tsc exit: $?"
```
Expected: builds clean, no TS errors.

- [ ] **Step 3: Run data-provider tests touching changed files**

```bash
cd packages/data-provider
npx jest src/schemas.spec.ts specs/bedrock.spec.ts --silent 2>&1 | grep -E "Tests:|Test Suites:|FAIL|✕"
```
Expected: pass (schema now allows `chatProjectId`; bedrock parser knows the key).

- [ ] **Step 4: Commit**

```bash
cd /data/lidongyu/projects/LibreChat
git add -A
git commit -q -m "feat(projects): data-provider — endpoints, data-service, keys, types, schema field"
```

---

## Task 4: Resolve frontend conflicts (non-sidebar) + clean-file check

**Files (resolve):**
- `client/src/hooks/SSE/useEventHandlers.ts` (HIGH)
- `client/src/components/Conversations/ConvoOptions/ConvoOptions.tsx` (LOW-MOD)
- `client/src/routes/index.tsx` (LOW adjacent)
- `client/src/data-provider/queries.ts` (LOW)
- `client/src/data-provider/index.ts` (LOW)

**Files (verify clean-applied):** `useNewConvo.ts`, `ChatRoute.tsx`, `useSelectMention.ts`, `utils/convos.ts`, `useChatFunctions.ts`, `useQueryParams.ts`, `useTextarea.ts`, `ChatView.tsx`, `ChatForm.tsx`, `Convo.tsx`, `store/families.ts`, `data-provider/mutations.ts`

**Interfaces produced:** `useProjectsInfiniteQuery`, `useProjectQuery`, `useCreateProjectMutation`, `useUpdateProjectMutation`, `useDeleteProjectMutation`, `useAssignConversationToProjectMutation` (from `client/src/data-provider/Projects` via `data-provider/index.ts`); `/projects` + `/projects/:projectId` routes; `useConversationsInfiniteQuery` accepts `{ projectId }`.

- [ ] **Step 1: `client/src/data-provider/index.ts`** — ensure it re-exports `./Projects` alongside existing exports (keep both sides). `git add` it.

- [ ] **Step 2: `client/src/data-provider/queries.ts`** — integrate upstream's `projectId` param into the conversations infinite query (`getConvosByCursor` call passes `projectId`; query key includes it). Keep our existing query logic. `git add` it.

- [ ] **Step 3: `client/src/routes/index.tsx`** — keep BOTH our `loadImagesView` + `images` route AND upstream's `loadProjectsView`/`loadProjectWorkspace` + `projects` and `projects/:projectId` routes. They sit next to each other in the two lazy-loader block and the children array; take both. `git add` it.

- [ ] **Step 4: `client/src/components/Conversations/ConvoOptions/ConvoOptions.tsx`** — add upstream's "Change project" menu item + the `<ProjectButton .../>` render (state `showProjectDialog`/`setShowProjectDialog`), preserving our existing menu items. Verify `ConvoOptions/index.ts` re-exports `ProjectButton` (it's a new file already checked out). `git add` it.

- [ ] **Step 5: `client/src/hooks/SSE/useEventHandlers.ts`** — this file is heavily fork-diverged; do NOT take upstream's whole version. Add ONLY upstream's project-stats invalidation: after a conversation save/update handler, when `update.chatProjectId` (or the saved `conversation.chatProjectId`) is present, invalidate `[QueryKeys.projects]` and `[QueryKeys.project, chatProjectId]`. Insert alongside our existing invalidations without dropping fork logic. `git add` it.

- [ ] **Step 6: Verify the clean-applied frontend files are intact**

```bash
git diff --name-only --diff-filter=U -- client/src
```
Expected: empty after steps 1-5 (sidebar files handled in Task 5). Spot-check `client/src/hooks/useNewConvo.ts` contains the `chatProjectId` template handling.

- [ ] **Step 7: Do NOT commit yet** — the app won't typecheck until Task 5 (sidebar) is done. Proceed to Task 5.

---

## Task 5: Sidebar integration + remove the static stub (the core ToC decision)

**Files:**
- Resolve: `client/src/components/UnifiedSidebar/ConversationsSection.tsx` (MODERATE)
- Resolve: `client/src/components/Conversations/Conversations.tsx` (HIGH)
- Modify: `client/src/components/UnifiedSidebar/SideMenu.tsx` (remove stub 169-172)

**Interfaces consumed:** `ProjectsSection` (new file from Task 1) with props `{ toggleNav, isAuthenticated }`.

> **DESIGN DECISION — CONFIRMED 2026-07-03:** Our fork removed `FavoritesList`/`BookmarkNav` for a clean ToC sidebar. Upstream's `ConversationsSection` re-adds `FavoritesList` **and** `ProjectsSection`. User confirmed favorites (pinned agents/models/specs) are not a fit for regular ToC users — this port adds **`ProjectsSection` only**; `FavoritesList` stays out permanently. Bookmarks are wanted eventually but need a dedicated interaction/style design pass first — tracked as a separate future item, not part of this plan or this decision.

- [ ] **Step 1: Resolve `UnifiedSidebar/ConversationsSection.tsx`**

Take our fork's version as the base (it already dropped BookmarkNav/tags). Add:
- `import ProjectsSection from '~/components/Conversations/ProjectsSection';`
- Render `{!search.query && <ProjectsSection toggleNav={toggleNav} isAuthenticated={isAuthenticated} />}` immediately ABOVE the `<Conversations ... />` block.
- Do NOT add `FavoritesList` or `showFavorites` (confirmed out of scope — see decision above). Do NOT add `BookmarkNav` either (separate feature, pending its own design pass).
- Ensure `toggleNav` and `isAuthenticated` are available in this component's scope (they exist in our version — verify; if `isAuthenticated` isn't already derived, get it from `useAuthContext`).
`git add` it.

- [ ] **Step 2: Resolve `Conversations/Conversations.tsx` (the hard one)**

Our fork rewrote this; upstream also rewrote it. Goal: keep our fork's `Conversations`/`ChatsHeader` behavior, and adopt ONLY what `ProjectsSection`/`ProjectChatList` actually import from this file: the exported `DateLabel` and `MeasuredCellParent` symbols, and the `groupConversationsByDate(conversations, sortBy?)` signature gaining an optional `dateField`/sort param. Concretely:
- Confirm `Conversations.tsx` still exports `DateLabel` and `MeasuredCellParent` (ProjectChatList imports them). If our version renamed/removed them, re-export compatible symbols.
- Ensure `groupConversationsByDate` (in `utils/convos.ts`, already clean-applied) accepts the sort/`dateField` param the workspace passes.
- Do NOT adopt upstream's `showFavorites` prop or its `'chats-header'` virtual-list removal unless our version needs it — our sidebar composition differs. Keep our header.
`git add` it.

- [ ] **Step 3: Remove the static projects stub in `SideMenu.tsx`**

Delete lines ~169-172 (the `<div>` with `<SectionHeader>{localize('com_nav_my_projects')}</SectionHeader>` + disabled `<NavRow icon={FolderPlus} label={localize('com_nav_new_project')} disabled />`). Remove the now-unused `FolderPlus` import if nothing else uses it. The real Projects UI now lives in `ProjectsSection` (rendered via `ConversationsSection`). `git add client/src/components/UnifiedSidebar/SideMenu.tsx`.

- [ ] **Step 4: Confirm all conflicts resolved**

```bash
git diff --name-only --diff-filter=U
git grep -nE "^(<<<<<<<|=======|>>>>>>>)" -- client packages api | head
```
Expected: both empty.

---

## Task 6: `@librechat/client` ControlCombobox prop + rebuild

**Files:** `packages/client/src/components/ControlCombobox.tsx`

- [ ] **Step 1: Confirm the `placement` prop is present** (it was auto-applied or comes from upstream). If `ProjectLandingChip` uses `placement="top"`, `ControlCombobox` must accept `placement?: Ariakit.SelectStoreProps['placement']` and pass it to the Ariakit select store. If missing, add it.

- [ ] **Step 2: Rebuild the client package**

```bash
npm run build:client-package 2>&1 | tail -3
```
Expected: clean build.

---

## Task 7: zh-Hans translations for the 35 new keys

**Files:** `client/src/locales/en/translation.json` (resolve conflict — keep both), `client/src/locales/zh-Hans/translation.json` (add keys)

**Interfaces consumed:** the 35 `com_ui_*` keys the Projects UI localizes.

- [ ] **Step 1: Resolve `en/translation.json`** — keep our keys AND upstream's ~35 new project keys. `git add` it.

- [ ] **Step 2: Add zh-Hans for all project keys.** Insert (alphabetically, matching the file's sort) Simplified-Chinese values for every new key. Full set + proposed translations:

```
com_ui_projects            → 项目
com_ui_all_projects        → 全部项目
com_ui_your_projects       → 我的项目
com_ui_new_project         → 新建项目
com_ui_create_project      → 创建项目
com_ui_open_project        → 打开项目
com_ui_rename_project      → 重命名项目
com_ui_delete_project      → 删除项目
com_ui_delete_project_confirm → 确定要删除该项目吗？（其中的对话不会被删除）
com_ui_change_project      → 更改项目
com_ui_remove_from_project → 从项目中移除
com_ui_select_project      → 选择项目
com_ui_search_projects     → 搜索项目
com_ui_unassigned          → 未归类
com_ui_new_chat_in_project → 在项目中新建对话
com_ui_no_project_chats    → 该项目还没有对话
com_ui_no_projects         → 还没有项目
com_ui_project_name        → 项目名称
com_ui_project_name_placeholder → 输入项目名称
com_ui_project_chat_count       → {{count}} 个对话
com_ui_project_chat_count_single → 1 个对话
com_ui_latest_activity     → 最近活动
com_ui_sort_by             → 排序方式
com_ui_sort_chats_by       → 对话排序
com_ui_sort_projects_by    → 项目排序
com_ui_sort_created        → 按创建时间
com_ui_sort_updated        → 按更新时间
com_ui_project_not_found   → 未找到该项目
com_ui_project_updated     → 项目已更新
com_ui_project_create_error → 创建项目失败
com_ui_project_update_error → 更新项目失败
com_ui_project_rename_error → 重命名项目失败
com_ui_project_delete_error → 删除项目失败
```
(Skip any key already present in zh-Hans, e.g. `com_ui_load_more` / `com_ui_more_options` — verify with `grep` before inserting to avoid duplicate keys, which break JSON.)

- [ ] **Step 3: Validate both JSON files parse**

```bash
node -e "JSON.parse(require('fs').readFileSync('client/src/locales/en/translation.json','utf8'));JSON.parse(require('fs').readFileSync('client/src/locales/zh-Hans/translation.json','utf8'));console.log('both valid')"
```
Expected: `both valid`.

---

## Task 8: Full verification (build + typecheck + lint + tests + browser smoke)

**Files:** none (verification only)

- [ ] **Step 1: Build everything**

```bash
npm run build:packages 2>&1 | tail -5
(cd client && npx tsc --noEmit 2>&1 | tail -20); echo "client tsc exit: $?"
```
Expected: packages build; client typecheck clean (no `chatProjectId`/Projects type errors).

- [ ] **Step 2: Lint the files we hand-edited**

```bash
npx eslint \
  client/src/components/UnifiedSidebar/ConversationsSection.tsx \
  client/src/components/UnifiedSidebar/SideMenu.tsx \
  client/src/components/Conversations/Conversations.tsx \
  client/src/components/Conversations/ConvoOptions/ConvoOptions.tsx \
  client/src/hooks/SSE/useEventHandlers.ts \
  client/src/routes/index.tsx \
  client/src/data-provider/queries.ts \
  packages/data-schemas/src/methods/conversation.ts 2>&1 | tail -20
```
Expected: 0 errors.

- [ ] **Step 3: Run the affected Jest suites**

```bash
cd packages/data-schemas
LD_LIBRARY_PATH=/data/lidongyu/.local/ssl1.1/usr/lib/x86_64-linux-gnu MONGOMS_VERSION=4.4.18 \
  npx jest src/methods/chatProject.spec.ts src/methods/conversation.spec.ts --silent 2>&1 | grep -E "Tests:|Test Suites:|FAIL"
cd ../../api
LD_LIBRARY_PATH=/data/lidongyu/.local/ssl1.1/usr/lib/x86_64-linux-gnu MONGOMS_VERSION=4.4.18 \
  npx jest server/routes/__tests__/convos 2>&1 | grep -E "Tests:|Test Suites:|FAIL" || true
```
Expected: chatProject + conversation suites pass.

- [ ] **Step 4: Browser smoke test** (start servers, then drive)

```bash
npm run backend:dev  # background
npm run frontend:dev # background
```
Then via browser at `http://localhost:3090`, verify end-to-end:
1. Sidebar shows a **Projects** section (with "all projects" + "new project" buttons) above the Chats list; the old disabled "新建项目" stub is gone.
2. Create a project → it appears; open it → `/projects/:id` workspace renders.
3. "New chat in project" → send a message → the chat is saved AND listed under that project (sidebar unfurl + workspace list).
4. On an existing chat's ⋯ menu → "更改项目" → assign/unassign works; project chat counts update.
5. `/projects` grid page lists projects with chat counts.
6. Global "New chat" (not in a project) does NOT stay stuck in a project scope.
7. All project UI is in Chinese (no raw `com_ui_*` keys, no English leak).

- [ ] **Step 5: Commit the frontend + i18n layer**

```bash
cd /data/lidongyu/projects/LibreChat
git add -A
git commit -q -m "feat(projects): frontend — ProjectsSection in sidebar, /projects routes, URL-scoped new chat, zh-Hans"
```

---

## Task 9: Optional polish + integrate to main

**Files:** none / git

- [ ] **Step 1 (optional): pull the two Projects follow-ups if smoke test showed rough edges**

Only if mobile nav or empty-section behavior is off (the new files were already refreshed from `upstream/main` in Task 1, so this is usually unnecessary):
```bash
git cherry-pick -x 3fb48021f 87cdd3793   # resolve any minor conflicts
```

- [ ] **Step 2: Merge to main (fork convention: --no-ff with a summary), rebuild, push**

```bash
git checkout main && git merge --ff-only origin/main
git merge --no-ff feat/private-projects -m "Merge branch 'feat/private-projects' into main — port upstream Private Chat Projects (#13467)"
npm run build:packages 2>&1 | tail -3
git push origin main
```

---

## Self-Review notes (author)

- **FavoritesList is confirmed out of scope** (user decision, 2026-07-03) — this plan intentionally deviates from a faithful port by never re-introducing it. **Bookmarks** (a distinct feature, conversation tagging via `BookmarkNav`) is wanted by the user but explicitly deferred to a future design pass — do not add it opportunistically while executing this plan even though its component files already exist in the tree.
- **`useEventHandlers.ts` and `Conversations.tsx`** are the two genuine risk points (heavy fork divergence); their steps say explicitly to take our version as base and graft only the project-specific additions, not upstream's whole file.
- **`saveConvo` in `conversation.ts`** is the sensitive backend hunk — Task 2 Step 1 calls it out.
- **Gating** (Projects for Free vs Pro) is deliberately out of scope; default is available-to-all.
- Every new file is pulled from `upstream/main` (final, post-follow-up) rather than the stale `baa23a8e2` snapshot — avoids missing the mobile-nav / collapse-empty polish.
