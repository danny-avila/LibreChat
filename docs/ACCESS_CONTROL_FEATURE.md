# 访问控制与管理员功能说明

> **分支来源**: `origin/feature/access-control`（由协作者 Ubuntu / Leeboom7 实现）
> **合并提交数**: 4 个（含初稿 → 修复 → 分组实现 → 运行修复）
> **最终状态**: 核心管理功能已可用，助手按组可见性**尚未完成**（协作者提交说明原文："还未完成assistant分组"）

---

## 一、功能概览

该功能为 LibreChat 增加了一套**面向管理员的后台权限控制系统**，包括：

| 功能模块 | 状态 | 说明 |
|---|---|---|
| 助手私有化（默认隔离） | ✅ 已完成 | 普通用户只能看到自己创建的助手 |
| 用户列表管理 | ✅ 已完成 | 管理员可查看、搜索、创建、删除用户 |
| 用户分组管理 | ✅ 已完成 | 支持创建分组、将用户分配到多个分组 |
| 管理员查看所有对话记录 | ✅ 已完成 | 管理员可按用户/端点/关键词过滤查看对话 |
| 查看对话消息详情 | ✅ 已完成 | 管理员可打开任意对话查看完整消息记录 |
| 前端用户管理 UI | ✅ 已完成 | 集成在头像菜单 → Admin Panel |
| 前端对话查看 UI | ✅ 已完成 | 独立的 Admin Conversations 组件 |
| 助手按用户组可见性控制 | ⚠️ 未完成 | 数据库字段已准备（`assistant.group`），访问逻辑尚未实现 |

---

## 二、技术架构

### 2.1 后端路由层

新增路由文件 `api/server/routes/admin.js`，挂载在 `/api/admin/` 路径下。
**所有路由均需经过两个中间件**：
- `requireJwtAuth`：验证 JWT Token
- `checkAdmin`：验证用户角色为 `ADMIN`

```
GET    /api/admin/users                          - 分页获取所有用户（支持搜索）
POST   /api/admin/users                          - 创建管理员用户
PATCH  /api/admin/users/:userId/role             - 修改某用户角色
PATCH  /api/admin/users/:userId/groups           - 修改某用户所属分组
DELETE /api/admin/users/:userId                  - 删除用户

GET    /api/admin/conversations                  - 分页查询所有用户的对话（支持过滤）
GET    /api/admin/conversations/:id/messages     - 获取某对话的全部消息

GET    /api/admin/groups                         - 列出所有分组
POST   /api/admin/groups                         - 创建新分组
DELETE /api/admin/groups/:groupName              - 删除分组（可选是否清空用户关联）
GET    /api/admin/groups/:groupName/users        - 查询某分组下的所有用户
```

### 2.2 后端控制器层

新增文件 `api/server/controllers/AdminController.js`（524 行），实现了上述所有路由的业务逻辑。

**用户管理关键实现**：
- 用户搜索支持 `email`、`name`、`username` 三字段联合模糊搜索
- 防止管理员修改或删除自己的账号
- 创建管理员用户复用 `registerUser` 服务，保证密码加密一致性

**对话查询关键实现**：
- 默认只查询 `assistants`、`azureAssistants`、`agents` 端点的对话
- 自动排除已过期（`expiredAt` 不为空）的临时对话
- 查询结果自动关联用户信息（`userInfo`），无需前端二次请求

**分组管理关键实现**：
- 自定义分组 **当前使用 in-memory 存储**（`let customGroups = []`），进程重启后自定义分组名称会丢失，但用户已关联的分组数据保留在 MongoDB 中
- 下一步应将分组定义持久化到 MongoDB 的独立 Collection 中（⚠️ 技术债）
- 查询分组时会自动从 MongoDB `users` 集合的 `groups` 字段中发现所有已使用的分组名

### 2.3 数据模型层

#### `User` Schema 新增字段

文件: `packages/data-schemas/src/schema/user.ts`

```typescript
groups: {
  type: [String],  // 字符串数组，支持用户同时属于多个分组
  default: [],
}
```

