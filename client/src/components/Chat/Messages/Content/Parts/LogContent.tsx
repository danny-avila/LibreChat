import { isAfter } from 'date-fns';
import React, { useMemo } from 'react';
import { imageExtRegex } from 'librechat-data-provider';
import type { TFile, TAttachment, TAttachmentMetadata } from 'librechat-data-provider';
import Image from '~/components/Chat/Messages/Content/Image';
import { useLocalize } from '~/hooks';
import LogLink from './LogLink';

interface LogContentProps {
  output?: string;
  renderImages?: boolean;
  attachments?: TAttachment[];
}

type ImageAttachment = TFile &
  TAttachmentMetadata & {
    height: number;
    width: number;
  };

const LogContent: React.FC<LogContentProps> = ({ output = '', renderImages, attachments }) => {
  const localize = useLocalize();

  const processedContent = useMemo(() => {
    if (!output) {
      return '';
    }

    const parts = output.split('Generated files:');
    return parts[0].trim();
  }, [output]);

  const { imageAttachments, nonImageAttachments } = useMemo(() => {
    const imageAtts: ImageAttachment[] = [];
    const nonImageAtts: TAttachment[] = [];

    attachments?.forEach((attachment) => {
      const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;
      const isImage =
        imageExtRegex.test(attachment.filename) &&
        width != null &&
        height != null &&
        filepath != null;
      if (isImage) {
        imageAtts.push(attachment as ImageAttachment);
      } else {
        nonImageAtts.push(attachment);
      }
    });

    return {
      imageAttachments: renderImages === true ? imageAtts : null,
      nonImageAttachments: nonImageAtts,
    };
  }, [attachments, renderImages]);

  const renderAttachment = (file: TAttachment) => {
    const now = new Date();
    const expiresAt = typeof file.expiresAt === 'number' ? new Date(file.expiresAt) : null;
    const isExpired = expiresAt ? isAfter(now, expiresAt) : false;

    if (isExpired) {
      return `${file.filename} ${localize('com_download_expired')}`;
    }

    // const expirationText = expiresAt
    //   ? ` ${localize('com_download_expires', format(expiresAt, 'MM/dd/yy HH:mm'))}`
    //   : ` ${localize('com_click_to_download')}`;

    return (
      <LogLink href={file.filepath} filename={file.filename}>
        {'- '}
        {file.filename} {localize('com_click_to_download')}
      </LogLink>
    );
  };

  return (
    <>
      {processedContent && <div>{processedContent}</div>}
      {nonImageAttachments.length > 0 && (
        <div>
          <p>{localize('com_generated_files')}</p>
          {nonImageAttachments.map((file, index) => (
            <React.Fragment key={file.filepath}>
              {renderAttachment(file)}
              {index < nonImageAttachments.length - 1 && ', '}
            </React.Fragment>
          ))}
        </div>
      )}
      {imageAttachments?.map((attachment, index) => {
        const { width, height, filepath } = attachment;
        return (
          <Image
            key={index}
            altText={attachment.filename}
            imagePath={filepath}
            height={height}
            width={width}
          />
        );
      })}
    </>
  );
};

export default LogContent;
