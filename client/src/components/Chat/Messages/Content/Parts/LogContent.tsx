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

type ImageAttachment = TFile & TAttachmentMetadata;

const LogContent: React.FC<LogContentProps> = ({ output = '', renderImages, attachments }) => {
  const localize = useLocalize();

  const processedContent = useMemo(() => {
    if (!output) {
      return '';
    }

    const parts = output.split('Generated files:');
    return parts[0].trim();
  }, [output]);

  const { imageAttachments, textAttachments, nonInlineAttachments } = useMemo(() => {
    const imageAtts: ImageAttachment[] = [];
    const textAtts: Array<TFile & TAttachmentMetadata> = [];
    const otherAtts: TAttachment[] = [];

    attachments?.forEach((attachment) => {
      const fileData = attachment as TFile & TAttachmentMetadata;
      const { filepath = null, text } = fileData;
      const isImage = imageExtRegex.test(attachment.filename ?? '') && filepath != null;
      if (isImage) {
        imageAtts.push(attachment as ImageAttachment);
        return;
      }
      if (typeof text === 'string' && text.length > 0) {
        textAtts.push(fileData);
        return;
      }
      otherAtts.push(attachment);
    });

    return {
      imageAttachments: renderImages === true ? imageAtts : null,
      textAttachments: textAtts,
      nonInlineAttachments: otherAtts,
    };
  }, [attachments, renderImages]);

  const renderAttachment = (file: TAttachment) => {
    const now = new Date();
    const expiresAt =
      'expiresAt' in file && typeof file.expiresAt === 'number' ? new Date(file.expiresAt) : null;
    const isExpired = expiresAt ? isAfter(now, expiresAt) : false;
    const filename = file.filename || '';

    if (isExpired) {
      return `${filename} ${localize('com_download_expired')}`;
    }

    const fileData = file as TFile & TAttachmentMetadata;
    const filepath = file.filepath || '';

    return (
      <LogLink
        href={filepath}
        filename={filename}
        file_id={fileData.file_id}
        user={fileData.user}
        source={fileData.source}
      >
        {'- '}
        {filename} {localize('com_click_to_download')}
      </LogLink>
    );
  };

  return (
    <>
      {processedContent && <div>{processedContent}</div>}
      {nonInlineAttachments.length > 0 && (
        <div>
          <p>{localize('com_generated_files')}</p>
          {nonInlineAttachments.map((file, index) => (
            <React.Fragment key={file.filepath}>
              {renderAttachment(file)}
              {index < nonInlineAttachments.length - 1 && ', '}
            </React.Fragment>
          ))}
        </div>
      )}
      {textAttachments.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          {textAttachments.map((file) => (
            <div
              key={file.filepath ?? file.file_id ?? file.filename}
              className="rounded-lg bg-surface-secondary p-3"
            >
              {file.filename && (
                <div className="mb-1 truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                  {file.filename}
                </div>
              )}
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-text-primary">
                {file.text}
              </pre>
            </div>
          ))}
        </div>
      )}
      {imageAttachments?.map((attachment) => (
        <Image
          width={attachment.width}
          height={attachment.height}
          key={attachment.filepath}
          altText={attachment.filename}
          imagePath={attachment.filepath}
        />
      ))}
    </>
  );
};

export default LogContent;
