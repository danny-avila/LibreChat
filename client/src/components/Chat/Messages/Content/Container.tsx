import { TMessage } from 'librechat-data-provider';
import BklMessageMeta from './BklMessageMeta';
import Files from './Files';

const Container = ({ children, message }: { children: React.ReactNode; message?: TMessage }) => (
  <div
    className="text-message flex min-h-[20px] flex-col items-start gap-3 overflow-visible [.text-message+&]:mt-5"
    dir="auto"
  >
    {message?.isCreatedByUser === true && <Files message={message} />}
    {message?.isCreatedByUser === true && <BklMessageMeta message={message} />}
    {children}
  </div>
);

export default Container;
