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
  TAdminGroupsResponse,
} from 'librechat-data-provider';
import {
  UserPlus,
  Trash2,
  Shield,
  User as UserIcon,
  Search,
  Users,
  FolderPlus,
  X,
} from 'lucide-react';
import { useLocalize } from '~/hooks';

const UserManagement: React.FC = () => {
  const localize = useLocalize();
  const t = (key: string, values?: Record<string, string>) =>
    localize(key as never, values as never);
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isEditGroupsDialogOpen, setIsEditGroupsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TAdminUser | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [formData, setFormData] = useState<TCreateAdminUserRequest>({
    email: '',
    name: '',
    username: '',
    password: '',
  });

  // Fetch users
  const { data, isLoading, isError, error } = useQuery<TAdminUsersResponse>({
    queryKey: ['adminUsers', page, search],
    queryFn: () => dataService.getAdminUsers({ page, limit: 20, search }),
  });

  // Fetch groups
  const { data: groupsData, isError: isGroupsError } = useQuery<TAdminGroupsResponse>({
    queryKey: ['adminGroups'],
    queryFn: () => dataService.getAdminGroups(),
  });

  // Create admin user mutation
  const createMutation = useMutation({
    mutationFn: (userData: TCreateAdminUserRequest) => dataService.createAdminUser(userData),
    onSuccess: () => {
      showToast({ status: 'success', message: t('com_admin_toast_create_admin_success') });
      setIsCreateDialogOpen(false);
      setFormData({ email: '', name: '', username: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: (error: any) => {
      showToast({
        status: 'error',
        message: error.response?.data?.message || t('com_admin_toast_create_admin_failed'),
      });
    },
  });

  // Update groups mutation
  const updateGroupsMutation = useMutation({
    mutationFn: ({ userId, groups }: { userId: string; groups: string[] }) =>
      dataService.updateUserGroups(userId, groups),
    onSuccess: (result) => {
      showToast({ status: 'success', message: t('com_admin_toast_update_groups_success') });
      // 用返回的最新 user 对象直接更新缓存，避免依赖后台 refetch 的时序
      const updatedUser = (result as any)?.user;
      if (updatedUser) {
        queryClient.setQueryData<TAdminUsersResponse>(
          ['adminUsers', page, search],
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              users: prev.users.map((u) =>
                u._id === updatedUser._id ? { ...u, groups: updatedUser.groups } : u,
              ),
            };
          },
        );
      }
      setIsEditGroupsDialogOpen(false);
      setSelectedUser(null);
      setSelectedGroups([]);
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminGroups'] });
    },
    onError: (error: any) => {
      showToast({
        status: 'error',
        message: error.response?.data?.message || t('com_admin_toast_update_groups_failed'),
      });
    },
  });

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: (name: string) => dataService.createAdminGroup(name),
    onSuccess: () => {
      showToast({ status: 'success', message: t('com_admin_toast_create_group_success') });
      setNewGroupName('');
      queryClient.invalidateQueries({ queryKey: ['adminGroups'] });
    },
    onError: (error: any) => {
      showToast({
        status: 'error',
        message: error.response?.data?.message || t('com_admin_toast_create_group_failed'),
      });
    },
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: ({ groupName, resetUsers }: { groupName: string; resetUsers?: boolean }) =>
      dataService.deleteAdminGroup(groupName, resetUsers),
    onSuccess: () => {
      showToast({ status: 'success', message: t('com_admin_toast_delete_group_success') });
      queryClient.invalidateQueries({ queryKey: ['adminGroups'] });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: (error: any) => {
      showToast({
        status: 'error',
        message: error.response?.data?.message || t('com_admin_toast_delete_group_failed'),
      });
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => dataService.deleteUserByAdmin(userId),
    onSuccess: () => {
      showToast({ status: 'success', message: t('com_admin_toast_delete_user_success') });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: (error: any) => {
      showToast({
        status: 'error',
        message: error.response?.data?.message || t('com_admin_toast_delete_user_failed'),
      });
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleOpenEditGroups = (user: TAdminUser) => {
    setSelectedUser(user);
    setSelectedGroups(user.groups || []);
    setIsEditGroupsDialogOpen(true);
  };

  const handleUpdateGroups = () => {
    if (selectedUser) {
      updateGroupsMutation.mutate({ userId: selectedUser._id, groups: selectedGroups });
    }
  };

  const handleGroupToggle = (groupName: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupName)
        ? prev.filter((g) => g !== groupName)
        : [...prev, groupName]
    );
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGroupName.trim()) {
      createGroupMutation.mutate(newGroupName.trim());
    }
  };

  const handleDeleteGroup = (groupName: string) => {
    if (confirm(t('com_admin_confirm_delete_group', { name: groupName }))) {
      const resetUsers = confirm(t('com_admin_confirm_remove_group_from_users'));
      deleteGroupMutation.mutate({ groupName, resetUsers });
    }
  };

  const handleDeleteUser = (user: TAdminUser) => {
    if (confirm(t('com_admin_confirm_delete_user', { email: user.email }))) {
      deleteMutation.mutate(user._id);
    }
  };

  // Get role display info
  const getRoleDisplay = (role: string) => {
    if (role === 'ADMIN') {
      return {
        label: t('com_admin_role_admin'),
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      };
    }
    if (role === 'USER') {
      return {
        label: t('com_admin_role_user'),
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      };
    }
    // Custom group
    return { label: role, className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
  };

  // Get groups display
  const getGroupsDisplay = (groups?: string[]) => {
    if (!groups || groups.length === 0) {
      return null;
    }
    return groups;
  };

  return (
    <div className="h-full w-full overflow-auto bg-surface-primary p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">{t('com_admin_user_management_title')}</h1>
            <p className="mt-1 text-sm text-text-secondary">{t('com_admin_user_management_subtitle')}</p>
          </div>
          <div className="flex gap-2">
            {/* Group Management Dialog */}
            <OGDialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
              <OGDialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Users size={18} />
                  {t('com_admin_group_management')}
                </Button>
              </OGDialogTrigger>
              <OGDialogContent className="max-w-lg">
                <OGDialogHeader>
                  <OGDialogTitle>{t('com_admin_group_management_title')}</OGDialogTitle>
                </OGDialogHeader>
                <div className="space-y-4">
                  {/* Create new group */}
                  <form onSubmit={handleCreateGroup} className="flex gap-2">
                    <Input
                      type="text"
                      placeholder={t('com_admin_new_group_placeholder')}
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="submit" disabled={createGroupMutation.isLoading || !newGroupName.trim()}>
                      <FolderPlus size={16} className="mr-1" />
                      {t('com_admin_create')}
                    </Button>
                  </form>

                  {/* Groups list */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-text-secondary">{t('com_admin_system_roles')}</h3>
                    <div className="flex flex-wrap gap-2">
                      {groupsData?.systemRoles?.map((role) => (
                        <span
                          key={role}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700"
                        >
                          {role === 'ADMIN' ? <Shield size={14} /> : <UserIcon size={14} />}
                          {role === 'ADMIN' ? t('com_admin_role_admin') : t('com_admin_role_user')}
                        </span>
                      ))}
                    </div>

                    <h3 className="mt-4 text-sm font-medium text-text-secondary">{t('com_admin_custom_groups')}</h3>
                    {groupsData?.groups && groupsData.groups.length > 0 ? (
                      <div className="space-y-2">
                        {groupsData.groups.map((group) => (
                          <div
                            key={group.name}
                            className="flex items-center justify-between rounded-lg border border-border-light bg-surface-secondary p-3"
                          >
                            <div className="flex items-center gap-2">
                              <Users size={16} className="text-green-600" />
                              <span className="font-medium text-text-primary">{group.name}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteGroup(group.name)}
                              disabled={deleteGroupMutation.isLoading}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-text-tertiary">{t('com_admin_no_custom_groups')}</p>
                    )}
                  </div>
                </div>
              </OGDialogContent>
            </OGDialog>

            {/* Create Admin User Dialog */}
            <OGDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <OGDialogTrigger asChild>
                <Button className="gap-2">
                  <UserPlus size={18} />
                  {t('com_admin_create_admin_user')}
                </Button>
              </OGDialogTrigger>
              <OGDialogContent className="max-w-md">
                <OGDialogHeader>
                  <OGDialogTitle>{t('com_admin_create_admin_user_title')}</OGDialogTitle>
                </OGDialogHeader>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <Label htmlFor="email">{t('com_admin_email_required')}</Label>
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
                    <Label htmlFor="name">{t('com_admin_name_required')}</Label>
                    <Input
                      id="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t('com_admin_admin_name_placeholder')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="username">{t('com_admin_username_required')}</Label>
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
                    <Label htmlFor="password">{t('com_admin_password_required')}</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={t('com_admin_password_min_chars')}
                      minLength={8}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      {localize('com_ui_cancel')}
                    </Button>
                    <Button type="submit" disabled={createMutation.isLoading}>
                      {createMutation.isLoading
                        ? t('com_admin_create_in_progress')
                        : t('com_admin_create_admin')}
                    </Button>
                  </div>
                </form>
              </OGDialogContent>
            </OGDialog>
          </div>
        </div>

        {/* Edit Groups Dialog */}
        <OGDialog open={isEditGroupsDialogOpen} onOpenChange={setIsEditGroupsDialogOpen}>
          <OGDialogContent className="max-w-md">
            <OGDialogHeader>
              <OGDialogTitle>{t('com_admin_manage_user_groups')}</OGDialogTitle>
            </OGDialogHeader>
            {selectedUser && (
              <div className="space-y-4">
                <div className="rounded-lg bg-surface-secondary p-3">
                  <p className="text-sm text-text-secondary">{t('com_admin_user')}</p>
                  <p className="font-medium text-text-primary">{selectedUser.name || selectedUser.email}</p>
                  <p className="text-sm text-text-tertiary">{selectedUser.email}</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t('com_admin_role')}: <span className="font-medium">{selectedUser.role === 'ADMIN' ? t('com_admin_role_admin') : t('com_admin_role_user')}</span>
                  </p>
                </div>
                <div>
                  <Label>{t('com_admin_select_groups_multi')}</Label>
                  <p className="mb-2 text-xs text-text-tertiary">{t('com_admin_user_multiple_groups')}</p>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto rounded-lg border border-border-light p-3">
                    {groupsData?.groups && groupsData.groups.length > 0 ? (
                      groupsData.groups.map((group) => (
                        <label
                          key={group.name}
                          className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-surface-tertiary"
                        >
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(group.name)}
                            onChange={() => handleGroupToggle(group.name)}
                            className="h-4 w-4 rounded border-border-medium text-green-600 focus:ring-green-500"
                          />
                          <div className="flex items-center gap-2">
                            <Users size={16} className="text-green-600" />
                            <span className="text-text-primary">{group.name}</span>
                          </div>
                        </label>
                      ))
                    ) : (
                      <p className="text-center text-sm text-text-tertiary">{t('com_admin_no_groups_available')}</p>
                    )}
                  </div>
                </div>
                {selectedGroups.length > 0 && (
                  <div>
                    <Label>{t('com_admin_selected_groups')}</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedGroups.map((group) => (
                        <span
                          key={group}
                          className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800 dark:bg-green-900 dark:text-green-200"
                        >
                          <Users size={12} />
                          {group}
                          <button
                            type="button"
                            onClick={() => handleGroupToggle(group)}
                            className="ml-1 rounded-full p-0.5 hover:bg-green-200 dark:hover:bg-green-800"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditGroupsDialogOpen(false);
                      setSelectedUser(null);
                      setSelectedGroups([]);
                    }}
                  >
                    {localize('com_ui_cancel')}
                  </Button>
                  <Button
                    onClick={handleUpdateGroups}
                    disabled={updateGroupsMutation.isLoading}
                  >
                    {updateGroupsMutation.isLoading
                      ? t('com_admin_update_in_progress')
                      : t('com_admin_confirm_update')}
                  </Button>
                </div>
              </div>
            )}
          </OGDialogContent>
        </OGDialog>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              type="text"
              placeholder={t('com_admin_search_users_placeholder')}
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
                  {t('com_admin_col_user')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  {t('com_admin_col_username')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  {t('com_admin_col_role_groups')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  {t('com_admin_col_registered_at')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  {t('com_admin_col_actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-secondary">
                    {t('com_admin_loading')}
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-red-500">
                    {t('com_admin_load_failed')}: {(error as any)?.response?.data?.message || (error as Error)?.message || t('com_admin_permission_check')}
                  </td>
                </tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-secondary">
                    {t('com_admin_no_users_found')}
                  </td>
                </tr>
              ) : (
                data?.users.map((user) => {
                  const roleDisplay = getRoleDisplay(user.role);
                  return (
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
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${roleDisplay.className}`}
                        >
                          {user.role === 'ADMIN' ? (
                            <Shield size={12} />
                          ) : (
                            <UserIcon size={12} />
                          )}
                          {roleDisplay.label}
                        </span>
                        {user.groups && user.groups.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {user.groups.map((group) => (
                              <span
                                key={group}
                                className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200"
                              >
                                <Users size={10} />
                                {group}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
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
                          onClick={() => handleOpenEditGroups(user)}
                          disabled={updateGroupsMutation.isLoading}
                          className="gap-1"
                        >
                          <Users size={14} />
                          {t('com_admin_manage_groups')}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-text-secondary">
              {t('com_admin_total_users_pagination', {
                total: String(data.pagination.total),
                page: String(data.pagination.page),
                totalPages: String(data.pagination.totalPages),
              })}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                {t('com_admin_prev_page')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.pagination.totalPages}
              >
                {t('com_admin_next_page')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
