/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { useState } from 'react';
import type { TFile } from 'librechat-data-provider';
import FileCell from '~/nj/components/SidePanel/Files/FileCell';
import icons from '@uswds/uswds/img/sprite.svg';

/**
 * Our replacement for the built-in LibreChat files panel.
 *
 * Hooks into functionality from parent built-in files panel via constructor params, but otherwise
 * is pretty much does everything else on its own.
 */
export default function FilesPanel({
  files,
  handleFileClick,
}: {
  files: TFile[];
  handleFileClick: (file: TFile) => void;
}) {
  const [filenameFilter, setFilenameFilter] = useState('');

  const filteredFiles = filenameFilter
    ? files.filter((file) => file.filename.toLowerCase().includes(filenameFilter.toLowerCase()))
    : files;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Saved files</h1>

      {/* "Search files" filter */}
      <div className="relative">
        <svg
          className="usa-icon--size-3 absolute start-2 top-1/2 -translate-y-1/2 text-text-primary"
          aria-hidden="true"
          focusable="false"
        >
          <use href={`${icons}#search`} />
        </svg>
        <input
          type="text"
          placeholder="Search files…"
          value={filenameFilter}
          onChange={(event) => setFilenameFilter(event.target.value)}
          aria-label="Filter files by filename"
          className="w-full rounded-lg border border-border-light bg-white py-2 pl-9 pr-3 text-sm placeholder:text-text-primary focus-visible:outline-none"
        />
      </div>

      {/* Files */}
      {filteredFiles.map((file: TFile) => (
        <button key={file.file_id} onClick={() => handleFileClick(file)}>
          <FileCell file={file} />
        </button>
      ))}
    </div>
  );
}
