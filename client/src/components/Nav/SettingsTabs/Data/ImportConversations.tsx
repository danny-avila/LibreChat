import { useState } from 'react';
import { Import } from 'lucide-react';
import type { TError } from 'librechat-data-provider';
import { useUploadConversationsMutation } from '~/data-provider';
import { useLocalize, useConversations } from '~/hooks';
import { useToastContext } from '~/Providers';
import { Spinner } from '~/components/svg';
import { cn } from '~/utils';

function ImportConversations() {
  const localize = useLocalize();

  const { showToast } = useToastContext();
  const [, setErrors] = useState<string[]>([]);
  const [allowImport, setAllowImport] = useState(true);
  const setError = (error: string) => setErrors((prevErrors) => [...prevErrors, error]);
  const { refreshConversations } = useConversations();

  const uploadFile = useUploadConversationsMutation({
    onSuccess: () => {
      refreshConversations();
      showToast({ message: localize('com_ui_import_conversation_success') });
      setAllowImport(true);
    },
    onError: (error) => {
      console.error('Error: ', error);
      setAllowImport(true);
      setError(
        (error as TError)?.response?.data?.message ?? 'An error occurred while uploading the file.',
      );
      if (error?.toString().includes('Unsupported import type')) {
        showToast({
          message: localize('com_ui_import_conversation_file_type_error'),
          status: 'error',
        });
      } else {
        showToast({ message: localize('com_ui_import_conversation_error'), status: 'error' });
      }
    },
    onMutate: () => {
      setAllowImport(false);
    },
  });

  const startUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file, encodeURIComponent(file?.name || 'File'));

    uploadFile.mutate(formData);
  };

  const handleFiles = async (_file: File) => {
    /* Process files */
    try {
      await startUpload(_file);
    } catch (error) {
      console.log('file handling error', error);
      setError('An error occurred while processing the file.');
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      handleFiles(file);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <span>{localize('com_ui_import_conversation_info')}</span>
      <label
        htmlFor={'import-conversations-file'}
        className="flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-3 text-xs font-medium transition-colors hover:bg-gray-100 hover:text-green-700 dark:bg-transparent dark:text-white dark:hover:bg-gray-600 dark:hover:text-green-500"
      >
        {allowImport ? (
          <Import className="mr-1 flex h-4 w-4 items-center stroke-1" />
        ) : (
          <Spinner className="mr-1 w-4" />
        )}
        <span>{localize('com_ui_import_conversation')}</span>
        <input
          id={'import-conversations-file'}
          disabled={!allowImport}
          value=""
          type="file"
          className={cn('hidden')}
          accept=".json"
          onChange={handleFileChange}
        />
      </label>
    </div>
  );
}

export default ImportConversations;
