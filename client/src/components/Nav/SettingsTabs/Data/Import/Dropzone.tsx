import { useRef, useState, useEffect, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface DropzoneProps {
  onFile: (file: File) => void;
  isUploading: boolean;
  focusOnMount?: boolean;
}

export default function Dropzone({ onFile, isUploading, focusOnMount = false }: DropzoneProps) {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (focusOnMount) {
      buttonRef.current?.focus();
    }
  }, [focusOnMount]);

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        onFile(file);
      }
      event.target.value = '';
    },
    [onFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        onFile(file);
      }
    },
    [onFile],
  );

  return (
    <div className="flex flex-col gap-3">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        disabled={isUploading}
        className={cn(
          'flex h-[140px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-text-secondary transition-colors',
          isDragging
            ? 'border-border-heavy bg-surface-hover'
            : 'border-border-medium hover:bg-surface-hover',
          isUploading && 'cursor-wait opacity-50',
        )}
      >
        {isUploading ? (
          <>
            <Spinner className="size-8" aria-hidden="true" />
            <span>{localize('com_ui_importing')}</span>
          </>
        ) : (
          <>
            <Upload className="size-8 text-text-secondary" aria-hidden="true" />
            <span>{localize('com_ui_import_drop')}</span>
          </>
        )}
      </button>
      <p className="text-center text-xs text-text-secondary">{localize('com_ui_import_sources')}</p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.zip"
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
