import React from 'react';
import getAppTitle from '~/utils/getAppTitle';
import { useGetStartupConfig } from '@librechat/data-provider';

export default function Footer() {
  const { data: config } = useGetStartupConfig();
  const appTitle = getAppTitle(config);

  return (
    <div className="hidden px-3 pb-1 pt-2 text-center text-xs text-black/50 dark:text-white/50 md:block md:px-4 md:pb-4 md:pt-3">
      {appTitle}. Serves and searches all conversations reliably. All AI convos under one house.
    </div>
  );
}
