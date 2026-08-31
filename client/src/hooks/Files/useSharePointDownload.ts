import { useCallback, useState } from 'react';
import { useToastContext } from '@librechat/client';
import type { SharePointFile, SharePointBatchProgress } from '~/data-provider/Files';
import { useSharePointBatchDownload, expandSharePointFolders } from '~/data-provider/Files';
import useSharePointToken from './useSharePointToken';
import useLocalize from '~/hooks/useLocalize';

interface UseSharePointDownloadProps {
  onFilesDownloaded?: (files: File[]) => void | Promise<void>;
  onError?: (error: Error) => void;
  /** Upper bound on files pulled out of selected folders; the endpoint's file limit. */
  maxFiles?: number;
}

interface UseSharePointDownloadReturn {
  downloadSharePointFiles: (files: SharePointFile[]) => Promise<File[]>;
  isDownloading: boolean;
  downloadProgress: SharePointBatchProgress | null;
  error: string | null;
}

export default function useSharePointDownload({
  onFilesDownloaded,
  onError,
  maxFiles,
}: UseSharePointDownloadProps = {}): UseSharePointDownloadReturn {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [downloadProgress, setDownloadProgress] = useState<SharePointBatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { token, refetch: refetchToken } = useSharePointToken({
    enabled: false,
    purpose: 'Download',
  });

  const batchDownloadMutation = useSharePointBatchDownload();

  const downloadSharePointFiles = useCallback(
    async (files: SharePointFile[]): Promise<File[]> => {
      if (!files || files.length === 0) {
        throw new Error('No files provided for download');
      }

      setError(null);
      setDownloadProgress({ completed: 0, total: files.length, failed: [] });

      try {
        let accessToken = token?.access_token;
        if (!accessToken) {
          showToast({
            message: 'Getting SharePoint access token...',
            status: 'info',
            duration: 2000,
          });

          const tokenResult = await refetchToken();
          accessToken = tokenResult.data?.access_token;

          if (!accessToken) {
            throw new Error('Failed to obtain SharePoint access token');
          }
        }

        let filesToDownload = files;
        if (files.some((file) => file.isFolder === true)) {
          showToast({
            message: localize('com_files_sharepoint_expanding_folders'),
            status: 'info',
            duration: 2000,
          });

          const expansion = await expandSharePointFolders({ items: files, accessToken, maxFiles });
          filesToDownload = expansion.files;

          if (expansion.unreadableFolders.length > 0) {
            showToast({
              message: localize('com_files_sharepoint_folders_unreadable', {
                0: expansion.unreadableFolders.join(', '),
              }),
              status: 'warning',
              duration: 5000,
            });
          }

          if (expansion.truncated) {
            showToast({
              message: localize('com_files_sharepoint_folder_limit', {
                0: filesToDownload.length,
              }),
              status: 'warning',
              duration: 5000,
            });
          }

          if (filesToDownload.length === 0) {
            throw new Error(localize('com_files_sharepoint_folders_empty'));
          }

          setDownloadProgress({ completed: 0, total: filesToDownload.length, failed: [] });
        }

        showToast({
          message: `Downloading ${filesToDownload.length} file(s) from SharePoint...`,
          status: 'info',
          duration: 3000,
        });

        const downloadedFiles = await batchDownloadMutation.mutateAsync({
          files: filesToDownload,
          accessToken,
          onProgress: (progress) => {
            setDownloadProgress(progress);

            if (filesToDownload.length > 5 && progress.completed % 3 === 0) {
              showToast({
                message: `Downloaded ${progress.completed}/${progress.total} files...`,
                status: 'info',
                duration: 1000,
              });
            }
          },
        });

        if (downloadedFiles.length > 0) {
          const failedCount = filesToDownload.length - downloadedFiles.length;
          const successMessage =
            failedCount > 0
              ? `Downloaded ${downloadedFiles.length}/${filesToDownload.length} files from SharePoint (${failedCount} failed)`
              : `Successfully downloaded ${downloadedFiles.length} file(s) from SharePoint`;

          showToast({
            message: successMessage,
            status: failedCount > 0 ? 'warning' : 'success',
            duration: 4000,
          });

          if (onFilesDownloaded) {
            await onFilesDownloaded(downloadedFiles);
          }
        }

        setDownloadProgress(null);
        return downloadedFiles;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown download error';
        setError(errorMessage);

        showToast({
          message: `SharePoint download failed: ${errorMessage}`,
          status: 'error',
          duration: 5000,
        });

        if (onError) {
          onError(error instanceof Error ? error : new Error(errorMessage));
        }

        setDownloadProgress(null);
        throw error;
      }
    },
    [
      token,
      showToast,
      batchDownloadMutation,
      onFilesDownloaded,
      onError,
      refetchToken,
      localize,
      maxFiles,
    ],
  );

  return {
    downloadSharePointFiles,
    isDownloading: batchDownloadMutation.isLoading,
    downloadProgress,
    error,
  };
}
