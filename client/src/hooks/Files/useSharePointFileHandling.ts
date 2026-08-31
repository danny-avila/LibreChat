import { useCallback } from 'react';
import type { EModelEndpoint } from 'librechat-data-provider';
import type { SharePointFile } from '~/data-provider/Files/sharepoint';
import type { FileHandlingState } from './useFileHandling';
import type { ExtendedFile } from '~/common';
import useFileHandling, { useFileHandlingNoChatContext } from './useFileHandling';
import useSharePointDownload from './useSharePointDownload';

/**
 * Folder contents may only fill the attachment slots the current selection leaves free.
 * Passing the endpoint's whole limit instead would let an expansion download files that
 * the batch validator then rejects wholesale, attaching none of them.
 */
function remainingFileSlots(
  fileLimit: number | undefined,
  files: Map<string, ExtendedFile>,
): number | undefined {
  if (fileLimit == null) {
    return undefined;
  }
  return Math.max(fileLimit - files.size, 0);
}

interface UseSharePointFileHandlingProps {
  fileSetter?: any;
  toolResource?: string;
  fileFilter?: (file: File) => boolean;
  additionalMetadata?: Record<string, string | undefined>;
  endpointOverride?: EModelEndpoint | string;
  endpointTypeOverride?: EModelEndpoint | string;
  /** Endpoint file limit, used to bound how many files a selected folder contributes. */
  maxFiles?: number;
  /** Endpoint per-file size limit, used to skip folder contents that would be rejected. */
  maxFileSize?: number;
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
  const { handleFiles, files } = useFileHandling(props);
  const { downloadSharePointFiles, isDownloading, downloadProgress, error } = useSharePointDownload(
    {
      maxFiles: remainingFileSlots(props?.maxFiles, files),
      maxFileSize: props?.maxFileSize,
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

export function useSharePointFileHandlingNoChatContext(
  props: UseSharePointFileHandlingProps | undefined,
  fileState: FileHandlingState,
): UseSharePointFileHandlingReturn {
  const { handleFiles, files } = useFileHandlingNoChatContext(props, fileState);

  const { downloadSharePointFiles, isDownloading, downloadProgress, error } = useSharePointDownload(
    {
      maxFiles: remainingFileSlots(props?.maxFiles, files),
      maxFileSize: props?.maxFileSize,
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
