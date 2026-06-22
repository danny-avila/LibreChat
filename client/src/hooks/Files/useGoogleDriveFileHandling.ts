import { useCallback, useState } from 'react';
import { useToastContext } from '@librechat/client';
import { EToolResources } from 'librechat-data-provider';
import type { GoogleDriveFileSummary } from 'librechat-data-provider';
import { useDownloadGoogleDriveFilesMutation } from '~/data-provider';
import type { FileHandlingState } from './useFileHandling';
import useFileHandling, { useFileHandlingNoChatContext } from './useFileHandling';
import { integrationAttachedFilesToFiles } from '~/utils/integrationFiles';

interface UseGoogleDriveFileHandlingProps {
  fileSetter?: unknown;
  toolResource?: string;
  fileFilter?: (file: File) => boolean;
  additionalMetadata?: Record<string, string | undefined>;
  endpointOverride?: string;
  endpointTypeOverride?: string;
}

interface UseGoogleDriveFileHandlingReturn {
  handleGoogleDriveFiles: (files: GoogleDriveFileSummary[]) => Promise<void>;
  isProcessing: boolean;
  error: string | null;
}

function useGoogleDriveDownload({
  onFilesDownloaded,
  onError,
}: {
  onFilesDownloaded?: (files: File[]) => void | Promise<void>;
  onError?: (error: Error) => void;
} = {}) {
  const { showToast } = useToastContext();
  const [error, setError] = useState<string | null>(null);
  const downloadMutation = useDownloadGoogleDriveFilesMutation();

  const downloadGoogleDriveFiles = useCallback(
    async (files: GoogleDriveFileSummary[]): Promise<File[]> => {
      if (!files.length) {
        throw new Error('No files provided for download');
      }

      setError(null);

      try {
        showToast({
          message: `Downloading ${files.length} file(s) from Google Drive...`,
          status: 'info',
          duration: 3000,
        });

        const response = await downloadMutation.mutateAsync(
          files.map((file) => ({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
          })),
        );

        const downloadedFiles = integrationAttachedFilesToFiles(response.files);

        showToast({
          message: `Successfully downloaded ${downloadedFiles.length} file(s) from Google Drive`,
          status: 'success',
          duration: 4000,
        });

        if (onFilesDownloaded) {
          await onFilesDownloaded(downloadedFiles);
        }

        return downloadedFiles;
      } catch (downloadError) {
        const errorMessage =
          downloadError instanceof Error ? downloadError.message : 'Unknown download error';
        setError(errorMessage);

        showToast({
          message: `Google Drive download failed: ${errorMessage}`,
          status: 'error',
          duration: 5000,
        });

        if (onError) {
          onError(downloadError instanceof Error ? downloadError : new Error(errorMessage));
        }

        throw downloadError;
      }
    },
    [downloadMutation, onError, onFilesDownloaded, showToast],
  );

  return {
    downloadGoogleDriveFiles,
    isDownloading: downloadMutation.isLoading,
    error,
  };
}

export default function useGoogleDriveFileHandling(
  props?: UseGoogleDriveFileHandlingProps,
): UseGoogleDriveFileHandlingReturn {
  const { handleFiles } = useFileHandling(props);
  const { downloadGoogleDriveFiles, isDownloading, error } = useGoogleDriveDownload({
    onFilesDownloaded: async (downloadedFiles) => {
      await handleFiles(Array.from(downloadedFiles), props?.toolResource ?? EToolResources.context);
    },
  });

  const handleGoogleDriveFiles = useCallback(
    async (driveFiles: GoogleDriveFileSummary[]) => {
      await downloadGoogleDriveFiles(driveFiles);
    },
    [downloadGoogleDriveFiles],
  );

  return {
    handleGoogleDriveFiles,
    isProcessing: isDownloading,
    error,
  };
}

export function useGoogleDriveFileHandlingNoChatContext(
  props: UseGoogleDriveFileHandlingProps | undefined,
  fileState: FileHandlingState,
): UseGoogleDriveFileHandlingReturn {
  const { handleFiles } = useFileHandlingNoChatContext(props, fileState);
  const { downloadGoogleDriveFiles, isDownloading, error } = useGoogleDriveDownload({
    onFilesDownloaded: async (downloadedFiles) => {
      await handleFiles(Array.from(downloadedFiles), props?.toolResource ?? EToolResources.context);
    },
  });

  const handleGoogleDriveFiles = useCallback(
    async (driveFiles: GoogleDriveFileSummary[]) => {
      await downloadGoogleDriveFiles(driveFiles);
    },
    [downloadGoogleDriveFiles],
  );

  return {
    handleGoogleDriveFiles,
    isProcessing: isDownloading,
    error,
  };
}
