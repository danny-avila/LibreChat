/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { useEffect, useState } from 'react';
import type { TFile } from 'librechat-data-provider';
import icons from '@uswds/uswds/img/sprite.svg';
import { useUpdateFileMutation } from '~/nj/data-provider/file-mutations';
import RenameForm from '~/components/Conversations/RenameForm';
import { useLocalize } from '~/hooks';
import { cn, logger } from '~/utils';
import FileOptions from './FileOptions';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '@librechat/client';
import FileIcon from '~/nj/components/SidePanel/Files/FileIcon';

/**
 * Displays a file in `FilesPanel`.
 */
export default function FileCell({
  file,
  onFileClick,
}: {
  file: TFile;
  onFileClick: (file: TFile) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateMutation = useUpdateFileMutation({
    onSuccess: () => {
      setRenaming(false);
    },
    onError: (err) => {
      logger.error('Error renaming file', err);
      showToast({
        message: 'Failed to rename file',
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [filenameInput, setFilenameInput] = useState(file.filename);

  useEffect(() => {
    setFilenameInput(file.filename);
  }, [file.filename]);

  const handleRenameSubmit = (newName: string) => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== file.filename) {
      updateMutation.mutate({ file_id: file.file_id, filename: trimmed });
    } else {
      setRenaming(false);
    }
  };

  const handleRenameCancel = () => {
    setFilenameInput(file.filename);
    setRenaming(false);
  };

  return (
    <button
      className="group flex w-full items-center gap-3 rounded p-2 hover:bg-surface-active-alt"
      onClick={() => {
        if (!isPopoverActive && !renaming) {
          onFileClick(file);
        }
      }}
      aria-label={`Add ${file.pinned ? 'pinned' : ''} file "${file.filename}" to current conversation`}
    >
      <FileIcon file={file} />
      {renaming ? (
        <div className="relative h-10 min-w-0 flex-1">
          <RenameForm
            titleInput={filenameInput}
            setTitleInput={setFilenameInput}
            onSubmit={handleRenameSubmit}
            onCancel={handleRenameCancel}
            localize={localize}
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-start text-sm font-medium">{file.filename}</span>
          <span className="text-token-text-secondary text-start text-xs">
            {formatDate(file.createdAt)}
          </span>
        </div>
      )}
      <div className="ml-auto flex items-center">
        {file.pinned && (
          <svg
            className="usa-icon usa-icon--size-3 text-jersey-blue"
            aria-hidden="true"
            focusable="false"
          >
            <use href={`${icons}#push_pin`} />
          </svg>
        )}
        <div
          className={cn(
            'flex',
            !isPopoverActive &&
              'pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
          )}
        >
          <FileOptions
            file={file}
            isPopoverActive={isPopoverActive}
            setIsPopoverActive={setIsPopoverActive}
            onRename={() => setRenaming(true)}
          />
        </div>
      </div>
    </button>
  );
}

function formatDate(date?: string | Date): string {
  if (!date) return '';

  const actualDate = new Date(date);
  const dateOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  if (actualDate.getFullYear() !== new Date().getFullYear()) {
    dateOptions.year = 'numeric';
  }

  return actualDate.toLocaleDateString('en-US', dateOptions);
}
