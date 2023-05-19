import React from 'react';

export default function Footer() {
  return (
    <div className="hidden px-3 pb-1 pt-2 text-center text-xs text-black/50 dark:text-white/50 md:block md:px-4 md:pb-4 md:pt-3">
      <a
        href="https://github.com/danny-avila/chatgpt-clone"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {import.meta.env.VITE_APP_TITLE || 'ChatGPT Clone'}
      </a>
      . Serves and searches all conversations reliably. All AI convos under one house. Pay per call
      and not per month (cents compared to dollars).
    </div>
  );
}
