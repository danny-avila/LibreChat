import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogTrigger,
  Input,
  Label,
  useToastContext,
} from '@librechat/client';
import { dataService } from 'librechat-data-provider';
import type {
  TAdminUser,
  TAdminUsersResponse,
  TCreateAdminUserRequest,
  TCreateAdminUserResponse,
} from 'librechat-data-provider';
import { UserPlus, Trash2, Shield, User as UserIcon, Search } from 'lucide-react';
import { useLocalize } from '~/hooks';

const UserManagement: React.FC = () => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<TCreateAdminUserRequest>({
    email: '',
    name: '',
    username: '',
    password: '',
  });

  // Fetch users
  const { data, isLoading, refetch } = useQuery<TAdminUsersResponse>({
    queryKey: ['adminUsers', page, search],
    queryFn: () => dataService.getAdminUsers({ page, limit: 20, search }),
  });

  // Create admin user mutation
  const createMutation = useMutation({
    mutationFn: (userData: TCreateAdminUserRequest) => dataService.createAdminUser(userData),
    onSuccess: () => {
      showToast({ status: 'success', message: '管理员用户创建成功' });
      setIsCreateDialogOpen(false);
      setFormData({ email: '', name: '', username: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: (error: any) => {
      showToast({
        status: 'error',
        message: error.response?.data?.message || '创建管理员用户失败',
      });
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      dataService.updateUserRole(userId, role),
    onSuccess: () => {
      showToast({ status: 'success', message: '用户角色更新成功' });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: (error: any) => {
      showToast({
        status: 'error',
        message: error.response?.data?.message || '更新用户角色失败',
      });
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => dataService.deleteUserByAdmin(userId),
    onSuccess: () => {
      showToast({ status: 'success', message: '用户删除成功' });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: (error: any) => {
      showToast({ status: 'error', message: error.response?.data?.message || '删除用户失败' });
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleToggleRole = (user: TAdminUser) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    if (confirm(`确定要将用户 ${user.email} 的角色更改为 ${newRole} 吗？`)) {
      updateRoleMutation.mutate({ userId: user._id, role: newRole });
    }
  };

  const handleDeleteUser = (user: TAdminUser) => {
    if (confirm(`确定要删除用户 ${user.email} 吗？此操作不可撤销。`)) {
      deleteMutation.mutate(user._id);
    }
  };

  return (
    <div className="h-full w-full overflow-auto bg-surface-primary p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">用户管理</h1>
            <p className="mt-1 text-sm text-text-secondary">管理系统用户和管理员账户</p>
          </div>
          <OGDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <OGDialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus size={18} />
                创建管理员用户
              </Button>
            </OGDialogTrigger>
            <OGDialogContent className="max-w-md">
              <OGDialogHeader>
                <OGDialogTitle>创建新管理员用户</OGDialogTitle>
              </OGDialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <Label htmlFor="email">电子邮件 *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="name">姓名 *</Label>
                  <Input
                    id="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="管理员姓名"
                  />
                </div>
                <div>
                  <Label htmlFor="username">用户名 *</Label>
                  <Input
                    id="username"
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="admin_username"
                  />
                </div>
                <div>
                  <Label htmlFor="password">密码 *</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="至少8位字符"
                    minLength={8}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={createMutation.isLoading}>
                    {createMutation.isLoading ? '创建中...' : '创建管理员'}
                  </Button>
                </div>
              </form>
            </OGDialogContent>
          </OGDialog>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              type="text"
              placeholder="搜索用户（邮箱、姓名或用户名）"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
          <table className="w-full">
            <thead className="bg-surface-tertiary">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  用户
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  用户名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  角色
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  注册时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-secondary">
                    加载中...
                  </td>
                </tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-secondary">
                    未找到用户
                  </td>
                </tr>
              ) : (
                data?.users.map((user) => (
                  <tr key={user._id} className="hover:bg-surface-tertiary">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name || user.email}
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-active">
                            <UserIcon size={20} className="text-text-secondary" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-text-primary">{user.name}</div>
                          <div className="text-sm text-text-secondary">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-text-primary">{user.username || '-'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                          user.role === 'ADMIN'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {user.role === 'ADMIN' ? (
                          <>
                            <Shield size={12} />
                            管理员
                          </>
                        ) : (
                          '用户'
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {new Date(user.createdAt).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleRole(user)}
                          disabled={updateRoleMutation.isLoading}
                        >
                          {user.role === 'ADMIN' ? '设为普通用户' : '设为管理员'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteUser(user)}
                          disabled={deleteMutation.isLoading}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-text-secondary">
              共 {data.pagination.total} 个用户，第 {data.pagination.page} /{' '}
              {data.pagination.totalPages} 页
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.pagination.totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
