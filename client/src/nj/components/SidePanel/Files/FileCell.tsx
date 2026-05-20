import { useState } from 'react';
import type { TFile } from 'librechat-data-provider';
import icons from '@uswds/uswds/img/sprite.svg';
import { cn } from '~/utils';
import FileOptions from './FileOptions';

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
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  return (
    <button
      className="group flex w-full items-center gap-3 rounded p-2 hover:bg-surface-active-alt"
      onClick={() => !isPopoverActive && onFileClick(file)}
    >
      {/* TODO: Dynamic icon based on mimetype */}
      <div className="h-10 w-10 flex-shrink-0 rounded bg-gray-200" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-start text-sm font-medium">{file.filename}</span>
        <span className="text-token-text-secondary text-start text-xs">
          {formatDate(file.createdAt)}
        </span>
      </div>
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
