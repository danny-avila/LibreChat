/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { Plus } from 'lucide-react';
import React from 'react';

/**
 * Button to add files to file context / file search.
 *
 * It has a different empty state look.
 */
export default function AddFilesButton({
  hasFiles,
  onClick,
  emptyMessage,
}: {
  hasFiles: boolean;
  onClick: () => void;
  emptyMessage: string;
}) {
  return (
    <>
      {hasFiles ? (
        <button type="button" className="btn btn-neutral" onClick={onClick}>
          <div className="flex w-full items-center gap-1 text-sm font-semibold text-jersey-blue">
            <Plus aria-hidden="true" size={18} />
            Add files
          </div>
        </button>
      ) : (
        <button
          type="button"
          className="flex w-full flex-col items-center justify-center rounded border-2 border-dashed border-border-medium bg-surface-active-alt px-2 py-4"
          onClick={onClick}
        >
          <p className="text-sm font-semibold text-text-primary">Click to upload files here</p>
          <p className="text-xs text-text-secondary">{emptyMessage}</p>
        </button>
      )}
    </>
  );
}
