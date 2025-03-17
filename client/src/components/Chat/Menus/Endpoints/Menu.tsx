import * as React from 'react';
import clsx from 'clsx';
import * as Ariakit from '@ariakit/react';
import { cn } from '~/utils';

export type MenuItemProps = Ariakit.MenuItemProps;

export const MenuItem = React.forwardRef<HTMLDivElement, MenuItemProps>(
  function MenuItem(props, ref) {
    return <Ariakit.MenuItem ref={ref} {...props} className={clsx('menu-item', props.className)} />;
  },
);

export interface MenuProps extends Ariakit.MenuButtonProps<'div'> {
  label: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const Menu = React.forwardRef<HTMLDivElement, MenuProps>(function Menu(
  { label, children, defaultOpen, open, onOpenChange, ...props },
  ref,
) {
  const menu = Ariakit.useMenuStore({
    open: open,
    setOpen: onOpenChange,
    defaultOpen: defaultOpen,
  });

  return (
    <Ariakit.MenuProvider store={menu}>
      <Ariakit.MenuButton
        ref={ref}
        {...props}
        className={clsx(!menu.parent && 'button')}
        render={menu.parent ? <MenuItem render={props.render} /> : undefined}
      >
        <span className="label">{label}</span>
      </Ariakit.MenuButton>
      <Ariakit.Menu
        portal
        gutter={8}
        shift={menu.parent ? -9 : 0}
        className={cn(
          'z-50 max-h-[40vh] overflow-auto rounded-xl border border-border-light bg-surface-secondary shadow-lg md:max-h-[50vh]',
          props.className,
        )}
      >
        {children}
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
});
