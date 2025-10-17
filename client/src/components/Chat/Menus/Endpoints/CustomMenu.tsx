import * as React from 'react';
import * as Ariakit from '@ariakit/react';
import { cn } from '~/utils';

export interface CustomMenuProps extends Ariakit.MenuButtonProps<'div'> {
  label?: React.ReactNode;
  values?: Record<string, any>;
  onValuesChange?: (values: Record<string, any>) => void;
  searchValue?: string;
  onSearch?: (value: string) => void;
  combobox?: Ariakit.ComboboxProps['render'];
  trigger?: Ariakit.MenuButtonProps['render'];
  defaultOpen?: boolean;
}

export const CustomMenu = React.forwardRef<HTMLDivElement, CustomMenuProps>(function CustomMenu(
  {
    label,
    children,
    values,
    onValuesChange,
    searchValue,
    onSearch,
    combobox,
    trigger,
    defaultOpen,
    ...props
  },
  ref,
) {
  const parent = Ariakit.useMenuContext();
  const searchable = searchValue != null || !!onSearch || !!combobox;

  const menuStore = Ariakit.useMenuStore({
    showTimeout: 100,
    placement: parent ? 'right' : 'left',
    defaultOpen: defaultOpen,
  });

  const element = (
    <Ariakit.MenuProvider store={menuStore} values={values} setValues={onValuesChange}>
      <Ariakit.MenuButton
        ref={ref}
        {...props}
        className={cn(
          !parent &&
            'flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary',
          menuStore.useState('open')
            ? 'bg-surface-tertiary hover:bg-surface-tertiary'
            : 'bg-surface-secondary hover:bg-surface-tertiary',
          props.className,
        )}
        render={parent ? <CustomMenuItem render={trigger} /> : trigger}
      >
        <span className="flex-1">{label}</span>
        <Ariakit.MenuButtonArrow className="stroke-1 text-base opacity-75" />
      </Ariakit.MenuButton>
      <Ariakit.Menu
        open={menuStore.useState('open')}
        portal
        overlap
        unmountOnHide
        gutter={parent ? -4 : 4}
        className={cn(
          `${parent ? 'animate-popover-left ml-3' : 'animate-popover'} outline-none! z-50 flex max-h-[min(450px,var(--popover-available-height))] w-full`,
          'w-[var(--menu-width,auto)] min-w-[300px] flex-col overflow-auto rounded-xl border border-border-light',
          'bg-surface-secondary px-3 py-2 text-sm text-text-primary shadow-lg',
          'max-w-[calc(100vw-4rem)] sm:max-h-[calc(65vh)] sm:max-w-[400px]',
          searchable && 'p-0',
        )}
      >
        <SearchableContext.Provider value={searchable}>
          {searchable ? (
            <>
              <div className="sticky top-0 z-10 bg-inherit p-1">
                <Ariakit.Combobox
                  autoSelect
                  render={combobox}
                  className={cn(
                    'h-10 w-full rounded-lg border-none bg-transparent px-2 text-base',
                    'sm:h-8 sm:text-sm',
                    'focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-white',
                  )}
                />
              </div>
              <Ariakit.ComboboxList className="p-0.5 pt-0">{children}</Ariakit.ComboboxList>
            </>
          ) : (
            children
          )}
        </SearchableContext.Provider>
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );

  if (searchable) {
    return (
      <Ariakit.ComboboxProvider
        resetValueOnHide
        includesBaseElement={false}
        value={searchValue}
        setValue={onSearch}
      >
        {element}
      </Ariakit.ComboboxProvider>
    );
  }

  return element;
});

export const CustomMenuSeparator = React.forwardRef<HTMLHRElement, Ariakit.MenuSeparatorProps>(
  function CustomMenuSeparator(props, ref) {
    return (
      <Ariakit.MenuSeparator
        ref={ref}
        {...props}
        className={cn(
          'my-0.5 h-0 w-full border-t border-slate-200 dark:border-slate-700',
          props.className,
        )}
      />
    );
  },
);

export interface CustomMenuGroupProps extends Ariakit.MenuGroupProps {
  label?: React.ReactNode;
}

