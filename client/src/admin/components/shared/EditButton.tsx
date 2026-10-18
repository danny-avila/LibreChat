import type * as t from '~/admin/types';
import { cn } from '~/admin/utils';
import { Icon } from '~/admin/ui';

/** Native button for the same reasons as `TrashButton`. */
export function EditButton({ onClick, ariaLabel, size = 'sm', disabled }: t.EditButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
      className={cn('icon-btn', size === 'xs' && 'icon-btn-xs')}
    >
      <span aria-hidden="true" className="flex">
        <Icon name="pencil" size={size} />
      </span>
    </button>
  );
}
