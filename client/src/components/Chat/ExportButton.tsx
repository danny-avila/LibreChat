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
      <button
        onClick={clickHandler}
        className="group m-1.5 flex w-full cursor-pointer items-center gap-2 rounded p-2.5 text-sm hover:bg-gray-200 focus-visible:bg-gray-200 focus-visible:outline-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-gray-600 dark:focus-visible:bg-gray-600"
      >
        <Upload size={16} /> {localize('com_nav_export')}
      </button>
      {showExports && (
        <ExportModal open={showExports} onOpenChange={onOpenChange} conversation={conversation} />
      )}
    </>
  );
}

export default ExportButton;
