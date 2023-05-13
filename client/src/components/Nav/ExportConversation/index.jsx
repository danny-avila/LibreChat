import React, { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Download } from 'lucide-react';
import { cn } from '~/utils/';

import ExportModel from './ExportModel';

import store from '~/store';

export default function ExportConversation({ onClick }) {
  const [open, setOpen] = useState(false);

  const conversation = useRecoilValue(store.conversation) || {};

  const exportable =
    conversation?.conversationId &&
    conversation?.conversationId !== 'new' &&
    conversation?.conversationId !== 'search';

  const clickHandler = (e) => {
    if (onClick) onClick(e);
    if (exportable) setOpen(true);
  };

  return (
    <>
      <button
        className={cn(
          'flex py-3 px-3 items-center gap-3 transition-colors duration-200 text-white cursor-pointer text-sm hover:bg-gray-700 w-full',
          exportable ? 'cursor-pointer text-white' : 'cursor-not-allowed text-gray-400'
        )}
        onClick={clickHandler}
      >
        <Download size={16} />
        Export conversation
      </button>

      <ExportModel
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
