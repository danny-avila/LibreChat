import type { TMessage } from 'librechat-data-provider';

const even =
  'w-full border-b border-black/10 dark:border-gray-800/50 text-gray-800 bg-white dark:text-gray-200 group dark:bg-gray-800 hover:bg-gray-200/25 hover:text-gray-700  dark:hover:bg-gray-800 dark:hover:text-gray-200';
const odd =
  'w-full border-b border-black/10 bg-gray-50 dark:border-gray-800/50 text-gray-800 dark:text-gray-200 group bg-gray-200 dark:bg-gray-700 hover:bg-gray-200/40 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200';

export function groupIntoList({
  messages,
}: // fileMap,
{
  messages: TMessage[] | null;
  // fileMap?: Record<string, TFile>;
}) {
  if (messages === null) {
    return null;
  }
  return messages.map((m, idx) => ({ ...m, bg: idx % 2 === 0 ? even : odd }));
}
