import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TMessage } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
export default function SearchButtons({ message }: { message: TMessage }) {
  const localize = useLocalize();
  const navigate = useNavigate();

  if (!message.conversationId) {
    return null;
  }

  return (
    <div className="visible mt-0 flex justify-center gap-1 self-end text-gray-400 lg:justify-start">
      <button
        className="ml-0 flex items-center gap-1.5 rounded-md p-1 text-xs hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400"
        onClick={() => {
          navigate(`/c/${message.conversationId}`);
        }}
        type="button"
        title={localize('com_ui_go_to_conversation')}
      >
        <ExternalLink className="icon-md" />
      </button>
    </div>
  );
}
