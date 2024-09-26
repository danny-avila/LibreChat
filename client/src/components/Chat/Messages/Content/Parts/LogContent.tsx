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

  return (
    <>
      {processedContent && <div>{processedContent}</div>}
      {nonImageAttachments.length > 0 && (
        <div>
          <p>{localize('com_generated_files')}</p>
          {nonImageAttachments.map((file, index) => (
            <React.Fragment key={file.filepath}>
              <LogLink href={file.filepath}>{file.filename}</LogLink>
              {index < nonImageAttachments.length - 1 && ', '}
            </React.Fragment>
          ))}
        </div>
      )}
    </>
  );
};

export default LogContent;
