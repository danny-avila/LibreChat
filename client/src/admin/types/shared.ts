import type { AdminUserSearchResult } from 'librechat-data-provider';
import type { ReactNode, MutableRefObject } from 'react';
import type { MenuIconName } from './scope';

export interface ReorderableListHandle {
  discard: () => void;
  save: () => void;
}

export interface ReorderableListProps<T extends { id: string }> {
  items: T[];
  isLoading: boolean;
  filterFn: (item: T, query: string) => boolean;
  renderItemContent: (item: T) => ReactNode;
  searchPlaceholder: string;
  emptyMessage: string;
  reorderHint: string;
  onSaveOrder: (orderedIds: string[]) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  actionRef?: MutableRefObject<ReorderableListHandle | null>;
  headerAction: ReactNode;
  children?: ReactNode;
  reorderDisabled?: boolean;
}

export interface KebabMenuItem {
  label: string;
  icon?: MenuIconName;
  danger?: boolean;
  disabled?: boolean;
  /** Tooltip, e.g. why the item is disabled. */
  title?: string;
  onClick: () => void;
}

export interface KebabMenuProps {
  items: KebabMenuItem[];
  ariaLabel?: string;
}

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}

export interface EditButtonProps {
  onClick: () => void;
  ariaLabel: string;
  size?: 'xs' | 'sm';
  disabled?: boolean;
}

export interface EmptyStateProps {
  message: string;
  className?: string;
}

export interface FormDialogProps {
  open: boolean;
  title: string;
  submitLabel: string;
  submitDisabled?: boolean;
  saving?: boolean;
  error?: string;
  /** Muted footer text shown while there is no error (e.g. what is still needed to submit). */
  hint?: string;
  size?: 'sm' | 'lg';
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}

export interface LoadingStateProps {
  className?: string;
}

export interface ScreenReaderAnnouncerProps {
  message: string;
}

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  ariaLabel?: string;
}

export interface SelectedMemberListProps {
  users: AdminUserSearchResult[];
  onRemove: (userId: string) => void;
  disabled?: boolean;
}

export interface StickyActionBarProps {
  discardLabel: string;
  saveLabel: string;
  onDiscard: () => void;
  onSave: () => void;
  message?: ReactNode;
  /** Accessible name of the bar's region. */
  label?: string;
}

export interface StatusToggleProps {
  id: string;
  isActive: boolean;
  onChange: (isActive: boolean) => void;
  disabled?: boolean;
}

export interface CloseButtonProps {
  onClick: () => void;
  /** The accessible name and tooltip ("Close review"). */
  label: string;
  disabled?: boolean;
}

export interface TrashButtonProps {
  onClick: () => void;
  ariaLabel: string;
  size?: 'xs' | 'sm';
  disabled?: boolean;
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export interface UserSearchInlineProps {
  existingIds: string[];
  onAdd: (user: AdminUserSearchResult) => void;
  listboxId?: string;
  disabled?: boolean;
}
