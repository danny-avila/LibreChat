import React, { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Download } from 'lucide-react';
import { cn } from '~/utils/';

import ExportModel from './ExportModel';

import store from '~/store';

export default function ExportConversation() {
  const [open, setOpen] = useState(false);

  const conversation = useRecoilValue(store.conversation) || {};

  const exportable =
    conversation?.conversationId &&
    conversation?.conversationId !== 'new' &&
    conversation?.conversationId !== 'search';

  const clickHandler = () => {
    if (exportable) setOpen(true);
  };

  return (
    <>
      <button
        className={cn(
          'flex items-center gap-3 rounded-md py-3 px-3 text-sm transition-colors duration-200 hover:bg-gray-500/10',
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
