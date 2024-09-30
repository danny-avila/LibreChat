import { v4 } from 'uuid';
import debounce from 'lodash/debounce';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import {
  megabyte,
  QueryKeys,
  EModelEndpoint,
  codeTypeMapping,
  mergeFileConfig,
  isAssistantsEndpoint,
  defaultAssistantsVersion,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import type { TEndpointsConfig, TError } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import { useUploadFileMutation, useGetFileConfig } from '~/data-provider';
import { useDelayedUploadToast } from './useDelayedUploadToast';
import { useToastContext } from '~/Providers/ToastContext';
import { useChatContext } from '~/Providers/ChatContext';
import useUpdateFiles from './useUpdateFiles';

const { checkType } = defaultFileConfig;

type UseFileHandling = {
  overrideEndpoint?: EModelEndpoint;
  fileSetter?: FileSetter;
  fileFilter?: (file: File) => boolean;
  additionalMetadata?: Record<string, string | undefined>;
};

const useFileHandling = (params?: UseFileHandling) => {
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const [errors, setErrors] = useState<string[]>([]);
  const { startUploadTimer, clearUploadTimer } = useDelayedUploadToast();
  const { files, setFiles, setFilesLoading, conversation } = useChatContext();
  const setError = (error: string) => setErrors((prevErrors) => [...prevErrors, error]);
  const { addFile, replaceFile, updateFileById, deleteFileById } = useUpdateFiles(
    params?.fileSetter ?? setFiles,
  );

  const agent_id = params?.additionalMetadata?.agent_id ?? '';
  const assistant_id = params?.additionalMetadata?.assistant_id ?? '';

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
      clearUploadTimer(data.temp_file_id);
      console.log('upload success', data);
      if (agent_id) {
        queryClient.refetchQueries([QueryKeys.agent, agent_id]);
        return;
      }
      updateFileById(
        data.temp_file_id,
        {
          progress: 0.9,
          filepath: data.filepath,
        },
        assistant_id ? true : false,
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
            embedded: data.embedded,
          },
          assistant_id ? true : false,
        );
      }, 300);
    },
    onError: (error, body) => {
      console.log('upload error', error);
      const file_id = body.get('file_id');
      clearUploadTimer(file_id as string);
      deleteFileById(file_id as string);
      setError(
        (error as TError | undefined)?.response?.data?.message ??
          'An error occurred while uploading the file.',
      );
    },
  });

  const startUpload = async (extendedFile: ExtendedFile) => {
    const filename = extendedFile.file?.name ?? 'File';
    startUploadTimer(extendedFile.file_id, filename, extendedFile.size);

    const formData = new FormData();
    formData.append('file', extendedFile.file as File, encodeURIComponent(filename));
    formData.append('file_id', extendedFile.file_id);

    const width = extendedFile.width ?? 0;
    const height = extendedFile.height ?? 0;
    if (width) {
      formData.append('width', width.toString());
    }
    if (height) {
      formData.append('height', height.toString());
    }

    if (params?.additionalMetadata) {
      for (const [key, value = ''] of Object.entries(params.additionalMetadata)) {
        if (value) {
          formData.append(key, value);
        }
      }
    }

    const convoAssistantId = conversation?.assistant_id ?? '';
    const convoModel = conversation?.model ?? '';
    if (isAssistantsEndpoint(endpoint) && !formData.get('assistant_id') && convoAssistantId) {
      const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
      const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
      formData.append('version', version);
      formData.append('assistant_id', convoAssistantId);
      formData.append('model', convoModel);
      formData.append('message_file', 'true');
    }
    if (isAssistantsEndpoint(endpoint) && !formData.get('version')) {
      const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
      const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
      formData.append('version', version);
      formData.append('model', conversation?.model ?? '');
      formData.append('message_file', 'true');
    }

    formData.append('endpoint', endpoint);

    uploadFile.mutate(formData);
  };

  const validateFiles = (fileList: File[]) => {
    const existingFiles = Array.from(files.values());
    const incomingTotalSize = fileList.reduce((total, file) => total + file.size, 0);
    if (incomingTotalSize === 0) {
      setError('Empty files are not allowed.');
      return false;
    }
    const currentTotalSize = existingFiles.reduce((total, file) => total + file.size, 0);

    if (fileList.length + files.size > fileLimit) {
      setError(`You can only upload up to ${fileLimit} files at a time.`);
      return false;
    }

    for (let i = 0; i < fileList.length; i++) {
      let originalFile = fileList[i];
      let fileType = originalFile.type;
      const extension = originalFile.name.split('.').pop() ?? '';
      const knownCodeType = codeTypeMapping[extension];

      // Infer MIME type for Known Code files when the type is empty or a mismatch
      if (knownCodeType && (!fileType || fileType !== knownCodeType)) {
        fileType = knownCodeType;
      }

      // Check if the file type is still empty after the extension check
      if (!fileType) {
        setError('Unable to determine file type for: ' + originalFile.name);
        return false;
      }

      // Replace empty type with inferred type
      if (originalFile.type !== fileType) {
        const newFile = new File([originalFile], originalFile.name, { type: fileType });
        originalFile = newFile;
        fileList[i] = newFile;
      }

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
      ...fileList.map(
        (file: File | undefined) =>
          `${file?.name}-${file?.size}-${file?.type.split('/')[0] ?? 'file'}`,
      ),
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

        if (originalFile.type.split('/')[0] === 'image') {
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
