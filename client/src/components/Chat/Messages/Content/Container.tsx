import { TMessage } from 'librechat-data-provider';
import Files from './Files';
import { cn } from '~/utils';

const Container = ({
  children,
  message,
  className,
}: {
  children: React.ReactNode;
  message: TMessage;
  className?: string;
}) => (
  <div
    className={cn(
      'text-message flex min-h-[20px] flex-col items-start gap-3 overflow-x-auto [.text-message+&]:mt-5',
      className,
    )}
  >
    {message.isCreatedByUser && <Files message={message} />}
    {children}
  </div>
);

export default Container;
