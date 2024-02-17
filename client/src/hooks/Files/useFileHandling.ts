import { v4 } from 'uuid';
import debounce from 'lodash/debounce';
import { useState, useEffect, useCallback } from 'react';
import {
  megabyte,
  EModelEndpoint,
  mergeFileConfig,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import { useUploadFileMutation, useGetFileConfig } from '~/data-provider';
import { useToastContext } from '~/Providers/ToastContext';
import { useChatContext } from '~/Providers/ChatContext';
import useUpdateFiles from './useUpdateFiles';

const { checkType } = defaultFileConfig;

type UseFileHandling = {
  overrideEndpoint?: EModelEndpoint;
  fileSetter?: FileSetter;
  additionalMetadata?: Record<string, string>;
};

const useFileHandling = (params?: UseFileHandling) => {
  const { showToast } = useToastContext();
  const [errors, setErrors] = useState<string[]>([]);
  const { files, setFiles, setFilesLoading, conversation } = useChatContext();
  const setError = (error: string) => setErrors((prevErrors) => [...prevErrors, error]);
  const { addFile, replaceFile, updateFileById, deleteFileById } = useUpdateFiles(
    params?.fileSetter ?? setFiles,
  );

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const endpoint =
    params?.overrideEndpoint ?? conversation?.endpointType ?? conversation?.endpoint ?? 'default';

  const { fileLimit, fileSizeLimit, totalSizeLimit, supportedMimeTypes } =
    fileConfig.endpoints[endpoint] ?? fileConfig.endpoints.default;

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

  const uploadFile = useUploadFileMutation({
    onSuccess: (data) => {
      console.log('upload success', data);
      updateFileById(
        data.temp_file_id,
        {
          progress: 0.9,
          filepath: data.filepath,
        },
        params?.additionalMetadata?.assistant_id ? true : false,
      );

      setTimeout(() => {
        updateFileById(
          data.temp_file_id,
          {
            progress: 1,
            file_id: data.file_id,
            temp_file_id: data.temp_file_id,
            filepath: data.filepath,
            type: data.type,
            height: data.height,
            width: data.width,
            filename: data.filename,
            source: data.source,
          },
          params?.additionalMetadata?.assistant_id ? true : false,
        );
      }, 300);
    },
    onError: (error, body) => {
      console.log('upload error', error);
      const file_id = body.get('file_id');
      deleteFileById(file_id as string);
      setError(
        (error as { response: { data: { message?: string } } })?.response?.data?.message ??
          'An error occurred while uploading the file.',
      );
    },
  });

  const startUpload = async (extendedFile: ExtendedFile) => {
    if (!endpoint) {
      setError('An error occurred while uploading the file: Endpoint is undefined');
      return;
    }

    const formData = new FormData();
    formData.append('file', extendedFile.file as File);
    formData.append('file_id', extendedFile.file_id);
    if (extendedFile.width) {
      formData.append('width', extendedFile.width?.toString());
    }
    if (extendedFile.height) {
      formData.append('height', extendedFile.height?.toString());
    }

    if (params?.additionalMetadata) {
      for (const [key, value] of Object.entries(params.additionalMetadata)) {
        formData.append(key, value);
      }
    }

    if (
      endpoint === EModelEndpoint.assistants &&
      !formData.get('assistant_id') &&
      conversation?.assistant_id
    ) {
      formData.append('assistant_id', conversation.assistant_id);
      formData.append('message_file', 'true');
    }

    formData.append('endpoint', endpoint);

    uploadFile.mutate(formData);
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
      if (!checkType(originalFile.type, supportedMimeTypes)) {
        console.log(originalFile);
        setError('Currently, unsupported file type: ' + originalFile.type);
        return false;
      }

      if (originalFile.size >= fileSizeLimit) {
        setError(`File size exceeds ${fileSizeLimit / megabyte} MB.`);
        return false;
      }
    }

    if (currentTotalSize + incomingTotalSize > totalSizeLimit) {
      setError(`The total size of the files cannot exceed ${totalSizeLimit / megabyte} MB.`);
      return false;
    }

    const combinedFilesInfo = [
      ...existingFiles.map(
        (file) =>
          `${file.file?.name ?? file.filename}-${file.size}-${file.type?.split('/')[0] ?? 'file'}`,
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

      await startUpload(extendedFile);
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
          type: originalFile.type,
          preview,
          progress: 0.2,
          size: originalFile.size,
        };

        addFile(extendedFile);

        if (originalFile.type?.split('/')[0] === 'image') {
          loadImage(extendedFile, preview);
          continue;
        }

        await startUpload(extendedFile);
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
