import { useMemo, useState, useCallback, memo } from 'react';
import { FileContext, FileSources } from 'librechat-data-provider';
import type { TFile, TMessage } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import FilePreviewDialog from './FilePreviewDialog';
import Image from './Image';

type MessageFile = Partial<TFile>;

type SplitMessageFiles = {
  imageFiles: MessageFile[];
  otherFiles: MessageFile[];
};

const isUploadAsTextAttachment = (file: Partial<TFile>) =>
  file.source === FileSources.text && file.context === FileContext.message_attachment;

const splitMessageFiles = (files?: MessageFile[]): SplitMessageFiles => {
  if (!files?.length) {
    return { imageFiles: [], otherFiles: [] };
  }

  return files.reduce<SplitMessageFiles>(
    (acc, file) => {
      const bucket = file.type?.startsWith('image/') === true ? acc.imageFiles : acc.otherFiles;
      bucket.push(file);
      return acc;
    },
    { imageFiles: [], otherFiles: [] },
  );
};

const getMessageFileKey = (file: MessageFile, index: number) =>
  file.file_id ?? `${file.filename ?? 'file'}-${index}`;

const MessageFileContainer = ({
  file,
  onSelect,
}: {
  file: MessageFile;
  onSelect: (file: MessageFile) => void;
}) => {
  const previewDisabled = isUploadAsTextAttachment(file);
  const handleClick = useCallback(() => onSelect(file), [file, onSelect]);

  return (
    <FileContainer
      file={file as TFile}
      disabled={previewDisabled}
      onClick={previewDisabled ? undefined : handleClick}
    />
  );
};

const MessageImage = ({ file }: { file: MessageFile }) => (
  <Image
    imagePath={file.preview ?? file.filepath ?? ''}
    height={file.height ?? 1920}
    width={file.width ?? 1080}
    altText={file.filename ?? 'Uploaded Image'}
  />
);

const Files = ({ message }: { message?: TMessage }) => {
  const { imageFiles, otherFiles } = useMemo(
    () => splitMessageFiles(message?.files),
    [message?.files],
  );

  const [selectedFile, setSelectedFile] = useState<Partial<TFile> | null>(null);

  const handleClose = useCallback((open: boolean) => {
    if (open) {
      return;
    }
    setSelectedFile(null);
  }, []);

  const handleSelect = useCallback((file: MessageFile) => setSelectedFile(file), []);

  return (
    <>
      {otherFiles.map((file, index) => (
        <MessageFileContainer
          key={getMessageFileKey(file, index)}
          file={file}
          onSelect={handleSelect}
        />
      ))}
      {imageFiles.map((file, index) => (
        <MessageImage key={getMessageFileKey(file, index)} file={file} />
      ))}
      <FilePreviewDialog
        open={selectedFile !== null}
        onOpenChange={handleClose}
        fileName={selectedFile?.filename ?? ''}
        fileId={selectedFile?.file_id}
        fileType={selectedFile?.type ?? undefined}
        fileSize={(selectedFile as TFile)?.bytes}
        source={selectedFile?.source}
      />
    </>
  );
};

export default memo(Files);
