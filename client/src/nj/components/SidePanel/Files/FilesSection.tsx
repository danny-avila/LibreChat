/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { TFile } from 'librechat-data-provider';
import FileCell from '~/nj/components/SidePanel/Files/FileCell';
import { useState } from 'react';

const TRUNCATE = 10;

export default function FilesSection({
  title,
  files,
  handleFileClick,
  showMoreText,
  emptyText,
  isLastVisibleSection,
}: {
  title: string;
  files: TFile[];
  handleFileClick: (file: TFile) => void;
  showMoreText: string;
  emptyText?: string;
  isLastVisibleSection?: boolean;
}) {
  const [showAll, setShowAll] = useState<boolean>(false);

  const shown = showAll ? files.length : Math.min(files.length, TRUNCATE);
  const total = files.length;
  const showingAll = shown === total;
  const canCollapse = files.length > TRUNCATE;

  const showingText = showingAll ? `Showing ${total}` : `Showing ${shown} of ${total}`;
  const filesToShow = files.slice(0, shown);

  if (files.length === 0 && !emptyText) return null;

  const headingId = `files-section-${title.toLowerCase()}`;
  const listId = `${headingId}-list`;

  return (
    <section aria-labelledby={headingId} className="mb-3 flex flex-col">
      {/* Header */}
      <div className="mb-3 flex w-full justify-between">
        <h2 id={headingId}>
          {title} <span className="sr-only">files</span>
        </h2>
        {shown > 0 && canCollapse && <div className="text-text-secondary">{showingText}</div>}
      </div>

      {/* Files (or empty text if none) */}
      {files.length !== 0 ? (
        <ol id={listId} className="flex flex-col">
          {filesToShow.map((file: TFile) => (
            <li key={file.file_id}>
              <FileCell file={file} onFileClick={handleFileClick} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="pl-2 text-sm">{emptyText}</div>
      )}

      {/* End of files indicator */}
      {isLastVisibleSection && showingAll && (
        <div className="mt-3 w-full text-center text-sm text-text-secondary">
          You&#39;ve reached the end
        </div>
      )}

      {/* Show more / show less toggle */}
      {canCollapse && (
        <button
          className="mb-2 mt-3 font-bold text-jersey-blue underline hover:decoration-2"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll(!showAll)}
        >
          {!showingAll ? showMoreText : 'Show less'}
        </button>
      )}
    </section>
  );
}
