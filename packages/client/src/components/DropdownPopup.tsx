import React from 'react';
import * as Ariakit from '@ariakit/react';
import type * as t from '~/common';
import { cn } from '~/utils';
import './Dropdown.css';

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
> &
  Ariakit.MenuProps;

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

const MenuItemText = ({
  label,
  description,
}: {
  label?: React.ReactNode;
  description?: React.ReactNode;
}) => (
  <div className="flex min-w-0 flex-1 flex-col text-left">
    {label && <span className="text-sm font-medium text-text-primary">{label}</span>}
    {description && (
      <span className="mt-0.5 text-xs text-text-secondary">{description}</span>
    )}
  </div>
);

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
  ...props
}) => {
  const menuStore = Ariakit.useMenuStore();
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
      {...props}
    >
      {items
        .filter((item) => item.show !== false)
        .map((item, index) => {
          const { subItems } = item;
          if (item.separate === true) {
            return <Ariakit.MenuSeparator key={index} className="my-1 h-px bg-white/10" />;
          }
          if (subItems && subItems.length > 0) {
            return (
              <Ariakit.MenuProvider
                store={menuStore}
                key={`${keyPrefix ?? ''}${index}-${item.id ?? ''}-provider`}
              >
                <Ariakit.MenuButton
                  className={cn(
                    'group flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-3.5 text-sm text-text-primary outline-none transition-colors duration-200 hover:bg-surface-hover focus:bg-surface-hover md:px-2.5 md:py-2',
                    itemClassName,
                  )}
                  disabled={item.disabled}
                  id={item.id}
                  render={item.render}
                  ref={item.ref}
                  // hideOnClick={item.hideOnClick}
                >
                  <div className="flex flex-1 items-start gap-3">
                    {item.icon != null && (
                      <span
                        className={cn('size-4 flex-shrink-0 text-text-primary', iconClassName)}
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                    )}
                    <MenuItemText label={item.label} description={item.description} />
                  </div>
                  <Ariakit.MenuButtonArrow className="mt-1 stroke-1 text-base opacity-75" />
                </Ariakit.MenuButton>
                <Menu
                  items={subItems}
                  menuId={`${menuId}-${index}`}
                  key={`${keyPrefix ?? ''}${index}-${item.id ?? ''}`}
                  gutter={12}
                  portal={true}
                />
              </Ariakit.MenuProvider>
            );
          }

          return (
            <Ariakit.MenuItem
              key={`${keyPrefix ?? ''}${index}-${item.id ?? ''}`}
              id={item.id}
              className={cn(
                'group flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-3.5 text-sm text-text-primary outline-none transition-colors duration-200 hover:bg-surface-hover focus:bg-surface-hover md:px-2.5 md:py-2',
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
                <span
                  className={cn('size-4 flex-shrink-0 text-text-primary', iconClassName)}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              )}
              <MenuItemText label={item.label} description={item.description} />
              {item.kbd != null && (
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