#### `Assistant` Schema 新增字段

文件: `packages/data-schemas/src/schema/assistant.ts`

```typescript
// 用于未来的按组可见性控制（当前未启用过滤逻辑）
group: String  // 助手所属的可见性分组
```

### 2.4 助手权限变更

#### `validateAuthor.js` — 作者验证逻辑

文件: `api/server/middleware/assistants/validateAuthor.js`

**修改前（原始逻辑，不安全）**:
```javascript
// privateAssistants 为 true 才验证，默认不验证（所有人可操作任何助手）
if (!assistantsConfig.privateAssistants) { return; }
```

**修改后（当前逻辑，安全）**:
```javascript
// ADMIN 无限制
if (req.user.role === SystemRoles.ADMIN) { return; }

// 只有明确设置 privateAssistants: false 才跳过验证
// 默认情况（undefined）也会执行验证
if (assistantsConfig?.privateAssistants === false) { return; }
```

**影响**: 默认情况下，非创建者无法修改/使用他人的助手（除非配置了白名单或关闭私有模式）。

#### `v1.js` — 助手文档列表过滤

文件: `api/server/controllers/assistants/v1.js`

- 查询数据库时加入 `user: req.user.id` 过滤，普通用户只能查询自己名下的助手文档
- `filterAssistantDocs` 函数增加 `privateAssistants` 的三态判断：
  - `true` 或不设置 → 只返回用户自己的助手
  - `false` → 返回所有（或按白/黑名单过滤）

### 2.5 前端层

#### 入口：头像菜单 `AccountSettings.tsx`

在左下角头像菜单中为 ADMIN 角色的用户新增两个入口：
- **User Management**（用户管理）
- **Admin Conversations**（对话记录）

#### `UserManagement.tsx`（642 行）

功能完整的用户管理界面，包括：
- 分页用户列表（每页 20 条），支持实时搜索
- 下拉修改用户角色（USER / ADMIN / 自定义分组）
- 多选分组编辑弹窗（`isEditGroupsDialogOpen`）
- 创建新管理员用户弹窗
- 创建新分组弹窗
- 删除用户（带防误删确认）

**技术栈**: React Query（数据请求）+ `dataService` API 封装 + `OGDialog` 弹窗组件

#### `AdminConversations.tsx`（624 行）

管理员对话查看界面，包括：
- 分页对话列表，显示用户信息（邮箱/头像）
- 按端点（Assistants / AzureAssistants / Agent）筛选
- 按用户 ID 过滤
- 关键词搜索
- 点击对话后展开所有消息详情（支持 Markdown 渲染）

#### `AdminUserSelector.tsx` + `AdminUserConversations.tsx`

侧边栏中另一套管理员查看视角，允许管理员在侧边栏下拉选择目标用户并查看其对话列表。

#### `store/admin.ts`

新增 Recoil 状态：`adminSelectedUserAtom`，用于在侧边栏组件之间共享当前管理员选中的目标用户。

### 2.6 `data-provider` 封装层

文件: `packages/data-provider/src/data-service.ts`（新增 170 行）

新增所有 Admin API 的 TypeScript 函数封装，以及完整的 TypeScript 类型定义：

```typescript
// 用户管理
dataService.getAdminUsers({ page, limit, search })
dataService.createAdminUser(userData)
dataService.updateUserRole(userId, role)
dataService.updateUserGroups(userId, groups)
dataService.deleteAdminUser(userId)

// 分组管理
dataService.getAdminGroups()
dataService.createAdminGroup(name)
dataService.deleteAdminGroup(groupName)
dataService.getGroupUsers(groupName)

// 对话管理
dataService.getAdminConversations({ page, limit, userId, endpoint, search, ... })
dataService.getAdminConversationMessages(conversationId)
```

---

## 三、已知问题与限制

### ⚠️ 1. 助手按组可见性：尚未实现

`assistant.group` 字段已加入 Schema，但 `helpers.js` 中缺少对应的过滤逻辑。
目前助手的可见性只有两种状态：
- 私有（只有创建者可见）
- 全公开（`privateAssistants: false`）

