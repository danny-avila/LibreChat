import type { MouseEvent } from 'react';
import type * as t from '~/admin/types';
import { cn } from '~/admin/utils';
import { Icon } from '~/admin/ui';

/**
 * Native button so the accessible name is the caller's `ariaLabel` (click-ui
 * `IconButton` overwrites `aria-label` with the icon name) and the button can
 * never act as a form's implicit submit button.
 */
export function TrashButton({ onClick, ariaLabel, size = 'sm', disabled }: t.TrashButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
      className={cn('icon-btn icon-btn-danger', size === 'xs' && 'icon-btn-xs')}
    >
      <span aria-hidden="true" className="flex">
        <Icon name="trash" size={size} />
      </span>
    </button>
  );
}
