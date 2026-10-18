import type * as t from '~/admin/types';
import { DecorativeIcon } from './DecorativeIcon';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';
import { Avatar } from './Avatar';

export function SelectedMemberList({ users, onRemove, disabled }: t.SelectedMemberListProps) {
  const localize = useLocalize();

  if (users.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-(--cui-color-text-muted)">
        {localize('com_admin_access_no_members')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="max-h-48 overflow-auto rounded-lg border border-(--cui-color-stroke-default)">
        {users.map((user, i) => (
          <div
            key={user.id}
            className={cn(
              'flex items-center justify-between px-3 py-2',
              i < users.length - 1 && 'border-b border-(--cui-color-stroke-default)',
            )}
          >
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size="sm" />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-(--cui-color-text-default)">
                  {user.name}
                </span>
                <span className="text-xs text-(--cui-color-text-muted)">{user.email}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(user.id)}
              disabled={disabled}
              aria-label={localize('com_admin_ui_remove_item', { name: user.name })}
              className="trash-btn"
            >
              <DecorativeIcon name="cross" size="sm" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
