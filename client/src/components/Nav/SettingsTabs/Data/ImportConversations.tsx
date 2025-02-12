import { useState, useRef } from 'react';
import { Import } from 'lucide-react';
import type { TError } from 'librechat-data-provider';
import { useUploadConversationsMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function ImportConversations() {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { showToast } = useToastContext();
  const [, setErrors] = useState<string[]>([]);
  const [allowImport, setAllowImport] = useState(true);
  const setError = (error: string) => setErrors((prevErrors) => [...prevErrors, error]);

  const uploadFile = useUploadConversationsMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_import_conversation_success') });
      setAllowImport(true);
    },
    onError: (error) => {
      console.error('Error: ', error);
      setAllowImport(true);
      setError(
        (error as TError).response?.data?.message ?? 'An error occurred while uploading the file.',
      );
      if (error?.toString().includes('Unsupported import type') === true) {
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
    formData.append('file', file, encodeURIComponent(file.name || 'File'));

    uploadFile.mutate(formData);
  };

  const handleFiles = async (_file: File) => {
    try {
      await startUpload(_file);
    } catch (error) {
      console.log('file handling error', error);
      setError('An error occurred while processing the file.');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFiles(file);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleImportClick();
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_ui_import_conversation_info')}</div>
      <button
        onClick={handleImportClick}
        onKeyDown={handleKeyDown}
        disabled={!allowImport}
        aria-label={localize('com_ui_import_conversation')}
        className="btn btn-neutral relative"
      >
        {allowImport ? (
          <Import className="mr-1 flex h-4 w-4 items-center stroke-1" />
        ) : (
          <Spinner className="mr-1 w-4" />
        )}
        <span>{localize('com_ui_import_conversation')}</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className={cn('hidden')}
        accept=".json"
        onChange={handleFileChange}
        aria-hidden="true"
      />
    </div>
  );
}

export default ImportConversations;
