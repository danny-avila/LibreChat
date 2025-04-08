import { memo } from 'react';
import { imageExtRegex } from 'librechat-data-provider';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import Image from '~/components/Chat/Messages/Content/Image';
import { useAttachmentLink } from './LogLink';

const FileAttachment = memo(({ attachment }: { attachment: TAttachment }) => {
  const { handleDownload } = useAttachmentLink({
    href: attachment.filepath,
    filename: attachment.filename,
  });
  const extension = attachment.filename.split('.').pop();

  return (
    <FileContainer
      file={attachment}
      onClick={handleDownload}
      overrideType={extension}
      containerClassName="max-w-fit"
      buttonClassName="hover:cursor-pointer hover:bg-surface-secondary active:bg-surface-secondary focus:bg-surface-secondary hover:border-border-heavy active:border-border-heavy"
    />
  );
});

export default function Attachment({ attachment }: { attachment?: TAttachment }) {
  if (!attachment) {
    return null;
  }
  const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;
  const isImage =
    imageExtRegex.test(attachment.filename) && width != null && height != null && filepath != null;

  if (isImage) {
    return (
      <Image
        altText={attachment.filename}
        imagePath={filepath}
        height={height}
        width={width}
        className="mb-4"
      />
    );
  }
  return <FileAttachment attachment={attachment} />;
}
