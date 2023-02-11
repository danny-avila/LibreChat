import React from 'react';

export default function Footer() {
  return (
    <div className="px-3 pt-2 pb-3 text-center text-xs text-black/50 dark:text-white/50 md:px-4 md:pt-3 md:pb-6">
      <a
        href="https://github.com/danny-avila/rpp2210-mvp"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        ChatGPT Clone
      </a>
      . Serves and searches all conversations reliably. All AI convos under one house. Pay per
      call and not per month (cents compared to dollars).
    </div>
  );
}
