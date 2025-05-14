import React from 'react';
import * as Ariakit from '@ariakit/react';
import type * as t from '~/common';
import { cn } from '~/utils';

interface DropdownProps {
  keyPrefix?: string;
  trigger: React.ReactNode;
  items: t.MenuItemProps[];
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  className?: string;
  iconClassName?: string;
  itemClassName?: string;
  sameWidth?: boolean;
  anchor?: { x: string; y: string };
  gutter?: number;
  modal?: boolean;
  portal?: boolean;
  preserveTabOrder?: boolean;
  focusLoop?: boolean;
  menuId: string;
  mountByState?: boolean;
  unmountOnHide?: boolean;
  finalFocus?: React.RefObject<HTMLElement>;
}

type MenuProps = Omit<
  DropdownProps,
  'trigger' | 'isOpen' | 'setIsOpen' | 'focusLoop' | 'mountByState'
>;

const DropdownPopup: React.FC<DropdownProps> = ({
  trigger,
  isOpen,
  setIsOpen,
  focusLoop,
  mountByState,
  ...props
}) => {
  const menu = Ariakit.useMenuStore({ open: isOpen, setOpen: setIsOpen, focusLoop });
  if (mountByState) {
    return (
      <Ariakit.MenuProvider store={menu}>
        {trigger}
        {isOpen && <Menu {...props} />}
      </Ariakit.MenuProvider>
    );
  }
  return (
    <Ariakit.MenuProvider store={menu}>
      {trigger}
      <Menu {...props} />
    </Ariakit.MenuProvider>
  );
};

const Menu: React.FC<MenuProps> = ({
  items,
  menuId,
  keyPrefix,
  className,
  iconClassName,
  itemClassName,
  modal,
  portal,
  sameWidth,
  gutter = 8,
  finalFocus,
  unmountOnHide,
  preserveTabOrder,
}) => {
  const menu = Ariakit.useMenuContext();
  return (
    <Ariakit.Menu
      id={menuId}
      modal={modal}
      gutter={gutter}
      portal={portal}
      sameWidth={sameWidth}
      finalFocus={finalFocus}
      unmountOnHide={unmountOnHide}
      preserveTabOrder={preserveTabOrder}
      className={cn('popover-ui z-50', className)}
    >
      {items
        .filter((item) => item.show !== false)
        .map((item, index) => {
          if (item.separate === true) {
            return <Ariakit.MenuSeparator key={index} className="my-1 h-px bg-white/10" />;
          }
          return (
            <Ariakit.MenuItem
              key={`${keyPrefix ?? ''}${index}-${item.id ?? ''}`}
              id={item.id}
              className={cn(
                'group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-3.5 text-sm text-text-primary outline-none transition-colors duration-200 hover:bg-surface-hover focus:bg-surface-hover md:px-2.5 md:py-2',
                itemClassName,
              )}
              disabled={item.disabled}
              render={item.render}
              ref={item.ref}
              hideOnClick={item.hideOnClick}
              onClick={(event) => {
                event.preventDefault();
                if (item.onClick) {
                  item.onClick(event);
                }
                if (item.hideOnClick === false) {
                  return;
                }
                menu?.hide();
              }}
            >
              {item.icon != null && (
                <span className={cn('mr-2 size-4', iconClassName)} aria-hidden="true">
                  {item.icon}
                </span>
              )}
              {item.label}
              {item.kbd != null && (
                // eslint-disable-next-line i18next/no-literal-string
                <kbd className="ml-auto hidden font-sans text-xs text-black/50 group-hover:inline group-focus:inline dark:text-white/50">
                  ⌘{item.kbd}
                </kbd>
              )}
            </Ariakit.MenuItem>
          );
        })}
    </Ariakit.Menu>
  );
};

export default DropdownPopup;
