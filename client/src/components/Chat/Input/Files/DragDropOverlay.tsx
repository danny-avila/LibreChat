import { memo } from 'react';
import { CloudUpload, FileImage, FileText, File as FileIcon } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { formatFileSize, getDragDropFileIcon, type DragDropFileIcon } from './dragDropUi';

interface DragDropOverlayProps {
  isActive: boolean;
  previewFiles: File[];
}

const FILE_ICON: Record<DragDropFileIcon, typeof FileIcon> = {
  image: FileImage,
  document: FileText,
  generic: FileIcon,
};

const DragDropOverlay = memo(({ isActive, previewFiles }: DragDropOverlayProps) => {
  const localize = useLocalize();
  const preview = previewFiles.slice(0, 4);
  const extraCount = Math.max(0, previewFiles.length - preview.length);

  return (
    <>
      <div
        aria-hidden={!isActive}
        className={cn(
          'pointer-events-none fixed inset-0 z-[9998] transition-all duration-200 ease-out',
          isActive ? 'visible opacity-100 backdrop-blur-[2px]' : 'invisible opacity-0',
        )}
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          willChange: 'opacity',
        }}
      />
      <div
        role="presentation"
        aria-hidden={!isActive}
        className={cn(
          'pointer-events-none fixed inset-3 z-[9999] flex items-center justify-center transition-all duration-200 ease-out sm:inset-5',
          isActive ? 'visible scale-100 opacity-100' : 'invisible scale-[0.98] opacity-0',
        )}
        style={{ willChange: 'opacity, transform' }}
      >
        <div
          className={cn(
            'absolute inset-0 rounded-2xl border-2 border-dashed transition-colors duration-200',
            isActive
              ? 'bg-surface-primary/20 border-border-heavy shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
              : 'border-transparent',
          )}
        />
        <div
          className="relative flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-border-light bg-surface-primary px-8 py-8 shadow-2xl transition-transform duration-200"
          style={{
            transform: isActive ? 'translateY(0)' : 'translateY(-8px)',
          }}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary ring-4 ring-border-light">
            <CloudUpload className="h-8 w-8 text-text-primary" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-lg font-semibold text-text-primary">
              {localize('com_ui_upload_files')}
            </h3>
            <p className="max-w-sm text-sm text-text-secondary">{localize('com_ui_drag_drop')}</p>
            <p className="text-xs font-medium text-text-tertiary">
              {localize('com_ui_drag_drop_release')}
            </p>
          </div>
          {preview.length > 0 && (
            <div className="flex w-full flex-col gap-2">
              <p className="text-center text-xs font-medium text-text-secondary">
                {localize(
                  previewFiles.length === 1
                    ? 'com_ui_drag_drop_file_count'
                    : 'com_ui_drag_drop_file_count_plural',
                  { count: previewFiles.length },
                )}
              </p>
              <ul className="flex max-h-28 flex-col gap-1.5 overflow-y-auto">
                {preview.map((file) => {
                  const iconKey = getDragDropFileIcon(file.name, file.type);
                  const Icon = FILE_ICON[iconKey];
                  return (
                    <li
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-left"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                        {file.name}
                      </span>
                      <span className="shrink-0 text-xs text-text-tertiary">
                        {formatFileSize(file.size)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {extraCount > 0 && (
                <p className="text-center text-xs text-text-tertiary">
                  {localize('com_ui_drag_drop_more_files', { count: extraCount })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
});

DragDropOverlay.displayName = 'DragDropOverlay';

export default DragDropOverlay;
