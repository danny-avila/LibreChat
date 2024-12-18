import React from 'react';
import * as Ariakit from '@ariakit/react';
import { cn } from '~/utils';

interface DropdownProps {
  trigger: React.ReactNode;
  items: {
    label?: string;
    onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => void;
    icon?: React.ReactNode;
    kbd?: string;
    show?: boolean;
    disabled?: boolean;
    separate?: boolean;
  }[];
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  className?: string;
  iconClassName?: string;
  itemClassName?: string;
  sameWidth?: boolean;
  anchor?: { x: string; y: string };
  gutter?: number;
  modal?: boolean;
  menuId: string;
}

const DropdownPopup: React.FC<DropdownProps> = ({
  trigger,
  items,
  isOpen,
  setIsOpen,
  menuId,
  modal,
  gutter = 8,
  sameWidth,
  className,
  iconClassName,
  itemClassName,
}) => {
  const menu = Ariakit.useMenuStore({ open: isOpen, setOpen: setIsOpen });

  return (
    <Ariakit.MenuProvider store={menu}>
      {trigger}
      <Ariakit.Menu
        id={menuId}
        className={cn('popover-ui z-50', className)}
        gutter={gutter}
        modal={modal}
        sameWidth={sameWidth}
      >
        {items
          .filter((item) => item.show !== false)
          .map((item, index) =>
            item.separate === true ? (
              <Ariakit.MenuSeparator key={index} className="my-1 h-px bg-white/10" />
            ) : (
              <Ariakit.MenuItem
                key={index}
                className={cn(
                  'group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-3.5 text-sm text-text-primary outline-none transition-colors duration-200 hover:bg-surface-hover focus:bg-surface-hover md:px-2.5 md:py-2',
                  itemClassName,
                )}
                disabled={item.disabled}
                onClick={(event) => {
                  event.preventDefault();
                  if (item.onClick) {
                    item.onClick(event);
                  }
                  menu.hide();
                }}
              >
                {item.icon != null && (
                  <span className={cn('mr-2 size-4', iconClassName)} aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                {item.label}
                {item.kbd != null && (
                  <kbd className="ml-auto hidden font-sans text-xs text-black/50 group-hover:inline group-focus:inline dark:text-white/50">
                    ⌘{item.kbd}
                  </kbd>
                )}
              </Ariakit.MenuItem>
            ),
          )}
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
};

export default DropdownPopup;
