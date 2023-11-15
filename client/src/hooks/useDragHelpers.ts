import { useDrop } from 'react-dnd';
import { NativeTypes } from 'react-dnd-html5-backend';
import type { DropTargetMonitor } from 'react-dnd';
import type { ExtendedFile } from '~/common';

export default function useDragHelpers(
  setFiles: React.Dispatch<React.SetStateAction<ExtendedFile[]>>,
) {
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
  const [{ canDrop, isOver }, drop] = useDrop(() => ({
    accept: [NativeTypes.FILE],
    drop(item: { files: File[] }) {
      console.log('drop', item.files);
      handleFiles(item.files);
    },
    canDrop() {
      // console.log('canDrop', item.files, item.items);
      return true;
    },
    // hover() {
    //   // console.log('hover', item.files, item.items);
    // },
    collect: (monitor: DropTargetMonitor) => {
      // const item = monitor.getItem() as File[];
      // if (item) {
      //   console.log('collect', item.files, item.items);
      // }

      return {
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      };
    },
  }));

  return {
    canDrop,
    isOver,
    drop,
  };
}
