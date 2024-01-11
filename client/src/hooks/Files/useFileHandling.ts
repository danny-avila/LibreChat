import { v4 } from 'uuid';
import debounce from 'lodash/debounce';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useToastContext } from '~/Providers/ToastContext';
import { useChatContext } from '~/Providers/ChatContext';
import { useUploadImageMutation } from '~/data-provider';
import useUpdateFiles from './useUpdateFiles';

const sizeMB = 20;
const maxSize = 25;
const fileLimit = 10;
const sizeLimit = sizeMB * 1024 * 1024; // 20 MB
const totalSizeLimit = maxSize * 1024 * 1024; // 25 MB
const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const useFileHandling = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const [errors, setErrors] = useState<string[]>([]);
  const { files, setFiles, setFilesLoading } = useChatContext();
  const setError = (error: string) => setErrors((prevErrors) => [...prevErrors, error]);
  const { addFile, replaceFile, updateFileById, deleteFileById } = useUpdateFiles(setFiles);

  const displayToast = useCallback(() => {
    if (errors.length > 1) {
      const errorList = Array.from(new Set(errors))
        .map((e, i) => `${i > 0 ? '• ' : ''}${e}\n`)
        .join('');
      showToast({
        message: errorList,
        status: 'error',
        duration: 5000,
      });
    } else if (errors.length === 1) {
      showToast({
        message: errors[0],
        status: 'error',
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

  const uploadImage = useUploadImageMutation({
    onSuccess: (data) => {
      console.log('upload success', data);
      updateFileById(data.temp_file_id, {
        progress: 0.9,
        filepath: data.filepath,
      });

      const _files = queryClient.getQueryData<TFile[]>([QueryKeys.files]) ?? [];
      queryClient.setQueryData([QueryKeys.files], [..._files, data]);

      setTimeout(() => {
        updateFileById(data.temp_file_id, {
          progress: 1,
          file_id: data.file_id,
          temp_file_id: data.temp_file_id,
          filepath: data.filepath,
          type: data.type,
          height: data.height,
          width: data.width,
          filename: data.filename,
          source: data.source,
        });
      }, 300);
    },
    onError: (error, body) => {
      console.log('upload error', error);
      deleteFileById(body.file_id);
      setError('An error occurred while uploading the file.');
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

  const validateFiles = (fileList: File[]) => {
    const existingFiles = Array.from(files.values());
    const incomingTotalSize = fileList.reduce((total, file) => total + file.size, 0);
    const currentTotalSize = existingFiles.reduce((total, file) => total + file.size, 0);

    if (fileList.length + files.size > fileLimit) {
      setError(`You can only upload up to ${fileLimit} files at a time.`);
      return false;
    }

    for (let i = 0; i < fileList.length; i++) {
      const originalFile = fileList[i];
      if (!supportedTypes.includes(originalFile.type)) {
        setError('Currently, only JPEG, JPG, PNG, and WEBP files are supported.');
        return false;
      }

      if (originalFile.size >= sizeLimit) {
        setError(`File size exceeds ${sizeMB} MB.`);
        return false;
      }
    }

    if (currentTotalSize + incomingTotalSize > totalSizeLimit) {
      setError(`The total size of the files cannot exceed ${maxSize} MB.`);
      return false;
    }

    const combinedFilesInfo = [
      ...existingFiles.map(
        (file) => `${file.file.name}-${file.size}-${file.type?.split('/')[0] ?? 'file'}`,
      ),
      ...fileList.map((file) => `${file.name}-${file.size}-${file.type?.split('/')[0] ?? 'file'}`),
    ];

    const uniqueFilesSet = new Set(combinedFilesInfo);

    if (uniqueFilesSet.size !== combinedFilesInfo.length) {
      setError('Duplicate file detected.');
      return false;
    }

    return true;
  };

  const loadImage = (extendedFile: ExtendedFile, preview: string) => {
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
      URL.revokeObjectURL(preview);
    };
    img.src = preview;
  };

  const handleFiles = async (_files: FileList | File[]) => {
    const fileList = Array.from(_files);
    /* Validate files */
    let filesAreValid: boolean;
    try {
      filesAreValid = validateFiles(fileList);
    } catch (error) {
      console.error('file validation error', error);
      setError('An error occurred while validating the file.');
      return;
    }
    if (!filesAreValid) {
      setFilesLoading(false);
      return;
    }

    /* Process files */
    for (const originalFile of fileList) {
      const file_id = v4();
      try {
        const preview = URL.createObjectURL(originalFile);
        const extendedFile: ExtendedFile = {
          file_id,
          file: originalFile,
          preview,
          progress: 0.2,
          size: originalFile.size,
        };

        addFile(extendedFile);
        if (originalFile.type?.split('/')[0] === 'image') {
          loadImage(extendedFile, preview);
        }
      } catch (error) {
        deleteFileById(file_id);
        console.log('file handling error', error);
        setError('An error occurred while processing the file.');
      }
    }
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
