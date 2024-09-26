import { isAfter } from 'date-fns';
import React, { useMemo } from 'react';
import { imageExtRegex } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import LogLink from './LogLink';

interface LogContentProps {
  output?: string;
  attachments?: TAttachment[];
}

const LogContent: React.FC<LogContentProps> = ({ output = '', attachments }) => {
  const localize = useLocalize();
  const processedContent = useMemo(() => {
    if (!output) {
      return '';
    }

    const parts = output.split('Generated files:');
    return parts[0].trim();
  }, [output]);

  const nonImageAttachments =
    attachments?.filter((file) => !imageExtRegex.test(file.filename)) || [];

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
      <LogLink href={file.filepath}>
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
    </>
  );
};

export default LogContent;
