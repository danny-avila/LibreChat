import React from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';

interface DropdownProps {
  trigger: React.ReactNode;
  items: {
    label?: string;
    onClick?: () => void;
    icon?: React.ReactNode;
    kbd?: string;
    show?: boolean;
    disabled?: boolean;
    separate?: boolean;
  }[];
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  className?: string;
  anchor?: string;
}

const DropdownPopup: React.FC<DropdownProps> = ({
  trigger,
  items,
  isOpen,
  setIsOpen,
  className,
  anchor = { x: 'bottom', y: 'start' },
}) => {
  const handleButtonClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <Menu>
      {({ open }) => (
        <>
          <MenuButton
            onClick={handleButtonClick}
            className={`inline-flex items-center gap-2 rounded-md ${className}`}
          >
            {trigger}
          </MenuButton>
          {open && (
            <MenuItems
              static
              transition
              // @ts-ignore
              anchor={anchor}
              className="z-10 mt-2 origin-top-right rounded-xl border border-black/5 bg-white/80 p-1 text-sm/6 text-black transition duration-200 ease-out [--anchor-gap:var(--spacing-1)] focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-white/5 dark:bg-gray-800/80 dark:text-white"
            >
              <div>
                {items
                  .filter((item) => item.show !== false)
                  .map((item, index) =>
                    item.separate ?? false ? (
                      <div key={index} className="my-1 h-px bg-white/10" />
                    ) : (
                      <MenuItem key={index}>
                        <button
                          onClick={item.onClick}
                          className="group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 data-[focus]:bg-black/10 dark:data-[focus]:bg-white/10"
                          disabled={item.disabled}
                        >
                          {typeof item.icon !== 'undefined' && (
                            <span className="mr-2 h-5 w-5" aria-hidden="true">
                              {item.icon}
                            </span>
                          )}
                          {item.label}
                          {typeof item.kbd !== 'undefined' && (
                            <kbd className="ml-auto hidden font-sans text-xs text-black/50 group-data-[focus]:inline dark:text-white/50">
                              ⌘{item.kbd}
                            </kbd>
                          )}
                        </button>
                      </MenuItem>
                    ),
                  )}
              </div>
            </MenuItems>
          )}
        </>
      )}
    </Menu>
  );
};

export default DropdownPopup;
