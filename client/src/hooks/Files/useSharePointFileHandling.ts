import { useCallback, useMemo } from 'react';
import { inferMimeType } from 'librechat-data-provider';
import type { EModelEndpoint, EndpointFileConfig } from 'librechat-data-provider';
import type { SharePointFile, SharePointSkipReason } from '~/data-provider/Files/sharepoint';
import type { FileHandlingState } from './useFileHandling';
import type { ExtendedFile } from '~/common';
import useFileHandling, { useFileHandlingNoChatContext } from './useFileHandling';
import { getFileSignature, getFileSizeLimit } from '~/utils/files';
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

/**
 * Screens folder contents with the same rules `partitionUploads` applies after download,
 * so a duplicate or oversized file neither consumes an attachment slot nor costs a
 * download only to be discarded. Uses the shared helpers rather than restating the rules.
 */
function createFolderScreen(
  endpointFileConfig: EndpointFileConfig | undefined,
  files: Map<string, ExtendedFile>,
): ((file: SharePointFile) => SharePointSkipReason | null) | undefined {
  if (!endpointFileConfig) {
    return undefined;
  }

  const sizeLimit = getFileSizeLimit(endpointFileConfig);
  const signatures = new Set(
    Array.from(files.values()).map((file) =>
      getFileSignature(file.file?.name ?? file.filename, file.size, file.type),
    ),
  );

  return (candidate) => {
    const type = inferMimeType(candidate.name, '');
    if (signatures.has(getFileSignature(candidate.name, candidate.size, type))) {
      return 'duplicate';
    }
    if (sizeLimit != null && candidate.size >= sizeLimit) {
      return 'size';
    }
    return null;
  };
}

interface UseSharePointFileHandlingProps {
  fileSetter?: any;
  toolResource?: string;
  fileFilter?: (file: File) => boolean;
  additionalMetadata?: Record<string, string | undefined>;
  endpointOverride?: EModelEndpoint | string;
  endpointTypeOverride?: EModelEndpoint | string;
  /** Governs how many folder contents may be attached and which of them are worth downloading. */
  endpointFileConfig?: EndpointFileConfig;
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
  const screenFile = useMemo(
    () => createFolderScreen(props?.endpointFileConfig, files),
    [props?.endpointFileConfig, files],
  );

  const { downloadSharePointFiles, isDownloading, downloadProgress, error } = useSharePointDownload(
    {
      maxFiles: remainingFileSlots(props?.endpointFileConfig?.fileLimit, files),
      screenFile,
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
  const screenFile = useMemo(
    () => createFolderScreen(props?.endpointFileConfig, files),
    [props?.endpointFileConfig, files],
  );

  const { downloadSharePointFiles, isDownloading, downloadProgress, error } = useSharePointDownload(
    {
      maxFiles: remainingFileSlots(props?.endpointFileConfig?.fileLimit, files),
      screenFile,
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
