import { useEffect } from 'react';
import { X } from 'lucide-react';
import { EToolResources } from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogClose,
  OGDialogContent,
  OGDialogTitle,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { ExtendedFile } from '~/common';
import { useDeleteFilesMutation } from '~/data-provider';
import { logger, getCachedPreview } from '~/utils';
import { useFileDeletion } from '~/hooks/Files';
import FileContainer from './FileContainer';
import { useLocalize } from '~/hooks';
import Image from './Image';

/**
 * Shared wrapper with a stable module-scope identity. Passing an inline arrow as
 * `Wrapper` makes it a new component type on every render, so React remounts the
 * whole row and any focused control inside it loses focus.
 */
export const FileRowWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap gap-2">{children}</div>
);

export default function FileRow({
  files: _files,
  setFiles,
  abortUpload,
  setFilesLoading,
  assistant_id,
  agent_id,
  tool_resource,
  fileFilter,
  isRTL = false,
  Wrapper,
  visibleFileLimit,
}: {
  files: Map<string, ExtendedFile> | undefined;
  abortUpload?: (fileId?: string) => void;
  setFiles: React.Dispatch<React.SetStateAction<Map<string, ExtendedFile>>>;
  setFilesLoading?: React.Dispatch<React.SetStateAction<boolean>>;
  fileFilter?: (file: ExtendedFile) => boolean;
  assistant_id?: string;
  agent_id?: string;
  tool_resource?: EToolResources;
  isRTL?: boolean;
  Wrapper?: React.FC<{ children: React.ReactNode }>;
  visibleFileLimit?: number;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const files = Array.from(_files?.values() ?? []).filter((file) =>
    fileFilter ? fileFilter(file) : true,
  );
  const fileIds = new Set<string>();
  const uniqueFiles = files.filter((file) => {
    if (fileIds.has(file.file_id)) {
      return false;
    }
    fileIds.add(file.file_id);
    return true;
  });
  const hasValidFileLimit = visibleFileLimit != null && visibleFileLimit > 0;
  const shouldShowAll = !hasValidFileLimit || uniqueFiles.length <= visibleFileLimit + 1;
  const appliedFileLimit = shouldShowAll ? uniqueFiles.length : visibleFileLimit;
  const visibleFiles = uniqueFiles.slice(0, appliedFileLimit);
  const remainingFileCount = uniqueFiles.length - visibleFiles.length;

  const { mutateAsync } = useDeleteFilesMutation({
    onMutate: async () =>
      logger.log(
        'agents',
        'Deleting files: agent_id, assistant_id, tool_resource',
        agent_id,
        assistant_id,
        tool_resource,
      ),
    onSuccess: () => {
      console.log('Files deleted');
    },
    onError: (error) => {
      console.log('Error deleting files:', error);
    },
  });

  const { deleteFile } = useFileDeletion({ mutateAsync, agent_id, assistant_id, tool_resource });

  useEffect(() => {
    if (!setFilesLoading) return;
    if (files.length === 0) {
      setFilesLoading(false);
      return;
    }

    if (files.some((file) => file.progress < 1)) {
      setFilesLoading(true);
      return;
    }

    if (files.every((file) => file.progress === 1)) {
      setFilesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  if (files.length === 0) {
    return null;
  }

  const renderFile = (file: ExtendedFile) => {
    const handleDelete = () => {
      if (abortUpload && file.progress < 1) {
        abortUpload(file.file_id);
      }
      if (file.progress >= 1 && !file.attached) {
        showToast({
          message: localize('com_ui_deleting_file'),
          status: 'info',
        });
      }
      deleteFile({ file, setFiles });
    };
    const isImage = file.type?.startsWith('image') ?? false;

    return (
      <div
        key={file.file_id}
        style={{
          flexBasis: '70px',
          flexGrow: 0,
          flexShrink: 0,
        }}
      >
        {isImage ? (
          <Image
            url={getCachedPreview(file.file_id) ?? file.preview ?? file.filepath}
            onDelete={handleDelete}
            progress={file.progress}
            source={file.source}
          />
        ) : (
          <FileContainer file={file} onDelete={handleDelete} />
        )}
      </div>
    );
  };

  const renderFiles = (filesToRender: ExtendedFile[], showMore = false) => {
    const rowStyle = isRTL
      ? {
          display: 'flex',
          flexDirection: 'row-reverse',
          flexWrap: 'wrap',
          gap: '4px',
          width: '100%',
          maxWidth: '100%',
        }
      : {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          width: '100%',
          maxWidth: '100%',
        };

    return (
      <div style={rowStyle as React.CSSProperties}>
        {filesToRender.map(renderFile)}
        {showMore && (
          <div
            style={{
              flexBasis: '70px',
              flexGrow: 0,
              flexShrink: 0,
            }}
          >
            <OGDialogTrigger className="h-[52px] w-56 rounded-2xl border border-border-light bg-surface-hover-alt px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary">
              {localize('com_sources_more_files', { count: remainingFileCount })}
            </OGDialogTrigger>
          </div>
        )}
      </div>
    );
  };

  const content =
    remainingFileCount > 0 ? (
      <OGDialog>
        {renderFiles(visibleFiles, true)}
        <OGDialogContent
          showCloseButton={false}
          className="flex max-h-[80vh] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg bg-surface-dialog p-0 sm:max-w-[600px]"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface-dialog px-3 py-2">
            <OGDialogTitle className="text-base font-medium">
              {localize('com_sources_agent_files')}
            </OGDialogTitle>
            <OGDialogClose
              className="rounded-full p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              aria-label={localize('com_ui_close')}
            >
              <X className="size-4" aria-hidden="true" />
            </OGDialogClose>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">{renderFiles(uniqueFiles)}</div>
        </OGDialogContent>
      </OGDialog>
    ) : (
      renderFiles(uniqueFiles)
    );

  if (Wrapper) {
    return <Wrapper>{content}</Wrapper>;
  }

  return content;
}
