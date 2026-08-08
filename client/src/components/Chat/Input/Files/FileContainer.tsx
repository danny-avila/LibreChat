import type { TFile } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { ExtendedFile } from '~/common';
import { getFileType, cn } from '~/utils';
import FilePreview from './FilePreview';
import RemoveFile from './RemoveFile';

const FileContainer = ({
  file,
  overrideType,
  displayName,
  subtitle,
  buttonClassName,
  containerClassName,
  ariaLabel,
  onDelete,
  onClick,
}: {
  file: Partial<ExtendedFile | TFile>;
  overrideType?: string;
  /**
   * Optional pre-computed label for the chip. Callers in code-execution
   * artifact contexts pass the de-suffixed name; upload chips and
   * persisted user files leave this undefined and render the raw filename.
   */
  displayName?: string;
  /**
   * Optional override for the subtitle line (defaults to the file
   * type's localized title — e.g. "PowerPoint Presentation"). Used by
   * the deferred-preview flow to surface "Preparing preview…" /
   * "Preview unavailable" inline within the chip rather than as a
   * loose-feeling annotation below it. Pass a ReactNode so callers
   * can include icons (spinner, alert) alongside the text.
   */
  subtitle?: ReactNode;
  buttonClassName?: string;
  containerClassName?: string;
  /**
   * Overrides the chip's accessible name. Callers that wire `onClick` to
   * something other than "open this file" should say what it does, otherwise
   * the bare filename leaves a screen reader user with no way to tell an
   * interactive chip from an inert one.
   */
  ariaLabel?: string;
  onDelete?: () => void;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) => {
  const fileType = getFileType(overrideType ?? file.type);
  const visibleName = displayName ?? file.filename ?? '';
  const isInteractive = onClick != null;

  return (
    <div
      className={cn('group relative inline-block text-sm text-text-primary', containerClassName)}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? visibleName}
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border-light bg-surface-hover-alt',
          isInteractive &&
            'group/chip cursor-pointer transition-colors hover:border-border-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2',
          buttonClassName,
        )}
      >
        <div className="w-56 p-1.5">
          <div className="flex flex-row items-center gap-2">
            <FilePreview file={file} fileType={fileType} className="relative" />
            <div className="overflow-hidden">
              {/* Underlined on hover and on keyboard focus rather than at rest:
               * every chip variant is clickable, so a permanent underline would
               * mark all of them without telling them apart. */}
              <div
                className={cn(
                  'truncate font-medium decoration-dotted underline-offset-4',
                  isInteractive && 'group-hover/chip:underline group-focus-visible/chip:underline',
                )}
                title={visibleName}
              >
                {visibleName}
              </div>
              {subtitle != null ? (
                subtitle
              ) : (
                <div className="truncate text-text-secondary" title={fileType.title}>
                  {fileType.title}
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
      {onDelete && <RemoveFile onRemove={onDelete} />}
    </div>
  );
};

export default FileContainer;
