import type { ExtendedFile } from '~/common';
import { useChatContext } from '~/Providers/ChatContext';

const useFileHandling = () => {
  const { files, setFiles } = useChatContext();

  const addFile = (newFile: ExtendedFile) => {
    setFiles((currentFiles) => [...currentFiles, newFile]);
  };

  const replaceFile = (newFile: ExtendedFile) => {
    setFiles((currentFiles) =>
      currentFiles.map((f) => (f.preview === newFile.preview ? newFile : f)),
    );
  };

  const handleFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((originalFile) => {
      if (!originalFile.type.startsWith('image/')) {
        // TODO: showToast('Only image files are supported');
        // TODO: handle other file types
        return;
      }
      const preview = URL.createObjectURL(originalFile);
      const extendedFile: ExtendedFile = {
        file: originalFile,
        preview,
        progress: 0,
      };
      addFile(extendedFile);

      // async processing
      if (originalFile.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          extendedFile.width = img.width;
          extendedFile.height = img.height;
          extendedFile.progress = 1; // Update loading status
          replaceFile(extendedFile);
          URL.revokeObjectURL(preview); // Clean up the object URL
        };
        img.src = preview;
      } else {
        // TODO: non-image files
        // extendedFile.progress = false;
        // replaceFile(extendedFile);
      }
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleFiles(event.target.files);
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
