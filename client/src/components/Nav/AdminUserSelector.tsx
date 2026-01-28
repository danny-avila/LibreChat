import React, { useState, useCallback, useEffect, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRecoilState } from 'recoil';
import { Search, Users, X, ChevronDown, User as UserIcon } from 'lucide-react';
import { SystemRoles, dataService } from 'librechat-data-provider';
import { Button, Input, Spinner } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

// Type definitions
interface AdminUser {
  _id: string;
  email: string;
  username?: string;
  name?: string;
  role: string;
  provider?: string;
  createdAt: string;
  emailVerified?: boolean;
  avatar?: string;
}

interface AdminUsersResponse {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface AdminUserSelectorProps {
  onUserSelect?: (user: AdminUser | null) => void;
}

const AdminUserSelector: React.FC<AdminUserSelectorProps> = memo(({ onUserSelect }) => {
  const { user: currentUser } = useAuthContext();
  const [selectedUser, setSelectedUser] = useRecoilState(store.adminSelectedUser);
  const [isAdminViewMode, setIsAdminViewMode] = useRecoilState(store.isAdminViewMode);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Check if current user is admin
  const isAdmin = currentUser?.role === SystemRoles.ADMIN;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch users
  const { data, isLoading } = useQuery<AdminUsersResponse>({
    queryKey: ['adminUsersSelector', debouncedSearch],
    queryFn: () => dataService.getAdminUsers({ limit: 50, search: debouncedSearch }),
    enabled: isAdmin && isOpen,
    staleTime: 30000,
  });

  const handleUserSelect = useCallback(
    (user: AdminUser) => {
      setSelectedUser(user);
      setIsAdminViewMode(true);
      setIsOpen(false);
      onUserSelect?.(user);
    },
    [setSelectedUser, setIsAdminViewMode, onUserSelect],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedUser(null);
    setIsAdminViewMode(false);
    onUserSelect?.(null);
  }, [setSelectedUser, setIsAdminViewMode, onUserSelect]);

  const handleToggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Don't render if not admin
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="relative w-full">
      {/* Toggle Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggleOpen}
        className={cn(
          'flex w-full items-center justify-between gap-2 text-xs',
          isAdminViewMode && selectedUser && 'bg-green-100 dark:bg-green-900/30',
        )}
      >
        <div className="flex items-center gap-2 truncate">
          <Users size={14} className="flex-shrink-0" />
          {selectedUser ? (
            <span className="truncate">
              查看: {selectedUser.name || selectedUser.username || selectedUser.email}
            </span>
          ) : (
            <span>选择用户查看对话</span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={cn('flex-shrink-0 transition-transform', isOpen && 'rotate-180')}
        />
      </Button>

      {/* Clear Selection Button */}
      {selectedUser && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearSelection}
          className="absolute right-8 top-1/2 -translate-y-1/2 p-1 h-6 w-6"
        >
          <X size={12} />
        </Button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-80 overflow-hidden rounded-lg border border-border-light bg-surface-primary shadow-lg">
          {/* Search */}
          <div className="border-b border-border-light p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-secondary" />
              <Input
                type="text"
                placeholder="搜索用户..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-7 text-xs"
                autoFocus
              />
            </div>
          </div>

          {/* User List */}
          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="h-4 w-4" />
              </div>
            ) : data?.users.length === 0 ? (
              <div className="py-4 text-center text-xs text-text-secondary">未找到用户</div>
            ) : (
              data?.users.map((user) => (
                <button
                  key={user._id}
                  onClick={() => handleUserSelect(user)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-secondary',
                    selectedUser?._id === user._id && 'bg-surface-tertiary',
                  )}
                >
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name || user.email}
                      className="h-6 w-6 flex-shrink-0 rounded-full"
                    />
                  ) : (
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-tertiary">
                      <UserIcon size={12} className="text-text-secondary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-text-primary">
                      {user.name || user.username || '未命名'}
                    </div>
                    <div className="truncate text-text-secondary">{user.email}</div>
                  </div>
                  {user.role === 'ADMIN' && (
                    <span className="flex-shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      管理员
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});

AdminUserSelector.displayName = 'AdminUserSelector';

export default AdminUserSelector;
