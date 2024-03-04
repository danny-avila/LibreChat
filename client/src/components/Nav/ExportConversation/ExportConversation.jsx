import { useState, forwardRef } from 'react';
import { useRecoilValue } from 'recoil';
import { Download } from 'lucide-react';
import ExportModal from './ExportModal';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils/';
import store from '~/store';

const ExportConversation = forwardRef(() => {
  const [open, setOpen] = useState(false);
  const localize = useLocalize();

  const conversation = useRecoilValue(store.conversation) || {};

  const exportable =
    conversation?.conversationId &&
    conversation?.conversationId !== 'new' &&
    conversation?.conversationId !== 'search';

  const clickHandler = () => {
    if (exportable) {
      setOpen(true);
    }
  };

  return (
    <>
      <button
        className={cn(
          'flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700',
          exportable ? 'cursor-pointer text-white' : 'cursor-not-allowed text-gray-400',
        )}
        onClick={clickHandler}
      >
        <Download size={16} />
        {localize('com_nav_export_conversation')}
      </button>

      <ExportModal open={open} onOpenChange={setOpen} />
    </>
  );
});

export default ExportConversation;
