import { useCallback, useMemo } from 'react';
import { inferMimeType } from 'librechat-data-provider';
import type { EModelEndpoint, EndpointFileConfig } from 'librechat-data-provider';
import type { SharePointFile, SharePointSkipReason } from '~/data-provider/Files/sharepoint';
import type { FileHandlingState } from './useFileHandling';
import type { ExtendedFile } from '~/common';
import useFileHandling, { useFileHandlingNoChatContext } from './useFileHandling';
import useSharePointDownload from './useSharePointDownload';
import { getFileSignature } from '~/utils/files';

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
 * Remaining aggregate byte budget, so an expansion stops at the point the batch would
 * be rejected outright rather than downloading everything and attaching none of it.
 */
function remainingTotalBytes(
  totalSizeLimit: number | undefined,
  files: Map<string, ExtendedFile>,
): number | undefined {
  if (totalSizeLimit == null || totalSizeLimit <= 0) {
    return undefined;
  }
  return Math.max(totalSizeLimit - attachedBytes(files), 0);
}

/** Bytes already committed by the current selection, which the aggregate cap must respect. */
function attachedBytes(files: Map<string, ExtendedFile>): number {
  let total = 0;
  for (const file of files.values()) {
    total += file.size;
  }
  return total;
}

/**
 * Builds a screen for one walk that drops what the uploader would reclaim anyway: a
 * pick already present in the current selection, by the same signature
 * `partitionUploads` uses. Signatures accumulate as candidates are accepted, matching
 * the within-selection duplicate rule, and are discarded with the screen.
 *
 * Size deliberately stays out of it. The uploader defers size checks until after HEIC
 * conversion and resizing, so a file's Graph metadata cannot say whether it will be
 * accepted; judging it here skips files the pipeline would have taken. The aggregate
 * cap is handled by truncating the walk instead, which is reported rather than silent.
 */
function createFolderScreenFactory(
  endpointFileConfig: EndpointFileConfig | undefined,
  files: Map<string, ExtendedFile>,
): (() => (file: SharePointFile) => SharePointSkipReason | null) | undefined {
  if (!endpointFileConfig) {
    return undefined;
  }

  return () => {
    const signatures = new Set(
      Array.from(files.values()).map((file) =>
        getFileSignature(file.file?.name ?? file.filename, file.size, file.type),
      ),
    );

    return (candidate) => {
      const signature = getFileSignature(
        candidate.name,
        candidate.size,
        inferMimeType(candidate.name, ''),
      );
      if (signatures.has(signature)) {
        return 'duplicate';
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
      maxTotalBytes: remainingTotalBytes(props?.endpointFileConfig?.totalSizeLimit, files),
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
      maxTotalBytes: remainingTotalBytes(props?.endpointFileConfig?.totalSizeLimit, files),
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
