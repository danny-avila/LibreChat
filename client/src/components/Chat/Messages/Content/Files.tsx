import { useMemo, memo } from 'react';
import type { TFile, TMessage } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
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
        imageFiles.map((file) => (
          <Image
            key={file.file_id}
            imagePath={file.preview ?? file.filepath ?? ''}
            altText={file.filename ?? 'Uploaded Image'}
          />
        ))}
    </>
  );
};

export default memo(Files);
