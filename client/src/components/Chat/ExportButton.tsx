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
                  className="h-10 rounded-lg px-2.5 text-token-text-secondary focus-visible:outline-0 hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:bg-token-main-surface-secondary"
                  onClick={clickHandler}
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    <Download size={24} />
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
