import { MessageCircleDashed, X } from 'lucide-react';
import { useLocalize } from '~/hooks';

interface TemporaryChatProps {
  isTemporaryChat: boolean;
  setIsTemporaryChat: (value: boolean) => void;
}

export const TemporaryChat = ({ isTemporaryChat, setIsTemporaryChat }: TemporaryChatProps) => {
  const localize = useLocalize();

  if (!isTemporaryChat) {
    return null;
  }

  return (
    <div className="divide-token-border-light m-1.5 flex flex-col divide-y overflow-hidden rounded-b-lg rounded-t-2xl bg-surface-secondary-alt">
      <div className="flex items-start gap-4 py-2.5 pl-3 pr-1.5 text-sm">
        <span className="mt-0 flex h-6 w-6 shrink-0 items-center justify-center">
          <div className="icon-md">
            <MessageCircleDashed className="icon-md" aria-hidden="true" />
          </div>
        </span>
        <span className="text-token-text-secondary line-clamp-3 flex-1 py-0.5 font-semibold">
          {localize('com_ui_temporary_chat')}
        </span>
        <button
          className="text-token-text-secondary shrink-0"
          type="button"
          aria-label="Close temporary chat"
          onClick={() => setIsTemporaryChat(false)}
        >
          <X className="pr-1" />
        </button>
      </div>
    </div>
  );
};
