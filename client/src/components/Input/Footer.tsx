import React from 'react';
import { useGetStartupConfig } from 'librechat-data-provider';

export default function Footer() {
  const { data: config } = useGetStartupConfig();

  return (
    <div className="hidden px-3 pb-1 pt-2 text-center text-xs text-black/50 dark:text-white/50 md:block md:px-4 md:pb-4 md:pt-3">
      <a
        href="https://github.com/danny-avila/LibreChat"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {config?.appTitle || 'LibreChat'} v0.5.5
      </a>
      {' - '}. All AI conversations in one place. Pay per call and not per month.
    </div>
  );
}
