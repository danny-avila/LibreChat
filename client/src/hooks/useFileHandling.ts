import { v4 } from 'uuid';
import debounce from 'lodash/debounce';
import { useState, useEffect, useCallback } from 'react';
import type { ExtendedFile } from '~/common';
import { useToastContext } from '~/Providers/ToastContext';
import { useChatContext } from '~/Providers/ChatContext';
import { useUploadImageMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';

const sizeMB = 20;
const fileLimit = 10;
const sizeLimit = sizeMB * 1024 * 1024; // 20 MB
const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const useFileHandling = () => {
  const { showToast } = useToastContext();
  const [errors, setErrors] = useState<string[]>([]);
  const { files, setFiles, setFilesLoading } = useChatContext();

  const displayToast = useCallback(() => {
    if (errors.length > 1) {
      const errorList = Array.from(new Set(errors))
        .map((e, i) => `${i > 0 ? '• ' : ''}${e}\n`)
        .join('');
      showToast({
        message: errorList,
        severity: NotificationSeverity.ERROR,
        duration: 5000,
      });
    } else if (errors.length === 1) {
      showToast({
        message: errors[0],
        severity: NotificationSeverity.ERROR,
        duration: 5000,
      });
    }

    setErrors([]);
  }, [errors, showToast]);

  const debouncedDisplayToast = debounce(displayToast, 250);

  useEffect(() => {
    if (errors.length > 0) {
      debouncedDisplayToast();
    }

    return () => debouncedDisplayToast.cancel();
  }, [errors, debouncedDisplayToast]);

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
      if (!currentFile) {
        console.warn(`File with id ${fileId} not found.`);
        return currentFiles;
      }
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
        updateFileById(data.temp_file_id, {
          progress: 1,
          file_id: data.file_id,
          temp_file_id: data.temp_file_id,
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

  const handleFiles = async (_files: FileList | File[]) => {
    if (_files.length + files.size > fileLimit) {
      setErrors((prevErrors) => [
        ...prevErrors,
        `You can only upload up to ${fileLimit} files at a time.`,
      ]);
      return;
    }
    Array.from(_files).forEach((originalFile) => {
      if (!supportedTypes.includes(originalFile.type)) {
        setErrors((prevErrors) => [
          ...prevErrors,
          'Currently, only JPEG, JPG, PNG, and WEBP files are supported.',
        ]);
        return;
      }

      if (originalFile.size >= sizeLimit) {
        setErrors((prevErrors) => [...prevErrors, `File size exceeds ${sizeMB} MB.`]);
        return;
      }

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
