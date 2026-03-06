import { useMemo, memo } from 'react';
import type { TFile, TMessage } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import { getCachedPreview } from '~/utils';
import Image from './Image';

const Files = ({ message }: { message?: TMessage }) => {
  const imageFiles = useMemo(() => {
    return message?.files?.filter((file) => file.type?.startsWith('image/')) || [];
  }, [message?.files]);

  const otherFiles = useMemo(() => {
    return message?.files?.filter((file) => !(file.type?.startsWith('image/') === true)) || [];
  }, [message?.files]);

  return (
    <>
      {otherFiles.length > 0 &&
        otherFiles.map((file) => <FileContainer key={file.file_id} file={file as TFile} />)}
      {imageFiles.length > 0 &&
        imageFiles.map((file) => {
          const cached = file.file_id ? getCachedPreview(file.file_id) : undefined;
          return (
            <Image
              key={file.file_id}
              width={file.width}
              height={file.height}
              altText={file.filename ?? 'Uploaded Image'}
              imagePath={cached ?? file.preview ?? file.filepath ?? ''}
            />
          );
        })}
    </>
  );
};

export default memo(Files);
