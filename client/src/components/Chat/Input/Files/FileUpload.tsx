import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '~/utils/';
import { useLocalize } from '~/hooks';

type FileUploadProps = {
  onFileSelected: (jsonData: Record<string, unknown>) => void;
  className?: string;
  containerClassName?: string;
  successText?: string;
  invalidText?: string;
  validator?: ((data: Record<string, unknown>) => boolean) | null;
  text?: string;
  id?: string;
};

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  className = '',
  containerClassName = '',
  successText = null,
  invalidText = null,
  validator = null,
  text = null,
  id = '1',
}) => {
  const [statusColor, setStatusColor] = useState<string>('text-gray-600');
  const [status, setStatus] = useState<null | string>(null);
  const localize = useLocalize();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const jsonData = JSON.parse(e.target?.result as string);
      if (validator && !validator(jsonData)) {
        setStatus('invalid');
        setStatusColor('text-red-600');
        return;
      }

      if (validator) {
        setStatus('success');
        setStatusColor('text-green-500 dark:text-green-500');
      }

      onFileSelected(jsonData);
    };
    reader.readAsText(file);
  };

  let statusText: string;
  if (!status) {
    statusText = text ?? localize('com_endpoint_import');
  } else if (status === 'success') {
    statusText = successText ?? localize('com_ui_upload_success');
  } else {
    statusText = invalidText ?? localize('com_ui_upload_invalid');
  }

  return (
    <label
      htmlFor={`file-upload-${id}`}
      className={cn(
        'mr-1 flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-normal transition-colors hover:bg-gray-100 hover:text-green-600 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-green-500',
        statusColor,
        containerClassName,
      )}
    >
      <FileUp className="mr-1 flex w-[22px] items-center stroke-1" />
      <span className="flex text-xs ">{statusText}</span>
      <input
        id={`file-upload-${id}`}
        value=""
        type="file"
        className={cn('hidden ', className)}
        accept=".json"
        onChange={handleFileChange}
      />
    </label>
  );
};

export default FileUpload;
