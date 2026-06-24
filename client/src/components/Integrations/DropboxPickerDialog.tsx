import React, { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@librechat/client';
import type { GoogleDriveFileSummary } from 'librechat-data-provider';
import { useDropboxFilesQuery } from '~/data-provider';
import { useDebounce, useLocalize } from '~/hooks';
import { IntegrationPickerDialogShell } from './IntegrationPickerDialogShell';
import { isIntegrationReconnectApiError } from '~/utils/integrationReconnect';

interface DropboxPickerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onFilesSelected: (files: GoogleDriveFileSummary[]) => void;
  isAttaching?: boolean;
  maxSelectionCount?: number;
  onReconnect?: () => void;
}

export function DropboxPickerDialog({
  isOpen,
  onOpenChange,
  onFilesSelected,
  isAttaching = false,
  maxSelectionCount,
  onReconnect,
}: DropboxPickerDialogProps) {
  const localize = useLocalize();
  const [search, setSearch] = useState('');
  const [pageToken, setPageToken] = useState<string | undefined>();
  const [accumulatedFiles, setAccumulatedFiles] = useState<GoogleDriveFileSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setPageToken(undefined);
      setAccumulatedFiles([]);
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  const { data, isLoading, isFetching, isError, error } = useDropboxFilesQuery({
    query: debouncedSearch || undefined,
    pageToken,
    pageSize: 20,
    enabled: isOpen,
  });

  useEffect(() => {
    if (!data?.files) {
      return;
    }

    setAccumulatedFiles((current) => {
      if (!pageToken) {
        return data.files;
      }
      const existingIds = new Set(current.map((file) => file.id));
      const merged = [...current];
      for (const file of data.files) {
        if (!existingIds.has(file.id)) {
          merged.push(file);
        }
      }
      return merged;
    });
  }, [data?.files, pageToken]);

  const files = useMemo(
    () => (pageToken ? accumulatedFiles : (data?.files ?? [])),
    [pageToken, accumulatedFiles, data?.files],
  );
  const selectedFiles = useMemo(
    () => files.filter((file) => selectedIds.has(file.id)),
    [files, selectedIds],
  );

  const toggleSelection = (fileId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleAttach = () => {
    if (selectedFiles.length === 0) {
      return;
    }
    onFilesSelected(selectedFiles);
  };

  const showReconnectError = isError && isIntegrationReconnectApiError(error);

  return (
    <IntegrationPickerDialogShell
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      titleKey="com_integrations_dropbox_picker_title"
      searchPlaceholderKey="com_integrations_dropbox_picker_search"
      searchValue={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPageToken(undefined);
        setAccumulatedFiles([]);
      }}
      isLoading={isLoading || (isFetching && files.length === 0)}
      isAttaching={isAttaching}
      isError={showReconnectError}
      onReconnect={onReconnect}
      selectedCount={selectedIds.size}
      maxSelectionCount={maxSelectionCount}
      onAttach={handleAttach}
      hasMore={Boolean(data?.nextPageToken)}
      onLoadMore={() => setPageToken(data?.nextPageToken)}
    >
      {files.length === 0 ? (
        <p className="p-4 text-sm text-text-secondary">
          {localize('com_integrations_picker_empty')}
        </p>
      ) : (
        <ul className="divide-token-border-light divide-y">
          {files.map((file) => (
            <li key={file.id}>
              <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-surface-hover">
                <Checkbox
                  checked={selectedIds.has(file.id)}
                  onCheckedChange={() => toggleSelection(file.id)}
                  aria-label={file.name}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {file.name}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">
                    {file.mimeType}
                    {file.modifiedTime ? ` · ${file.modifiedTime}` : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </IntegrationPickerDialogShell>
  );
}
