import React from 'react';

import { useState } from 'react';
import type { TConversation } from 'librechat-data-provider';
import { Upload } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { ExportModal } from '../Nav';

function ExportButton({
  conversation,
  setPopoverActive,
}: {
  conversation: TConversation;
  setPopoverActive: (value: boolean) => void;
}) {
  const localize = useLocalize();

  const [showExports, setShowExports] = useState(false);

  const clickHandler = () => {
    setShowExports(true);
  };

  const onOpenChange = (value: boolean) => {
    setShowExports(value);
    setPopoverActive(value);
  };

  return (
    <>
      {exportable && (
        <div className="flex gap-1 gap-2 pr-1">
          <TooltipProvider delayDuration={50}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-10 rounded-lg px-2.5 text-token-text-secondary focus-visible:outline-0 hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:bg-gray-100 dark:focus-visible:bg-gray-700"
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
        <ExportModal open={showExports} onOpenChange={onOpenChange} conversation={conversation} />
      )}
    </>
  );
}

export default ExportButton;
