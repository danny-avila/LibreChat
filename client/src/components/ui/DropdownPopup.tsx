import React from 'react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';

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
          <Transition
            show={open}
            enter="transition-opacity duration-150"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => setIsOpen(false)}
          >
            <div className={`${isOpen ? 'visible' : 'invisible'}`}>
              {open && (
                <MenuItems
                  static
                  // @ts-ignore
                  anchor={anchor}
                  className="mt-2 overflow-hidden rounded-lg bg-header-primary p-1.5 shadow-lg outline-none"
                >
                  <div>
                    {items
                      .filter((item) => item.show !== false)
                      .map((item, index) =>
                        item.separate ? (
                          <div key={index} className="my-1 h-px bg-white/10" />
                        ) : (
                          <MenuItem key={index}>
                            <button
                              onClick={item.onClick}
                              className="group flex w-full gap-2 rounded-lg p-2.5 text-sm text-text-primary transition-colors duration-200 data-[focus]:bg-surface-hover"
                              disabled={item.disabled}
                            >
                              {item.icon && (
                                <span className="mr-2 h-5 w-5" aria-hidden="true">
                                  {item.icon}
                                </span>
                              )}
                              {item.label}
                              {item.kbd && (
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
            </div>
          </Transition>
        </>
      )}
    </Menu>
  );
};

export default DropdownPopup;
