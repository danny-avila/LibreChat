import React from 'react';
import { X, FileText, Image, Upload } from 'lucide-react';
import type { ExtendedFile } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface PromptFileRowProps {
  files: ExtendedFile[];
  onRemoveFile: (fileId: string) => void;
  isReadOnly?: boolean;
  className?: string;
}

const PromptFileRow: React.FC<PromptFileRowProps> = ({
  files,
  onRemoveFile,
  isReadOnly = false,
  className = '',
}) => {
  const localize = useLocalize();

  if (files.length === 0) {
    return null;
  }

  const getFileIcon = (file: ExtendedFile) => {
    if (file.type?.startsWith('image/')) {
      return <Image className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const getFileStatus = (file: ExtendedFile) => {
    if (file.progress < 1) {
      return (
        <div className="flex items-center gap-1 text-xs text-blue-600">
          <Upload className="h-3 w-3 animate-pulse" />
          {Math.round(file.progress * 100)}%
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {files.map((file) => (
        <div
          key={file.temp_file_id || file.file_id}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
            'border-border-medium bg-surface-secondary',
            file.progress < 1 && 'opacity-70',
          )}
        >
          <div className="flex items-center gap-2">
            {getFileIcon(file)}
            <span className="max-w-32 truncate" title={file.filename}>
              {file.filename}
            </span>
          </div>
          
          {getFileStatus(file)}
          
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => onRemoveFile(file.temp_file_id || file.file_id || '')}
              className={cn(
                'ml-1 flex h-5 w-5 items-center justify-center rounded-full',
                'hover:bg-surface-hover text-text-secondary hover:text-text-primary',
                'transition-colors duration-200',
              )}
              title={localize('com_ui_remove_file')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default PromptFileRow;

