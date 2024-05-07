import React, { useState } from 'react';
import { ToggleContext } from './ToggleContext';
import { cn } from '~/utils';

const HoverToggle = ({
  children,
  isActiveConvo,
}: {
  children: React.ReactNode;
  isActiveConvo: boolean;
}) => {
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const setPopoverActive = (value: boolean) => setIsPopoverActive(value);
  return (
    <ToggleContext.Provider value={{ setPopoverActive }}>
      <div
        className={cn(
          'peer absolute bottom-0 right-0 top-0 items-center gap-1.5 rounded-r-lg from-gray-900 pl-2 pr-2 text-gray-500 dark:text-gray-300',
          isPopoverActive || isActiveConvo ? 'flex' : 'hidden group-hover:flex',
          isActiveConvo
            ? 'from-gray-50 from-85% to-transparent group-hover:bg-gradient-to-l group-hover:from-gray-200 dark:from-gray-750 dark:group-hover:from-gray-750'
            : 'z-50 bg-gray-200 from-gray-50 from-0% to-transparent hover:bg-gray-200 hover:bg-gradient-to-l dark:bg-gray-800 dark:from-gray-750 dark:hover:bg-gray-800',
          isPopoverActive && !isActiveConvo ? 'bg-gray-50 dark:bg-gray-750' : '',
        )}
      >
        {children}
      </div>
    </ToggleContext.Provider>
  );
};

export default HoverToggle;
