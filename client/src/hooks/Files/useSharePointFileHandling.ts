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
 * the batch validator then rejects wholesale, attaching none of them. A non-positive
 * limit means no cap, matching `validateFileLimit`.
 */
function remainingFileSlots(
  fileLimit: number | undefined,
  files: Map<string, ExtendedFile>,
): number | undefined {
  if (fileLimit == null || fileLimit <= 0) {
    return undefined;
  }
  return Math.max(fileLimit - files.size, 0);
}

/**
 * Builds a screen for one folder walk, applying the rules `partitionUploads` applies
 * after download so a duplicate or oversized file neither consumes an attachment slot
 * nor costs a download only to be discarded. State is per-walk: signatures accumulate
 * as candidates are accepted, matching the within-selection duplicate rule, and are
 * discarded with the screen rather than carrying into the next selection.
 *
 * Images are exempt from the size check. The upload pipeline defers it until after HEIC
 * conversion and resizing, so an image over the limit in Graph's metadata may still be
 * accepted once shrunk — final-size validation stays authoritative.
 */
function createFolderScreenFactory(
  endpointFileConfig: EndpointFileConfig | undefined,
  files: Map<string, ExtendedFile>,
): (() => (file: SharePointFile) => SharePointSkipReason | null) | undefined {
  if (!endpointFileConfig) {
    return undefined;
  }

  const sizeLimit = getFileSizeLimit(endpointFileConfig);

  return () => {
    const signatures = new Set(
      Array.from(files.values()).map((file) =>
        getFileSignature(file.file?.name ?? file.filename, file.size, file.type),
      ),
    );

    return (candidate) => {
      const type = inferMimeType(candidate.name, '');
      const signature = getFileSignature(candidate.name, candidate.size, type);
      if (signatures.has(signature)) {
        return 'duplicate';
      }
      if (sizeLimit != null && candidate.size >= sizeLimit && !type.startsWith('image/')) {
        return 'size';
      }
      signatures.add(signature);
      return null;
    };
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
  const createScreen = useMemo(
    () => createFolderScreenFactory(props?.endpointFileConfig, files),
    [props?.endpointFileConfig, files],
  );

  const { downloadSharePointFiles, isDownloading, downloadProgress, error } = useSharePointDownload(
    {
      maxFiles: remainingFileSlots(props?.endpointFileConfig?.fileLimit, files),
      createScreen,
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
  const createScreen = useMemo(
    () => createFolderScreenFactory(props?.endpointFileConfig, files),
    [props?.endpointFileConfig, files],
  );

  const { downloadSharePointFiles, isDownloading, downloadProgress, error } = useSharePointDownload(
    {
      maxFiles: remainingFileSlots(props?.endpointFileConfig?.fileLimit, files),
      createScreen,
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
