import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '~/utils/';

type FileUploadProps = {
  onFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  successText?: string;
  invalidText?: string;
  validator?: ((data: any) => boolean) | null;
  text?: string;
  id?: string;
};

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  className = '',
  successText = null,
  invalidText = null,
  validator = null,
  text = null,
  id = '1'
}) => {
  const [statusColor, setStatusColor] = useState<string>('text-gray-600');
  const [status, setStatus] = useState<null | string>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

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

  return (
    <label
      htmlFor={`file-upload-${id}`}
      className={cn(
        'mr-1 flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal transition-colors hover:bg-slate-200 hover:text-green-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500',
        statusColor
      )}
    >
      <FileUp className="mr-1 flex w-[22px] items-center stroke-1" />
      <span className="flex text-xs ">
        {!status ? text || 'Import' : status === 'success' ? successText : invalidText}
      </span>
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
