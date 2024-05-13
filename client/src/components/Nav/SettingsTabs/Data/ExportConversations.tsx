import React, { useState } from 'react';
import { ArrowRightFromLine } from 'lucide-react';
import { useExportConversationsMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';

function ExportConversations() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [errors, setErrors] = useState<string[]>([]);
  const setError = (error: string) => setErrors((prevErrors) => [...prevErrors, error]);

  const exportFile = useExportConversationsMutation({
    onSuccess: (data) => {
      console.log('Exporting started', data);

      showToast({ message: localize('com_ui_export_conversation_success') });

      // Directly initiate download here if `data` contains downloadable content or URL
      downloadConversationsJsonFile(data);
    },
    onError: (error) => {
      console.error('Error: ', error);
      setError(
        (error as { response: { data: { message?: string } } }).response.data.message ??
          'An error occurred while exporting the file.',
      );
      showToast({ message: localize('com_ui_export_conversation_error'), status: 'error' });
    },
  });

  const startExport = () => {
    const formdata = new FormData();
    exportFile.mutate(formdata);
  };

  const downloadConversationsJsonFile = (data) => {
    // Assuming `data` is the downloadable content; adjust as necessary for your use case
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'conversations.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <span>{localize('com_nav_export_all_conversations')}</span>
        <button
          onClick={startExport}
          className="flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal transition-colors hover:bg-gray-100 hover:text-green-700 dark:bg-transparent dark:text-white dark:hover:bg-gray-600 dark:hover:text-green-500"
        >
          <ArrowRightFromLine className="mr-1 flex w-[22px] items-center stroke-1" />
          <span>{localize('com_endpoint_export')}</span>
        </button>
      </div>
    </>
  );
}

export default ExportConversations;
