import React, { useState, useCallback, useMemo, useRef } from 'react';
import { v4 } from 'uuid';
import { useToastContext } from '@librechat/client';
import { EModelEndpoint, EToolResources, FileSources } from 'librechat-data-provider';
import type { AgentToolResources, TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useUploadFileMutation, useGetFiles } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import { logger } from '~/utils';

interface UsePromptFileHandling {
  fileSetter?: (files: ExtendedFile[]) => void;
  initialFiles?: ExtendedFile[];
  onFileChange?: (updatedFiles: ExtendedFile[]) => void; // Callback when files are added/removed
}

/**
 * Simplified file handling hook for prompts that doesn't depend on ChatContext
 */
export const usePromptFileHandling = (params?: UsePromptFileHandling) => {
  const { showToast } = useToastContext();
  const { user } = useAuthContext();
  const { data: allFiles = [] } = useGetFiles();

  // Create a fileMap for quick lookup
  const fileMap = useMemo(() => {
    const map: Record<string, TFile> = {};
    allFiles.forEach((file) => {
      if (file.file_id) {
        map[file.file_id] = file;
      }
    });
    return map;
  }, [allFiles]);
  const [files, setFiles] = useState<ExtendedFile[]>(() => {
    return params?.initialFiles || [];
  });
  const [filesLoading, setFilesLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const uploadFile = useUploadFileMutation({
    onSuccess: (data) => {
      logger.log('File uploaded successfully', data);

      setFiles((prev) => {
        return prev.map((file) => {
          if (file.temp_file_id === data.temp_file_id) {
            return {
              ...file,
              file_id: data.file_id,
              filepath: data.filepath,
              progress: 1,
              attached: true,
              preview: data.filepath || file.preview, // Use filepath for preview if available
              filename: data.filename || file.filename,
              type: data.type || file.type,
              size: data.bytes || file.size,
              width: data.width || file.width,
              height: data.height || file.height,
              source: data.source || file.source,
            };
          }
          return file;
        });
      });

      setFilesLoading(false);
      showToast({
        message: 'File uploaded successfully',
        status: 'success',
      });

      // Call the onFileChange callback to trigger save with updated files
      const updatedFiles = files.map((file) => {
        if (file.temp_file_id === data.temp_file_id) {
          return {
            ...file,
            file_id: data.file_id,
            filepath: data.filepath,
            progress: 1,
            attached: true,
            preview: data.filepath || file.preview,
            filename: data.filename || file.filename,
            type: data.type || file.type,
            size: data.bytes || file.size,
            width: data.width || file.width,
            height: data.height || file.height,
            source: data.source || file.source,
          };
        }
        return file;
      });
      params?.onFileChange?.(updatedFiles);
    },
    onError: (error, body) => {
      logger.error('File upload error:', error);
      setFilesLoading(false);

      // Remove the failed file from the UI
      const file_id = body.get('file_id');
      if (file_id) {
        setFiles((prev) => {
          return prev.filter((file) => {
            if (file.file_id === file_id || file.temp_file_id === file_id) {
              // Clean up blob URL if it exists
              if (file.preview && file.preview.startsWith('blob:')) {
                URL.revokeObjectURL(file.preview);
              }
              return false; // Remove this file
            }
            return true; // Keep this file
          });
        });
      }

      // Show specific error message
      let errorMessage = 'Failed to upload file';
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      showToast({
        message: errorMessage,
        status: 'error',
      });
    },
  });

  // Files are already an array, no conversion needed
  const promptFiles = files;

  // Call fileSetter when files change
  React.useEffect(() => {
    if (params?.fileSetter) {
      params.fileSetter(files);
    }
  }, [files, params?.fileSetter]);

  // Load image and extract dimensions (like useFileHandling does)
  const loadImage = useCallback(
    (extendedFile: ExtendedFile, preview: string) => {
      const img = new Image();
      img.onload = async () => {
        // Update the file with dimensions
        extendedFile.width = img.width;
        extendedFile.height = img.height;
        extendedFile.progress = 0.6;

        const updatedFile = {
          ...extendedFile,
        };

        setFiles((prev) =>
          prev.map((file) => (file.file_id === extendedFile.file_id ? updatedFile : file)),
        );

        // Create form data for upload
        const formData = new FormData();
        formData.append('endpoint', EModelEndpoint.agents);
        formData.append('file', extendedFile.file!, encodeURIComponent(extendedFile.filename));
        formData.append('file_id', extendedFile.file_id);
        formData.append('message_file', 'true'); // For prompts, treat as message attachment

        // Include dimensions for image recognition
        formData.append('width', img.width.toString());
        formData.append('height', img.height.toString());

        if (extendedFile.tool_resource) {
          formData.append('tool_resource', extendedFile.tool_resource.toString());
        }

        // Upload the file with dimensions
        uploadFile.mutate(formData);
      };
      img.src = preview;
    },
    [uploadFile],
  );

  // Handle file uploads
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>, toolResource?: EToolResources | string) => {
      event.stopPropagation();
      if (!event.target.files) return;

      const fileList = Array.from(event.target.files);
      setFilesLoading(true);

      fileList.forEach(async (file) => {
        const file_id = v4();
        const temp_file_id = file_id; // Use same ID initially, backend will reassign

        // Add file to state immediately with progress indicator
        const extendedFile: ExtendedFile = {
          file_id,
          temp_file_id,
          type: file.type,
          filename: file.name,
          filepath: '',
          progress: 0,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
          size: file.size,
          width: undefined,
          height: undefined,
          attached: false,
          file,
          tool_resource: typeof toolResource === 'string' ? toolResource : undefined,
        };

        setFiles((prev) => [...prev, extendedFile]);

        // For images, load and extract dimensions before upload
        if (file.type.startsWith('image/') && extendedFile.preview) {
          loadImage(extendedFile, extendedFile.preview);
        } else {
          // For non-images, upload immediately
          const formData = new FormData();
          formData.append('endpoint', EModelEndpoint.agents);
          formData.append('file', file, encodeURIComponent(file.name));
          formData.append('file_id', file_id);
          formData.append('message_file', 'true'); // For prompts, treat as message attachment

          if (toolResource) {
            formData.append('tool_resource', toolResource.toString());
          }

          uploadFile.mutate(formData);
        }
      });

      // Reset input
      event.target.value = '';
    },
    [uploadFile, loadImage],
  );

  // Handle file removal
  const handleFileRemove = useCallback(
    (fileId: string) => {
      // For prompts, we only remove the file from the current prompt's tool_resources
      // We don't delete the file from the database to preserve previous versions

      setFiles((prev) => {
        return prev.filter((file) => {
          if (file.file_id === fileId || file.temp_file_id === fileId) {
            // Clean up blob URL if it exists
            if (file.preview && file.preview.startsWith('blob:')) {
              URL.revokeObjectURL(file.preview);
            }
            return false; // Remove this file
          }
          return true; // Keep this file
        });
      });

      // Call the onFileChange callback to trigger prompt version update with updated files
      const updatedFiles = files.filter((file) => {
        if (file.file_id === fileId || file.temp_file_id === fileId) {
          return false; // Remove this file
        }
        return true; // Keep this file
      });
      params?.onFileChange?.(updatedFiles);
    },
    [params?.onFileChange],
  );

  // Sync with external fileSetter when files change
  React.useEffect(() => {
    if (params?.fileSetter) {
      params.fileSetter(promptFiles);
    }
  }, [promptFiles, params?.fileSetter]);

  // Cleanup blob URLs on unmount
  React.useEffect(() => {
    return () => {
      // Clean up all blob URLs when component unmounts
      files.forEach((file) => {
        if (file.preview && file.preview.startsWith('blob:')) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, []);

  /**
   * Convert current files to tool_resources format for API submission
   */
  const getToolResources = useCallback((): AgentToolResources | undefined => {
    if (promptFiles.length === 0) {
      return undefined;
    }

    const toolResources: AgentToolResources = {};

    promptFiles.forEach((file) => {
      if (!file.file_id) return; // Skip files that haven't been uploaded yet

      // Determine tool resource type based on file type or explicit tool_resource
      let toolResource: EToolResources;

      if (file.tool_resource) {
        toolResource = file.tool_resource as EToolResources;
      } else if (file.type?.startsWith('image/')) {
        toolResource = EToolResources.image_edit;
      } else if (file.type === 'application/pdf' || file.type?.includes('text')) {
        toolResource = EToolResources.file_search;
      } else {
        toolResource = EToolResources.file_search; // Default fallback
      }

      // Initialize the tool resource if it doesn't exist
      if (!toolResources[toolResource]) {
        toolResources[toolResource] = { file_ids: [] };
      }

      // Add file_id to the appropriate tool resource
      if (!toolResources[toolResource]!.file_ids!.includes(file.file_id)) {
        toolResources[toolResource]!.file_ids!.push(file.file_id);
      }
    });

    return Object.keys(toolResources).length > 0 ? toolResources : undefined;
  }, [promptFiles]);

  /**
   * Load files from tool_resources format (for editing existing prompts)
   */
  const loadFromToolResources = useCallback(
    async (toolResources?: AgentToolResources) => {
      if (!toolResources) {
        setFiles([]);
        return;
      }

      const filesArray: ExtendedFile[] = [];

      // Process all files and create blob URLs for images
      for (const [toolResource, resource] of Object.entries(toolResources)) {
        if (resource?.file_ids) {
          for (const fileId of resource.file_ids) {
            const dbFile = fileMap[fileId];
            const source =
              toolResource === EToolResources.file_search
                ? FileSources.vectordb
                : (dbFile?.source ?? FileSources.local);

            let file: ExtendedFile;

            if (dbFile) {
              // Use real file metadata from database
              file = {
                file_id: dbFile.file_id,
                temp_file_id: dbFile.file_id,
                type: dbFile.type,
                filename: dbFile.filename,
                filepath: dbFile.filepath,
                progress: 1,
                preview: dbFile.filepath, // Use filepath as preview for existing files
                size: dbFile.bytes || 0,
                width: dbFile.width,
                height: dbFile.height,
                attached: true,
                tool_resource: toolResource,
                metadata: dbFile.metadata,
                source,
              };
            } else {
              // Fallback to placeholder if file not found in database
              file = {
                file_id: fileId,
                temp_file_id: fileId,
                type: 'application/octet-stream',
                filename: `File ${fileId}`,
                filepath: '',
                progress: 1,
                preview: '',
                size: 0,
                width: undefined,
                height: undefined,
                attached: true,
                tool_resource: toolResource,
                source,
              };
            }

            filesArray.push(file);
          }
        }
      }

      setFiles(filesArray);
    },
    [fileMap, user?.id],
  );

  /**
   * Check if all files have been uploaded successfully
   */
  const areFilesReady = useMemo(() => {
    return promptFiles.every((file) => file.file_id && file.progress === 1);
  }, [promptFiles]);

  /**
   * Get count of files by type
   */
  const fileStats = useMemo(() => {
    const stats = {
      total: promptFiles.length,
      images: 0,
      documents: 0,
      uploading: 0,
    };

    promptFiles.forEach((file) => {
      if (file.progress < 1) {
        stats.uploading++;
      } else if (file.type?.startsWith('image/')) {
        stats.images++;
      } else {
        stats.documents++;
      }
    });

    return stats;
  }, [promptFiles]);

  const abortUpload = useCallback(() => {
    if (abortControllerRef.current) {
      logger.log('files', 'Aborting upload');
      abortControllerRef.current.abort('User aborted upload');
      abortControllerRef.current = null;
    }
  }, []);

  return {
    // File handling functions
    handleFileChange,
    abortUpload,

    // File state
    files,
    setFiles,
    promptFiles,

    // Utility functions
    getToolResources,
    loadFromToolResources,
    areFilesReady,
    fileStats,
    handleFileRemove,
  };
};

export default usePromptFileHandling;
