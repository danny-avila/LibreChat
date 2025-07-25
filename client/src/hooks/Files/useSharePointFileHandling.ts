import { useCallback } from 'react';
import useFileHandling from './useFileHandling';
import useSharePointDownload from './useSharePointDownload';
import type { SharePointFile } from '~/data-provider/Files/sharepoint';

interface UseSharePointFileHandlingProps {
  fileSetter?: any;
  fileFilter?: (file: File) => boolean;
  additionalMetadata?: Record<string, string | undefined>;
  overrideEndpoint?: any;
  overrideEndpointFileConfig?: any;
  toolResource?: string;
}

interface UseSharePointFileHandlingReturn {
  handleSharePointFiles: (files: SharePointFile[]) => Promise<void>;
  isProcessing: boolean;
  downloadProgress: any;
  error: string | null;
}

export default function useSharePointFileHandling(
  props?: UseSharePointFileHandlingProps,
): UseSharePointFileHandlingReturn {
  const { handleFiles } = useFileHandling(props);

  const { downloadSharePointFiles, isDownloading, downloadProgress, error } = useSharePointDownload(
    {
      onFilesDownloaded: async (downloadedFiles: File[]) => {
        const fileArray = Array.from(downloadedFiles);
        await handleFiles(fileArray, props?.toolResource);
      },
      onError: (error) => {
        console.error('SharePoint download failed:', error);
      },
    },
  );

  const handleSharePointFiles = useCallback(
    async (sharePointFiles: SharePointFile[]) => {
      try {
        await downloadSharePointFiles(sharePointFiles);
      } catch (error) {
        console.error('SharePoint file handling error:', error);
        throw error;
      }
    },
    [downloadSharePointFiles],
  );

  return {
    handleSharePointFiles,
    isProcessing: isDownloading,
    downloadProgress,
    error,
  };
}
