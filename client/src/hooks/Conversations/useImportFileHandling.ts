import debounce from 'lodash/debounce';
import { useState, useEffect, useCallback } from 'react';
import type { FileSetter } from '~/common';
import { useUploadConversationsMutation } from '~/data-provider';
import { useToastContext } from '~/Providers/ToastContext';

type UseImportFileHandling = {
  fileSetter?: FileSetter;
};

const useImportFileHandling = (params?: UseImportFileHandling) => {
  const { showToast } = useToastContext();
  const [errors, setErrors] = useState<string[]>([]);
  const setError = (error: string) => setErrors((prevErrors) => [...prevErrors, error]);

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

  const setFilesLoading = (arg0: boolean) => {
    throw new Error('Function not implemented.');
  };

  useEffect(() => {
    if (errors.length > 0) {
      debouncedDisplayToast();
    }

    return () => debouncedDisplayToast.cancel();
  }, [errors, debouncedDisplayToast]);

  const uploadFile = useUploadConversationsMutation({
    onSuccess: (data) => {
      console.log('upload success', data);
    },
    onError: (error, body) => {
      console.log('upload error', error);
      setError(
        (error as { response: { data: { message?: string } } })?.response?.data?.message ??
          'An error occurred while uploading the file.',
      );
    },
  });

  const startUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file, encodeURIComponent(file?.name || 'File'));

    uploadFile.mutate(formData);
  };

  const validateFiles = (file: File) => {
    console.debug('Validating files...');
    return true;
  };

  const handleFiles = async (_file: File) => {
    console.log('Handling files...');
    /* Validate file */
    let filesAreValid: boolean;
    try {
      filesAreValid = validateFiles(_file);
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
    try {
      await startUpload(_file);
    } catch (error) {
      console.log('file handling error', error);
      setError('An error occurred while processing the file.');
    }
  };

  return {
    handleFiles,
  };
};

export default useImportFileHandling;
