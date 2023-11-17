import { v4 } from 'uuid';
// import { useState } from 'react';
import ImageBlobReduce from 'image-blob-reduce';
import type { ExtendedFile } from '~/common';
import { useUploadImageMutation } from '~/data-provider';
import { useChatContext } from '~/Providers/ChatContext';

const reducer = new ImageBlobReduce();
const resolution = 'low';

const useFileHandling = () => {
  // const [errors, setErrors] = useState<unknown[]>([]);
  const { files, setFiles } = useChatContext();

  const addFile = (newFile: ExtendedFile) => {
    setFiles((currentFiles) => [...currentFiles, newFile]);
  };

  const replaceFile = (newFile: ExtendedFile) => {
    setFiles((currentFiles) =>
      currentFiles.map((f) => (f.file_id === newFile.file_id ? newFile : f)),
    );
  };

  const deleteFile = (file_id: string) => {
    setFiles((currentFiles) => currentFiles.filter((_file) => file_id !== _file.file_id));
  };

  const uploadImage = useUploadImageMutation({
    onMutate: (formData) => {
      console.log('mutating', formData);
    },
  });

  const uploadFile = async (extendedFile: ExtendedFile) => {
    const formData = new FormData();
    formData.append('filename', extendedFile.file.name);
    formData.append('size', extendedFile.file.size.toString());
    formData.append('type', extendedFile.file.type);
    if (extendedFile.width) {
      formData.append('width', extendedFile.width?.toString());
    }
    if (extendedFile.height) {
      formData.append('height', extendedFile.height?.toString());
    }

    uploadImage.mutate(formData, {
      onSuccess: (data) => {
        console.log('upload success', data);
      },
      onError: (error, formData) => {
        console.log('upload error', error);

        deleteFile(extendedFile.file_id);
      },
    });
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
          console.log('original dimensions', img.width, img.height);

          let max = 512;

          if (resolution === 'high') {
            max = extendedFile.height > extendedFile.width ? 768 : 2000;
          }

          const reducedBlob = await reducer.toBlob(originalFile, {
            max,
          });

          const resizedFile = new File([reducedBlob], originalFile.name, {
            type: originalFile.type,
          });
          const resizedPreview = URL.createObjectURL(resizedFile);
          extendedFile = {
            ...extendedFile,
            file: resizedFile,
          };

          const resizedImg = new Image();
          resizedImg.onload = () => {
            extendedFile = {
              ...extendedFile,
              file: resizedFile,
              width: resizedImg.width,
              height: resizedImg.height,
              progress: 0.6,
            };

            console.log('resized dimensions', resizedImg.width, resizedImg.height);
            replaceFile(extendedFile);
            URL.revokeObjectURL(resizedPreview); // Clean up the object URL
            uploadFile(extendedFile);
          };
          resizedImg.src = resizedPreview;

          URL.revokeObjectURL(preview); // Clean up the original object URL

          /* TODO: send to backend server /api/files
              use React Query Mutation to upload file (TypeScript), we need to make the CommonJS api endpoint (expressjs) to accept file upload
              server needs the image file, which the server will convert to base64 to send to external API
              server will then employ a 'saving' or 'caching' strategy based on admin configuration (can be local, CDN, etc.)
              the expressjs server needs the following:

              name,
              size,
              type,
              width,
              height,

              use onSuccess, onMutate handlers to update the file progress

              we need the full api handling for this, including the server-side

          */
        };
        img.src = preview;
      } catch (error) {
        console.log('file handling error', error);
      }
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
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
