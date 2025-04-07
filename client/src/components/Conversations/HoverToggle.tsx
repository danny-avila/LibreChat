import React from 'react';
import { cn } from '~/utils';
import { ToggleContext } from './ToggleContext';

const HoverToggle = ({
  children,
  isActiveConvo,
  isPopoverActive,
  setIsPopoverActive,
  className = 'absolute bottom-0 right-0 top-0',
  onClick,
}: {
  children: React.ReactNode;
  isActiveConvo: boolean;
  isPopoverActive: boolean;
  setIsPopoverActive: (isActive: boolean) => void;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) => {
  const setPopoverActive = (value: boolean) => setIsPopoverActive(value);
  return (
    <ToggleContext.Provider value={{ isPopoverActive, setPopoverActive }}>
      <div
        onClick={onClick}
        className={cn(
          'peer items-center gap-1.5 rounded-r-lg from-gray-900 pl-2 pr-2 dark:text-white',
          isPopoverActive || isActiveConvo ? 'flex' : 'hidden group-hover:flex',
          isActiveConvo
            ? 'from-gray-50 from-85% to-transparent group-hover:bg-beigetertiary hover:dark:bg-darkbeige800 group-hover:from-gray-200 dark:from-gray-800 dark:group-hover:from-gray-800'
            : 'z-50 from-gray-50 from-0% to-transparent hover:bg-beigetertiary hover:dark:bg-darkbeige800 group-hover:from-gray-200 dark:from-gray-800 dark:group-hover:from-gray-800',
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
