import React from 'react';

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { TConversation } from 'librechat-data-provider';
import { Download } from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { ExportModal } from '../Nav';
import { useRecoilValue } from 'recoil';
import store from '~/store';

function ExportButton() {
  const localize = useLocalize();
  const location = useLocation();

  const [showExports, setShowExports] = useState(false);

  const activeConvo = useRecoilValue(store.conversationByIndex(0));
  const globalConvo = useRecoilValue(store.conversation) ?? ({} as TConversation);

  let conversation: TConversation | null | undefined;
  if (location.state?.from?.pathname.includes('/chat')) {
    conversation = globalConvo;
  } else {
    conversation = activeConvo;
  }

  const clickHandler = () => {
    if (exportable) {
      setShowExports(true);
    }
  };

  const exportable =
    conversation &&
    conversation.conversationId &&
    conversation.conversationId !== 'new' &&
    conversation.conversationId !== 'search';

  return (
    <>
      {exportable && (
        <div className="flex gap-1 gap-2 pr-1">
          <TooltipProvider delayDuration={50}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="btn btn-neutral btn-small relative flex h-9 w-9 items-center justify-center whitespace-nowrap rounded-lg"
                  onClick={clickHandler}
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    <Download size={16} />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {localize('com_nav_export_conversation')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      {showExports && (
        <ExportModal open={showExports} onOpenChange={setShowExports} conversation={conversation} />
      )}
    </>
  );
}

export default ExportButton;
