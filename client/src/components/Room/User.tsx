import { TUser } from 'librechat-data-provider';
import React from 'react';

export default function User({ user }: { user: TUser }) {
  const activeConvo = false;
  // currentConvoId === conversationId ||
  // (isLatestConvo && currentConvoId === 'new' && activeConvos[0] && activeConvos[0] !== 'new');

  const aProps = {
    className:
      'group relative mt-2 flex cursor-pointer items-center gap-2 break-all rounded-lg bg-gray-200 px-2 py-2 active:opacity-50 dark:bg-gray-700',
  };

  if (!activeConvo) {
    aProps.className =
      'group relative grow overflow-hidden whitespace-nowrap rounded-lg active:opacity-50 flex cursor-pointer items-center mt-2 gap-2 break-all rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 py-2 px-2';
  }

  return (
    <a data-testid="convo-item" {...aProps}>
      {user.name}
    </a>
  );
}
