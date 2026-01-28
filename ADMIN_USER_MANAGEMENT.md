# 管理员用户管理功能

## 概述
为LibreChat添加了完整的管理员用户管理界面，允许管理员创建新的管理员用户、查看所有用户、修改用户角色以及删除用户。

## 功能特性

### 1. 用户列表
- 分页显示所有用户
- 显示用户的基本信息：头像、姓名、邮箱、用户名、角色、注册时间
- 支持搜索功能（按邮箱、姓名或用户名）

### 2. 创建管理员用户
- 通过表单创建新的管理员账户
- 必填字段：
  - 电子邮件
  - 姓名
  - 用户名
  - 密码（至少8位字符）
- 自动设置为管理员角色
- 自动验证邮箱

### 3. 用户角色管理
- 将用户在管理员和普通用户之间切换
- 防止管理员更改自己的角色

### 4. 删除用户
- 删除用户账户
- 防止管理员删除自己的账户
- 删除前需要确认

## 文件变更

### 后端文件

1. **控制器** - `/api/server/controllers/AdminController.js`
   - `listUsersController` - 列出所有用户
   - `createAdminUserController` - 创建管理员用户
   - `updateUserRoleController` - 更新用户角色
   - `deleteUserByAdminController` - 删除用户

2. **路由** - `/api/server/routes/admin.js`
   - `GET /api/admin/users` - 获取用户列表
   - `POST /api/admin/users` - 创建管理员用户
   - `PATCH /api/admin/users/:userId/role` - 更新用户角色
   - `DELETE /api/admin/users/:userId` - 删除用户

3. **路由注册**
   - `/api/server/routes/index.js` - 添加admin路由导出
   - `/api/server/index.js` - 注册`/api/admin`路由

### 前端文件

1. **API端点** - `/packages/data-provider/src/api-endpoints.ts`
   - 添加管理员API端点定义

2. **数据服务** - `/packages/data-provider/src/data-service.ts`
   - `getAdminUsers` - 获取用户列表
   - `createAdminUser` - 创建管理员用户
   - `updateUserRole` - 更新用户角色
   - `deleteUserByAdmin` - 删除用户

3. **UI组件** - `/client/src/components/Admin/UserManagement.tsx`
   - 完整的用户管理界面
   - 包含用户列表、搜索、分页
   - 创建用户对话框
   - 角色切换和删除功能

4. **路由配置** - `/client/src/routes/index.tsx`
   - 添加`/admin/users`路由

5. **导航菜单** - `/client/src/components/Nav/AccountSettings.tsx`
   - 为管理员用户添加"用户管理"菜单项

## 访问方式

1. 以管理员账户登录
2. 点击左下角的用户头像
3. 在下拉菜单中选择"用户管理"
4. 或直接访问 `http://your-domain/admin/users`

## 安全考虑

1. 所有管理员API都受到`checkAdmin`中间件保护，只有ADMIN角色的用户才能访问
2. 防止管理员修改或删除自己的账户
3. 密码字段在前端要求至少8位字符
4. 删除操作需要用户确认

## 使用示例

### 创建管理员用户的API调用示例

```bash
# 需要管理员权限
POST /api/admin/users
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "email": "newadmin@example.com",
  "name": "New Admin",
  "username": "newadmin",
  "password": "SecurePassword123"
}
```

### 获取用户列表

```bash
# 需要管理员权限
GET /api/admin/users?page=1&limit=20&search=admin
Authorization: Bearer <admin-token>
```

### 更新用户角色

```bash
# 需要管理员权限
PATCH /api/admin/users/:userId/role
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "role": "ADMIN"
}
```

## 注意事项

1. 确保至少有一个管理员账户存在，否则无法访问用户管理功能
2. 可以使用现有的CLI工具创建第一个管理员：
   ```bash
   npm run create-user your@email.com "Your Name" username --role=admin
   ```
3. 所有操作都会在控制台记录日志
4. 建议定期备份用户数据

## 未来改进建议

1. 添加批量操作功能
2. 添加用户详情查看页面
3. 添加用户活动日志
4. 添加邮件通知功能
5. 添加更多的用户筛选和排序选项
6. 添加用户导入/导出功能