export const CustomMenuGroup = React.forwardRef<HTMLDivElement, CustomMenuGroupProps>(
  function CustomMenuGroup({ label, ...props }, ref) {
    return (
      <Ariakit.MenuGroup ref={ref} {...props} className={cn('', props.className)}>
        {label && (
          <Ariakit.MenuGroupLabel className="cursor-default p-2 text-sm font-medium opacity-60 sm:py-1 sm:text-xs">
            {label}
          </Ariakit.MenuGroupLabel>
        )}
        {props.children}
      </Ariakit.MenuGroup>
    );
  },
);

const SearchableContext = React.createContext(false);

export interface CustomMenuItemProps extends Omit<Ariakit.ComboboxItemProps, 'store'> {
  name?: string;
}

export const CustomMenuItem = React.forwardRef<HTMLDivElement, CustomMenuItemProps>(
  function CustomMenuItem({ name, value, ...props }, ref) {
    const menu = Ariakit.useMenuContext();
    const searchable = React.useContext(SearchableContext);
    const defaultProps: CustomMenuItemProps = {
      ref,
      focusOnHover: true,
      blurOnHoverEnd: false,
      ...props,
      className: cn(
        'relative flex cursor-default items-center gap-2 rounded-lg p-2 outline-none! scroll-m-1 scroll-mt-[calc(var(--combobox-height,0px)+var(--label-height,4px))] aria-disabled:opacity-25 data-[active-item]:bg-black/[0.075] data-[active-item]:text-black dark:data-[active-item]:bg-white/10 dark:data-[active-item]:text-white sm:py-1 sm:text-sm min-w-0 w-full before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-transparent before:rounded-full data-[active-item]:before:bg-black dark:data-[active-item]:before:bg-white',
        props.className,
      ),
    };

    const checkable = Ariakit.useStoreState(menu, (state) => {
      if (!name) {
        return false;
      }
      if (value == null) {
        return false;
      }
      return state?.values[name] != null;
    });

    const checked = Ariakit.useStoreState(menu, (state) => {
      if (!name) {
        return false;
      }
      return state?.values[name] === value;
    });

    // If the item is checkable, we render a checkmark icon next to the label.
    if (checkable) {
      defaultProps.children = (
        <React.Fragment>
          <span className="flex-1">{defaultProps.children}</span>
          <Ariakit.MenuItemCheck checked={checked} />
          {searchable && (
            // When an item is displayed in a search menu as a role=option
            // element instead of a role=menuitemradio, we can't depend on the
            // aria-checked attribute. Although NVDA and JAWS announce it
            // accurately, VoiceOver doesn't. TalkBack does announce the checked
            // state, but misleadingly implies that a double tap will change the
            // state, which isn't the case. Therefore, we use a visually hidden
            // element to indicate whether the item is checked or not, ensuring
            // cross-browser/AT compatibility.
            <Ariakit.VisuallyHidden>{checked ? 'checked' : 'not checked'}</Ariakit.VisuallyHidden>
          )}
        </React.Fragment>
      );
    }

    // If the item is not rendered in a search menu (listbox), we can render it
    // as a MenuItem/MenuItemRadio.
    if (!searchable) {
      if (name != null && value != null) {
        const radioProps = { ...defaultProps, name, value, hideOnClick: true };
        return <Ariakit.MenuItemRadio {...radioProps} />;
      }
      return <Ariakit.MenuItem {...defaultProps} />;
    }

    return (
      <Ariakit.ComboboxItem
        {...defaultProps}
        setValueOnClick={false}
        value={checkable ? value : undefined}
        selectValueOnClick={() => {
          if (name == null || value == null) {
            return false;
          }
          // By default, clicking on a ComboboxItem will update the
          // selectedValue state of the combobox. However, since we're sharing
          // state between combobox and menu, we also need to update the menu's
          // values state.
          menu?.setValue(name, value);
          return true;
        }}
        hideOnClick={(event) => {
          // Make sure that clicking on a combobox item that opens a nested
          // menu/dialog does not close the menu.
          const expandable = event.currentTarget.hasAttribute('aria-expanded');
          if (expandable) {
            return false;
          }
          // By default, clicking on a ComboboxItem only closes its own popover.
          // However, since we're in a menu context, we also close all parent
          // menus.
          menu?.hideAll();
          return true;
        }}
      />
    );
  },
);
