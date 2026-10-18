import type * as t from '~/admin/types';
import { useStripAriaExpanded, useLocalize } from '~/admin/hooks';
import { DecorativeIcon } from './DecorativeIcon';
import { Dropdown } from '~/admin/ui';

export function KebabMenu({ items, ariaLabel }: t.KebabMenuProps) {
  const localize = useLocalize();
  const triggerRef = useStripAriaExpanded<HTMLButtonElement>();

  return (
    <Dropdown>
      <Dropdown.Trigger>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-label={ariaLabel ?? localize('com_admin_ui_actions')}
          className="rounded p-1 text-(--cui-color-text-muted) transition-colors hover:bg-(--cui-color-background-hover)"
        >
          <DecorativeIcon name="dots-horizontal" size="sm" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Content>
        {items.map((item) => (
          <Dropdown.Item
            key={item.label}
            icon={item.icon}
            onClick={item.onClick}
            disabled={item.disabled}
            title={item.title}
            className={item.danger ? 'text-(--cui-color-accent-danger)' : undefined}
          >
            {item.label}
          </Dropdown.Item>
        ))}
      </Dropdown.Content>
    </Dropdown>
  );
}
