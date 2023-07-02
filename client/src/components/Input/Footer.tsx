import React from 'react';
import { useGetStartupConfig } from '~/data-provider';

export default function Footer() {
  const { data: config } = useGetStartupConfig();
  return (
    <div className="hidden px-3 pb-1 pt-2 text-center text-xs text-black/50 dark:text-white/50 md:block md:px-4 md:pb-4 md:pt-3">
      {config?.appTitle || 'AITok Chat'}
    </div>
  );
}
