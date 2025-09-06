import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Separator } from '@librechat/client';
import type { ExtendedFile } from '~/common';
import AttachFileButton from '~/components/Prompts/Files/AttachFileButton';
import PromptFile from '~/components/Prompts/PromptFile';
import { useLocalize } from '~/hooks';

const PromptFiles = ({
  files,
  onFilesChange,
  handleFileChange,
  onFileRemove,
  disabled,
}: {
  files: ExtendedFile[];
  onFilesChange?: (files: ExtendedFile[]) => void;
  handleFileChange?: (event: React.ChangeEvent<HTMLInputElement>, toolResource?: string) => void;
  onFileRemove?: (fileId: string) => void;
  disabled?: boolean;
}) => {
  const localize = useLocalize();

  const filesMap = useMemo(() => {
    const map = new Map<string, ExtendedFile>();
    files.forEach((file) => {
      const key = file.file_id || file.temp_file_id || '';
      if (key) {
        map.set(key, file);
      }
    });
    return map;
  }, [files]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-border-light bg-transparent p-4 shadow-md">
      <h3 className="flex items-center gap-2 py-2 text-lg font-semibold text-text-primary">
        <FileText className="icon-sm" aria-hidden="true" />
        {localize('com_ui_files')}
      </h3>
      <div className="flex flex-1 flex-col space-y-4">
        {!files.length && (
          <div className="text-sm text-text-secondary">
            <ReactMarkdown className="markdown prose dark:prose-invert">
              {localize('com_ui_files_info')}
            </ReactMarkdown>
          </div>
        )}

        {files.length > 0 && (
          <div className="mb-3 flex-1">
            <PromptFile
              files={filesMap}
              setFiles={(newMapOrUpdater) => {
                const newMap =
                  typeof newMapOrUpdater === 'function'
                    ? newMapOrUpdater(filesMap)
                    : newMapOrUpdater;
                const newFiles = Array.from(newMap.values()) as ExtendedFile[];
                onFilesChange?.(newFiles);
              }}
              setFilesLoading={() => {}}
              onFileRemove={onFileRemove}
              Wrapper={({ children }) => <div className="flex flex-wrap gap-2">{children}</div>}
            />
          </div>
        )}

        <Separator className="my-3 text-text-primary" />
        <div className="flex flex-col justify-end text-text-secondary">
          <div className="flex justify-start">
            <AttachFileButton handleFileChange={handleFileChange} disabled={disabled} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptFiles;
