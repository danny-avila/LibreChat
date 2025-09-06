import { v4 } from 'uuid';
import { useToastContext } from '@librechat/client';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { EModelEndpoint, EToolResources, FileSources } from 'librechat-data-provider';
import type { AgentToolResources, TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useUploadFileMutation, useGetFiles } from '~/data-provider';
import { logger } from '~/utils';

interface UsePromptFileHandling {
  fileSetter?: (files: ExtendedFile[]) => void;
  initialFiles?: ExtendedFile[];
  onFileChange?: (updatedFiles: ExtendedFile[]) => void; // Callback when files are added/removed
}

export const usePromptFileHandling = (params?: UsePromptFileHandling) => {
  const { showToast } = useToastContext();
  const { data: allFiles = [] } = useGetFiles();

  const fileMap = useMemo(() => {
    const map: Record<string, TFile> = {};
    if (Array.isArray(allFiles)) {
      allFiles.forEach((file) => {
        if (file.file_id) {
          map[file.file_id] = file;
        }
      });
    }
    return map;
  }, [allFiles]);
  const [files, setFiles] = useState<ExtendedFile[]>(() => {
    return params?.initialFiles || [];
  });
  const [, setFilesLoading] = useState(false);
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

      const file_id = body.get('file_id');
      if (file_id) {
        setFiles((prev) => {
          return prev.filter((file) => {
            if (file.file_id === file_id || file.temp_file_id === file_id) {
              if (file.preview && file.preview.startsWith('blob:')) {
                URL.revokeObjectURL(file.preview);
              }
              return false;
            }
            return true;
          });
        });
      }

      let errorMessage = 'Failed to upload file';
      if ((error as any)?.response?.data?.message) {
        errorMessage = (error as any).response.data.message;
      } else if ((error as any)?.message) {
        errorMessage = (error as any).message;
      }

      showToast({
        message: errorMessage,
        status: 'error',
      });
    },
  });

  const promptFiles = files;

  useEffect(() => {
    if (params?.fileSetter) {
      params.fileSetter(files);
    }
  }, [files, params]);

  const loadImage = useCallback(
    (extendedFile: ExtendedFile, preview: string) => {
      const img = new Image();
      img.onload = async () => {
        extendedFile.width = img.width;
        extendedFile.height = img.height;
        extendedFile.progress = 0.6;

        const updatedFile = {
          ...extendedFile,
        };

        setFiles((prev) =>
          prev.map((file) => (file.file_id === extendedFile.file_id ? updatedFile : file)),
        );

        const formData = new FormData();
        formData.append('endpoint', EModelEndpoint.agents);
        formData.append(
          'file',
          extendedFile.file!,
          encodeURIComponent(extendedFile.filename || ''),
        );
        formData.append('file_id', extendedFile.file_id);
        formData.append('message_file', 'true'); // For prompts, treat as message attachment

        formData.append('width', img.width.toString());
        formData.append('height', img.height.toString());

        if (extendedFile.tool_resource) {
          formData.append('tool_resource', extendedFile.tool_resource.toString());
        }

        uploadFile.mutate(formData);
      };
      img.src = preview;
    },
    [uploadFile],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>, toolResource?: EToolResources | string) => {
      event.stopPropagation();
      if (!event.target.files) return;

      const fileList = Array.from(event.target.files);
      setFilesLoading(true);

      fileList.forEach(async (file) => {
        const file_id = v4();
        const temp_file_id = file_id;

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

        if (file.type.startsWith('image/') && extendedFile.preview) {
          loadImage(extendedFile, extendedFile.preview);
        } else {
          const formData = new FormData();
          formData.append('endpoint', EModelEndpoint.agents);
          formData.append('file', file, encodeURIComponent(file.name));
          formData.append('file_id', file_id);
          formData.append('message_file', 'true');

          if (toolResource) {
            formData.append('tool_resource', toolResource.toString());
          }

          uploadFile.mutate(formData);
        }
      });

      event.target.value = '';
    },
    [uploadFile, loadImage],
  );

  const handleFileRemove = useCallback(
    (fileId: string) => {
      setFiles((prev) => {
        return prev.filter((file) => {
          if (file.file_id === fileId || file.temp_file_id === fileId) {
            if (file.preview && file.preview.startsWith('blob:')) {
              URL.revokeObjectURL(file.preview);
            }
            return false;
          }
          return true;
        });
      });

      const updatedFiles = files.filter((file) => {
        if (file.file_id === fileId || file.temp_file_id === fileId) {
          return false;
        }
        return true;
      });
      params?.onFileChange?.(updatedFiles);
    },
    [files, params],
  );

  useEffect(() => {
    if (params?.fileSetter) {
      params.fileSetter(promptFiles);
    }
  }, [promptFiles, params]);

  useEffect(() => {
    return () => {
      files.forEach((file) => {
        if (file.preview && file.preview.startsWith('blob:')) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

  const getToolResources = useCallback((): AgentToolResources | undefined => {
    if (promptFiles.length === 0) {
      return undefined;
    }

    const toolResources: AgentToolResources = {};

    promptFiles.forEach((file) => {
      if (!file.file_id || !file.tool_resource) return;

      if (!toolResources[file.tool_resource]) {
        toolResources[file.tool_resource] = { file_ids: [] };
      }

      if (!toolResources[file.tool_resource]!.file_ids!.includes(file.file_id)) {
        toolResources[file.tool_resource]!.file_ids!.push(file.file_id);
      }
    });

    return Object.keys(toolResources).length > 0 ? toolResources : undefined;
  }, [promptFiles]);

  const loadFromToolResources = useCallback(
    async (toolResources?: AgentToolResources) => {
      if (!toolResources) {
        setFiles([]);
        return;
      }

      const filesArray: ExtendedFile[] = [];

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
              file = {
                file_id: dbFile.file_id,
                temp_file_id: dbFile.file_id,
                type: dbFile.type,
                filename: dbFile.filename,
                filepath: dbFile.filepath,
                progress: 1,
                preview: dbFile.filepath,
                size: dbFile.bytes || 0,
                width: dbFile.width,
                height: dbFile.height,
                attached: true,
                tool_resource: toolResource,
                metadata: dbFile.metadata,
                source,
              };
            } else {
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
    [fileMap],
  );

  const areFilesReady = useMemo(() => {
    return promptFiles.every((file) => file.file_id && file.progress === 1);
  }, [promptFiles]);

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
    handleFileChange,
    abortUpload,
    files,
    setFiles,
    promptFiles,
    getToolResources,
    loadFromToolResources,
    areFilesReady,
    fileStats,
    handleFileRemove,
  };
};

export default usePromptFileHandling;
