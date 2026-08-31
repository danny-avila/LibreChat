import { useCallback, useState } from 'react';
import { useToastContext } from '@librechat/client';
import type {
  SharePointSkipReason,
  SharePointBatchProgress,
  SharePointFile,
} from '~/data-provider/Files';
import { useSharePointBatchDownload, expandSharePointFolders } from '~/data-provider/Files';
import useSharePointToken from './useSharePointToken';
import useLocalize from '~/hooks/useLocalize';

interface UseSharePointDownloadProps {
  onFilesDownloaded?: (files: File[]) => void | Promise<void>;
  onError?: (error: Error) => void;
  /** Remaining attachment slots, so folder contents cannot overrun the endpoint's file limit. */
  maxFiles?: number;
  /** Remaining aggregate byte budget, so an expansion stops where the batch would be rejected. */
  maxTotalBytes?: number;
  /** Builds a per-walk screen applying the uploader's rules to folder contents. */
  createScreen?: () => (file: SharePointFile) => SharePointSkipReason | null;
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
  maxTotalBytes,
  createScreen,
}: UseSharePointDownloadProps = {}): UseSharePointDownloadReturn {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [downloadProgress, setDownloadProgress] = useState<SharePointBatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Token acquisition and folder expansion both run before the download mutation starts,
   * so they need their own flag or the picker shows no busy state during them. */
  const [isPreparing, setIsPreparing] = useState(false);

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
      setIsPreparing(true);
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

          const expansion = await expandSharePointFolders({
            items: files,
            accessToken,
            maxFiles,
            maxTotalBytes,
            createScreen,
          });
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

          if (expansion.skippedFiles.length > 0) {
            showToast({
              message: localize('com_files_sharepoint_folders_duplicate', {
                0: expansion.skippedFiles.length,
              }),
              status: 'warning',
              duration: 5000,
            });
          }

          const emptyResultMessage = {
            fileLimit: 'com_files_sharepoint_folder_no_room',
            sizeLimit: 'com_files_sharepoint_folder_no_room',
            requestBudget: 'com_files_sharepoint_folder_too_deep_empty',
          } as const;
          if (filesToDownload.length === 0) {
            throw new Error(
              localize(
                expansion.truncatedBy == null
                  ? 'com_files_sharepoint_folders_empty'
                  : emptyResultMessage[expansion.truncatedBy],
              ),
            );
          }

          const truncationMessage = {
            fileLimit: 'com_files_sharepoint_folder_limit',
            sizeLimit: 'com_files_sharepoint_folder_too_large',
            requestBudget: 'com_files_sharepoint_folder_too_deep',
          } as const;
          if (expansion.truncatedBy != null) {
            showToast({
              message: localize(truncationMessage[expansion.truncatedBy], {
                0: filesToDownload.length,
              }),
              status: 'warning',
              duration: 5000,
            });
          }

          setDownloadProgress({ completed: 0, total: filesToDownload.length, failed: [] });
        }

        setIsPreparing(false);
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
      } finally {
        setIsPreparing(false);
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
      maxTotalBytes,
      createScreen,
    ],
  );

  return {
    downloadSharePointFiles,
    isDownloading: isPreparing || batchDownloadMutation.isLoading,
    downloadProgress,
    error,
  };
}
