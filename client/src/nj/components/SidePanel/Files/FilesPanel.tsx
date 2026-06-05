/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { useState } from 'react';
import type { TFile } from 'librechat-data-provider';
import icons from '@uswds/uswds/img/sprite.svg';
import { groupFiles } from '~/nj/components/SidePanel/Files/filesLogic';
import FilesSection from '~/nj/components/SidePanel/Files/FilesSection';
import { useRecoilState } from 'recoil';
import { atomWithLocalStorage } from '~/store/utils';
import FilesPanelSplash from '~/nj/components/SidePanel/Files/FilesPanelSplash';

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
  const [showSplashPage, setShowSplashPage] = useRecoilState(
    atomWithLocalStorage('filesPanelSplashPage', true),
  );
  const [filenameFilter, setFilenameFilter] = useState('');

  const filteredFiles = filenameFilter
    ? files.filter((file) => file.filename.toLowerCase().includes(filenameFilter.toLowerCase()))
    : files;

  const groupedFiles = groupFiles(filteredFiles);

  // Used to determine which section should be the "last" section
  const hasTodayFiles = groupedFiles.today.length > 0;
  const hasYesterdayFiles = groupedFiles.yesterday.length > 0;
  const hasPreviousFiles = groupedFiles.previous.length > 0;

  if (showSplashPage) {
    return <FilesPanelSplash setShowSplashPage={setShowSplashPage} />;
  }

  return (
    <div className="flex flex-col gap-4 pt-3">
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

      {/* Pinned */}
      <FilesSection
        title="Pinned"
        files={groupedFiles.pinned}
        handleFileClick={handleFileClick}
        showMoreText="Show more pinned files"
        emptyText="Nothing pinned yet. To pin a file, hover over it and choose pin file from the menu."
        isLastVisibleSection={!hasPreviousFiles && !hasYesterdayFiles && !hasTodayFiles}
      />

      {/* Date-based groups */}
      <FilesSection
        title="Today"
        files={groupedFiles.today}
        handleFileClick={handleFileClick}
        showMoreText="Show more files from today"
        isLastVisibleSection={!hasPreviousFiles && !hasYesterdayFiles}
      />

      <FilesSection
        title="Yesterday"
        files={groupedFiles.yesterday}
        handleFileClick={handleFileClick}
        showMoreText="Show more files from yesterday"
        isLastVisibleSection={!hasPreviousFiles}
      />

      <FilesSection
        title="Previous"
        files={groupedFiles.previous}
        handleFileClick={handleFileClick}
        showMoreText="Show more files"
        isLastVisibleSection={true}
      />
    </div>
  );
}
