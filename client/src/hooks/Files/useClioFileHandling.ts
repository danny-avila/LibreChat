import { useCallback, useState } from 'react';
import { useToastContext } from '@librechat/client';
import { EToolResources } from 'librechat-data-provider';
import type { GoogleDriveFileSummary } from 'librechat-data-provider';
import { useDownloadClioDocumentsMutation } from '~/data-provider';
import type { FileHandlingState } from './useFileHandling';
import useFileHandling, { useFileHandlingNoChatContext } from './useFileHandling';
import { integrationAttachedFilesToFiles } from '~/utils/integrationFiles';

interface UseClioFileHandlingProps {
  fileSetter?: unknown;
  toolResource?: string;
  fileFilter?: (file: File) => boolean;
  additionalMetadata?: Record<string, string | undefined>;
  endpointOverride?: string;
  endpointTypeOverride?: string;
}

interface UseClioFileHandlingReturn {
  handleClioFiles: (files: GoogleDriveFileSummary[]) => Promise<void>;
  isProcessing: boolean;
  error: string | null;
}

function useClioDownload({
  onFilesDownloaded,
  onError,
}: {
  onFilesDownloaded?: (files: File[]) => void | Promise<void>;
  onError?: (error: Error) => void;
} = {}) {
  const { showToast } = useToastContext();
  const [error, setError] = useState<string | null>(null);
  const downloadMutation = useDownloadClioDocumentsMutation();

  const downloadClioDocuments = useCallback(
    async (files: GoogleDriveFileSummary[]): Promise<File[]> => {
      if (!files.length) {
        throw new Error('No files provided for download');
      }

      setError(null);

      try {
        showToast({
          message: `Downloading ${files.length} document(s) from Clio...`,
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
          message: `Successfully downloaded ${downloadedFiles.length} document(s) from Clio`,
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
          message: `Clio download failed: ${errorMessage}`,
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
    downloadClioDocuments,
    isDownloading: downloadMutation.isLoading,
    error,
  };
}

export default function useClioFileHandling(
  props?: UseClioFileHandlingProps,
): UseClioFileHandlingReturn {
  const { handleFiles } = useFileHandling(props);
  const { downloadClioDocuments, isDownloading, error } = useClioDownload({
    onFilesDownloaded: async (downloadedFiles) => {
      await handleFiles(Array.from(downloadedFiles), props?.toolResource ?? EToolResources.context);
    },
  });

  const handleClioFiles = useCallback(
    async (clioFiles: GoogleDriveFileSummary[]) => {
      await downloadClioDocuments(clioFiles);
    },
    [downloadClioDocuments],
  );

  return {
    handleClioFiles,
    isProcessing: isDownloading,
    error,
  };
}

export function useClioFileHandlingNoChatContext(
  props: UseClioFileHandlingProps | undefined,
  fileState: FileHandlingState,
): UseClioFileHandlingReturn {
  const { handleFiles } = useFileHandlingNoChatContext(props, fileState);
  const { downloadClioDocuments, isDownloading, error } = useClioDownload({
    onFilesDownloaded: async (downloadedFiles) => {
      await handleFiles(Array.from(downloadedFiles), props?.toolResource ?? EToolResources.context);
    },
  });

  const handleClioFiles = useCallback(
    async (clioFiles: GoogleDriveFileSummary[]) => {
      await downloadClioDocuments(clioFiles);
    },
    [downloadClioDocuments],
  );

  return {
    handleClioFiles,
    isProcessing: isDownloading,
    error,
  };
}
