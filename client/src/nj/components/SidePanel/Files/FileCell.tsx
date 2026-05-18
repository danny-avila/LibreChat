import type { TFile } from 'librechat-data-provider';

/**
 * Displays a file in `FilesPanel`.
 */
export default function FileCell({ file }: { file: TFile }) {
  return (
    <div className="flex gap-3">
      {/* TODO: Dynamic icon based on mimetype */}
      <div className="h-10 w-10 flex-shrink-0 rounded bg-gray-200" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-start text-sm font-medium">{file.filename}</span>
        <span className="text-token-text-secondary text-start text-xs">
          {formatDate(file.createdAt)}
        </span>
      </div>
    </div>
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
