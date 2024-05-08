import React, { useState } from 'react';
import { ToggleContext } from './ToggleContext';
import { cn } from '~/utils';

const HoverToggle = ({
  children,
  isActiveConvo,
  isPopoverActive,
  setIsPopoverActive,
}: {
  children: React.ReactNode;
  isActiveConvo: boolean;
  isPopoverActive: boolean;
  setIsPopoverActive: (isActive: boolean) => void;
}) => {
  const setPopoverActive = (value: boolean) => setIsPopoverActive(value);
  return (
    <ToggleContext.Provider value={{ setPopoverActive }}>
      <div
        className={cn(
          'peer absolute bottom-0 right-0 top-0 items-center gap-1.5 rounded-r-lg from-gray-900 pl-2 pr-2 text-gray-500 dark:text-gray-300',
          'from-gray-50 from-85% to-transparent group-hover:bg-gradient-to-l group-hover:from-gray-200 dark:from-gray-750 dark:group-hover:from-gray-750',
          isPopoverActive || isActiveConvo ? 'flex' : 'hidden group-hover:flex',
          isPopoverActive && !isActiveConvo ? 'bg-gray-50 dark:bg-gray-750' : '',
        )}
      >
        {children}
      </div>
    </ToggleContext.Provider>
  );
};

export default HoverToggle;
