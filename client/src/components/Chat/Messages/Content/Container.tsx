import { TMessage } from 'librechat-data-provider';
import Files from './Files';
import { AttachmentGroup } from './Parts';

const Container = ({ children, message }: { children: React.ReactNode; message?: TMessage }) => {
  const attachments = message?.attachments;
  const isAssistant = message?.isCreatedByUser !== true;
  return (
    <div
      className="text-message flex min-h-[20px] flex-col items-start gap-3 overflow-visible [.text-message+&]:mt-5"
      dir="auto"
    >
      {message?.isCreatedByUser === true && <Files message={message} />}
      {children}
      {isAssistant && Array.isArray(attachments) && attachments.length > 0 && (
        <AttachmentGroup attachments={attachments} />
      )}
    </div>
  );
};

export default Container;
