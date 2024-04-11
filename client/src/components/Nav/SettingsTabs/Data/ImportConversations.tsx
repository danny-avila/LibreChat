import { useLocalize, useImportFileHandling } from '~/hooks';
import { Import } from 'lucide-react';
import { cn } from '~/utils';
import { useToastContext } from '~/Providers';
import React, { useState, useCallback, useRef } from 'react';

function ImportConversations() {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const fileInputRef = useRef(null);
  const uploadFile = useImportFileHandling();

  const handleFileChange = (event) => {
    console.log('file change');
    const file = event.target.files[0];
    if (file) {
      // const formData = new FormData();
      // formData.append('file', file);

      console.log('call handleFiles');
      uploadFile.handleFiles(file);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <span>{localize('com_ui_import_conversation_info')}</span>
        <label
          htmlFor={'import-conversations-file'}
          className="flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal transition-colors hover:bg-gray-100 hover:text-green-700 dark:bg-transparent dark:text-white dark:hover:bg-gray-600 dark:hover:text-green-500"
        >
          <Import className="mr-1 flex w-[22px] items-center stroke-1" />
          <span>{localize('com_ui_import_conversation')}</span>
          <input
            id={'import-conversations-file'}
            value=""
            type="file"
            className={cn('hidden')}
            accept=".json"
            onChange={handleFileChange}
          />
        </label>
      </div>
    </>
  );
}

export default ImportConversations;