**计划实现方式**（待开发）：
```javascript
// 在 fetchAssistants 中加入：
// 管理员按组过滤助手，分组用户只能看到 assistant.group 与自己 user.groups 有交集的助手
if (!isAdmin && userGroups.length > 0) {
  assistants = assistants.filter(a => 
    !a.group || userGroups.includes(a.group)
  );
}
```

### ⚠️ 2. 自定义分组数据丢失

`AdminController.js` 中的 `customGroups` 是一个模块级内存变量：
```javascript
let customGroups = [];
```
**问题**: Docker 容器重启后，通过 UI 创建的分组名称会消失（但用户的 `groups` 字段数据仍在 MongoDB 中）。

### ⚠️ 3. 删除助手报错

来自第一个提交的 bug（`9554a25b6`，提交说明："会导致删除报错"），目前状态未知，需结合日志排查。

---

## 四、配置说明

### 开启全体可见模式（所有用户可看到所有助手）

在 `librechat.yaml` 的对应端点下设置：

```yaml
endpoints:
  azureOpenAI:
    assistants: true
    privateAssistants: false  # 关闭私有化，所有人可见
    groups:
      ...
```

### 进入管理后台

1. 使用 `ADMIN` 角色账号登录
2. 点击左下角头像
3. 选择 **User Management** 或 **Admin Conversations**

---

## 五、文件变更清单

| 文件路径 | 类型 | 说明 |
|---|---|---|
| `api/server/controllers/AdminController.js` | 新增 | 全部后端管理逻辑，524 行 |
| `api/server/routes/admin.js` | 新增 | Admin 路由注册，108 行 |
| `api/server/index.js` | 修改 | 注册 `/api/admin` 路由 |
| `api/server/routes/index.js` | 修改 | 路由索引更新 |
| `api/server/controllers/assistants/v1.js` | 修改 | 助手列表过滤加入用户隔离 |
| `api/server/controllers/assistants/helpers.js` | 修改 | 同步 `filterAssistants` 逻辑 |
| `api/server/middleware/assistants/validateAuthor.js` | 修改 | 默认执行作者验证 |
| `client/src/components/Admin/UserManagement.tsx` | 新增 | 用户管理 UI，642 行 |
| `client/src/components/Admin/AdminConversations.tsx` | 新增 | 对话查看 UI，624 行 |
| `client/src/components/Admin/index.ts` | 新增 | 组件导出 |
| `client/src/components/Nav/AdminUserSelector.tsx` | 新增 | 侧边栏用户选择器，240 行 |
| `client/src/components/Nav/AdminUserConversations.tsx` | 新增 | 侧边栏对话视图，360 行 |
| `client/src/components/Nav/AccountSettings.tsx` | 修改 | 头像菜单增加 Admin 入口 |
| `client/src/components/Nav/Nav.tsx` | 修改 | 侧边栏集成 Admin 组件 |
| `client/src/routes/Root.tsx` | 修改 | 路由层集成 Admin 路由 |
| `client/src/store/admin.ts` | 新增 | 全局状态：adminSelectedUser |
| `client/src/store/index.ts` | 修改 | 导出新 store |
| `packages/data-provider/src/data-service.ts` | 修改 | 新增所有 Admin API 封装，170 行 |
| `packages/data-provider/src/api-endpoints.ts` | 修改 | 新增 API 路径常量 |
| `packages/data-provider/src/index.ts` | 修改 | 导出新类型 |
| `packages/data-schemas/src/schema/user.ts` | 修改 | 新增 `groups: [String]` 字段 |
| `packages/data-schemas/src/schema/assistant.ts` | 修改 | 新增 `group: String` 字段（未启用） |
| `packages/data-schemas/src/types/user.ts` | 修改 | 类型定义更新 |
| `packages/data-schemas/src/types/assistant.ts` | 修改 | 类型定义更新 |

---

*文档生成时间: 2026-03-04*
