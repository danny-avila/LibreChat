import React from 'react';
import { ToggleContext } from './ToggleContext';
import { cn } from '~/utils';

const HoverToggle = ({
  children,
  isActiveConvo,
  isPopoverActive,
  setIsPopoverActive,
  className = 'absolute bottom-0 right-0 top-0',
}: {
  children: React.ReactNode;
  isActiveConvo: boolean;
  isPopoverActive: boolean;
  setIsPopoverActive: (isActive: boolean) => void;
  className?: string;
}) => {
  const setPopoverActive = (value: boolean) => setIsPopoverActive(value);
  return (
    <ToggleContext.Provider value={{ isPopoverActive, setPopoverActive }}>
      <div
        className={cn(
          'peer items-center gap-1.5 rounded-r-lg from-gray-500 from-gray-900 pl-2 pr-2 dark:text-white',
          isPopoverActive || isActiveConvo ? 'flex' : 'hidden group-hover:flex',
          isActiveConvo
            ? 'from-gray-50 from-85% to-transparent group-hover:bg-gradient-to-l group-hover:from-gray-200 dark:from-gray-800 dark:group-hover:from-gray-800'
            : 'z-50 from-gray-200 from-gray-50 from-0% to-transparent hover:bg-gradient-to-l hover:from-gray-200 dark:from-gray-750 dark:from-gray-800 dark:hover:from-gray-800',
          isPopoverActive && !isActiveConvo ? 'from-gray-50 dark:from-gray-800' : '',
          className,
        )}
      >
        {children}
      </div>
    </ToggleContext.Provider>
  );
};

export default HoverToggle;
