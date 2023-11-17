import Image from './Image';
import { ExtendedFile } from '~/common';

export default function Images({
  files,
  setFiles,
}: {
  files: ExtendedFile[];
  setFiles: React.Dispatch<React.SetStateAction<ExtendedFile[]>>;
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">
      {files.map((file: ExtendedFile, index: number) => {
        const handleDelete = () => {
          setFiles((currentFiles) =>
            currentFiles.filter((_file) => file.preview !== _file.preview),
          );
        };
        return (
          <Image key={index} url={file.preview} onDelete={handleDelete} progress={file.progress} />
        );
      })}
    </div>
  );
}
