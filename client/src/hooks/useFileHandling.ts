import { v4 } from 'uuid';
// import { useState } from 'react';
import type { ExtendedFile } from '~/common';
import { useUploadImageMutation } from '~/data-provider';
import { useChatContext } from '~/Providers/ChatContext';

const useFileHandling = () => {
  // const [errors, setErrors] = useState<unknown[]>([]);
  const { files, setFiles, setFilesLoading } = useChatContext();

  const addFile = (newFile: ExtendedFile) => {
    setFiles((currentFiles) => {
      const updatedFiles = new Map(currentFiles);
      updatedFiles.set(newFile.file_id, newFile);
      return updatedFiles;
    });
  };

  const replaceFile = (newFile: ExtendedFile) => {
    setFiles((currentFiles) => {
      const updatedFiles = new Map(currentFiles);
      updatedFiles.set(newFile.file_id, newFile);
      return updatedFiles;
    });
  };

  const updateFileById = (fileId: string, updates: Partial<ExtendedFile>) => {
    setFiles((currentFiles) => {
      if (!currentFiles.has(fileId)) {
        console.warn(`File with id ${fileId} not found.`);
        return currentFiles;
      }

      const updatedFiles = new Map(currentFiles);
      const currentFile = updatedFiles.get(fileId);
      updatedFiles.set(fileId, { ...currentFile, ...updates });

      return updatedFiles;
    });
  };

  const deleteFileById = (fileId: string) => {
    setFiles((currentFiles) => {
      const updatedFiles = new Map(currentFiles);
      if (updatedFiles.has(fileId)) {
        updatedFiles.delete(fileId);
      } else {
        console.warn(`File with id ${fileId} not found.`);
      }
      return updatedFiles;
    });
  };

  const uploadImage = useUploadImageMutation({
    onSuccess: (data) => {
      console.log('upload success', data);
      updateFileById(data.temp_file_id, {
        progress: 0.9,
        filepath: data.filepath,
      });

      setTimeout(() => {
        const file = files.get(data.temp_file_id);
        deleteFileById(data.temp_file_id);
        addFile({
          ...file,
          progress: 1,
          file_id: data.file_id,
          filepath: data.filepath,
        });
      }, 300);
    },
    onError: (error, body) => {
      console.log('upload error', error);
      deleteFileById(body.file_id);
    },
  });

  const uploadFile = async (extendedFile: ExtendedFile) => {
    const formData = new FormData();
    formData.append('file', extendedFile.file);
    formData.append('file_id', extendedFile.file_id);
    if (extendedFile.width) {
      formData.append('width', extendedFile.width?.toString());
    }
    if (extendedFile.height) {
      formData.append('height', extendedFile.height?.toString());
    }

    uploadImage.mutate({ formData, file_id: extendedFile.file_id });
  };

  const handleFiles = async (files: FileList | File[]) => {
    Array.from(files).forEach((originalFile) => {
      if (!originalFile.type.startsWith('image/')) {
        // TODO: showToast('Only image files are supported');
        // TODO: handle other file types
        return;
      }

      // todo: Set File is loading

      try {
        const preview = URL.createObjectURL(originalFile);
        let extendedFile: ExtendedFile = {
          file_id: v4(),
          file: originalFile,
          preview,
          progress: 0.2,
        };

        addFile(extendedFile);

        // async processing
        const img = new Image();
        img.onload = async () => {
          extendedFile.width = img.width;
          extendedFile.height = img.height;
          extendedFile = {
            ...extendedFile,
            progress: 0.6,
          };
          replaceFile(extendedFile);

          await uploadFile(extendedFile);
          URL.revokeObjectURL(preview); // Clean up the original object URL
        };
        img.src = preview;
      } catch (error) {
        console.log('file handling error', error);
      }
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.target.files) {
      setFilesLoading(true);
      handleFiles(event.target.files);
      // reset the input
      event.target.value = '';
    }
  };

  return {
    handleFileChange,
    handleFiles,
    files,
    setFiles,
  };
};

export default useFileHandling;
