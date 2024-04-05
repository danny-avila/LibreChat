import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { cn } from '~/utils';
import { SettingsTabValues } from 'librechat-data-provider/dist/types';
import { useMediaQuery } from '~/hooks';

export default function SettingsTab({
  value,
  children,
}: {
  value: SettingsTabValues;
  children: React.ReactNode;
}) {
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

  return (
    <Tabs.Trigger
      className={cn(
        'group m-1 flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm text-black outline-none radix-state-active:bg-white radix-state-active:text-black dark:text-white dark:radix-state-active:bg-gray-750',
        isSmallScreen
          ? 'flex-1 flex-col items-center justify-center text-sm dark:text-gray-500 dark:radix-state-active:text-white'
          : 'bg-white radix-state-active:bg-gray-200',
        isSmallScreen ? '' : 'dark:bg-gray-800',
      )}
      value={value}
      style={{ userSelect: 'none' }}
    >
      {children}
    </Tabs.Trigger>
  );
}
