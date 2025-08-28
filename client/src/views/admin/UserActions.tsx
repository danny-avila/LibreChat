import React, { useState } from 'react';
import { Button } from '~/components/ui/Button';
import { Info, Trash, ChevronDown, UserIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import { cn } from '~/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/DropdownMenu';

interface User {
  _id: string;
  email?: string;
  username?: string;
  role?: string;
}

// Role badge component for consistent styling
const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const normalizedRole = String(role).trim();
  const isAdmin = normalizedRole.toLowerCase() === 'admin';
  const isUser = normalizedRole.toLowerCase() === 'user';

  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium',
        isAdmin
          ? 'bg-green-100 !text-green-700 dark:bg-green-900 dark:!text-green-300'
          : isUser
            ? 'bg-blue-100 !text-blue-700 dark:bg-blue-900 dark:!text-blue-300'
            : 'bg-slate-100 !text-slate-700 dark:bg-slate-800 dark:!text-slate-300',
      )}
    >
      {role}
    </span>
  );
};

interface UserActionsProps {
  user: User;
  onToggleRole: (id: string, nextRole: string) => void;
  onView: (user: User) => void;
  onDelete: (id: string) => void;
}

export const UserActions: React.FC<UserActionsProps> = ({
  user,
  onToggleRole,
  onView,
  onDelete,
}) => {
  const currentRole = String(user.role || '')
    .trim()
    .toUpperCase();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isViewingUsage, setIsViewingUsage] = useState(false);

  const handleDelete = () => {
    setConfirmOpen(false);
    onDelete(user._id);
  };

  const handleViewUsage = () => {
    setIsViewingUsage(true);
    onView(user);
  };

  return (
    <div className="flex items-center justify-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="secondary"
            className="min-w-[110px] justify-between gap-1 px-3"
          >
            <RoleBadge role={user.role || 'User'} />
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem
            onClick={() => onToggleRole(user._id, 'ADMIN')}
            className={cn(
              'cursor-pointer gap-2',
              currentRole === 'ADMIN' &&
                'bg-green-50 font-medium text-green-600 dark:bg-green-900/30 dark:text-green-400',
            )}
          >
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
            Admin
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onToggleRole(user._id, 'USER')}
            className={cn(
              'cursor-pointer gap-2',
              currentRole === 'USER' &&
                'bg-blue-50 font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
            )}
          >
            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
            User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="icon"
        variant="neutral"
        onClick={handleViewUsage}
        onBlur={() => setIsViewingUsage(false)}
        aria-label="View Usage Info"
        className={`relative transition-all duration-200 ${
          isViewingUsage
            ? 'bg-indigo-600 text-white ring-2 ring-indigo-200 dark:bg-indigo-500 dark:ring-indigo-900'
            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50'
        }`}
      >
        <Info className="h-4 w-4" />
        {isViewingUsage && (
          <span className="absolute -right-1 -top-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500"></span>
          </span>
        )}
      </Button>

      {/* Trash Icon Button instead of Delete text */}
      <Button
        size="icon"
        variant="ghost"
        className="text-red-500 hover:bg-red-500 hover:text-white focus-visible:ring-0"
        onClick={() => setConfirmOpen(true)}
        aria-label="Delete User"
      >
        <Trash className="h-4 w-4" />
      </Button>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md border-2 border-red-200 shadow-lg dark:border-red-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Trash className="h-5 w-5 text-red-500" />
              Confirm User Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="my-4 space-y-3 text-sm">
            <p className="text-gray-700 dark:text-gray-300">
              You are about to delete the following user:
            </p>
            <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-800">
              <p className="font-medium">{user.email || 'No email available'}</p>
              {user.username && <p className="text-gray-500 dark:text-gray-400">{user.username}</p>}
              {user.role && (
                <div className="mt-2">
                  <span className="mr-2 text-xs text-gray-500">Role:</span>
                  <RoleBadge role={user.role} />
                </div>
              )}
            </div>
            <p className="font-semibold text-red-600 dark:text-red-400">
              This action cannot be undone. All user data and conversations will be permanently
              removed.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete User
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Model Usage Dialog - handled by parent component */}
    </div>
  );
};
